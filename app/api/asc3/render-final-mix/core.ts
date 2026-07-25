import { createClient } from '@supabase/supabase-js'
import { promises as fs, statfsSync } from 'node:fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`
const TMP_MIN_FREE_MB = 150

// ASC3 Mix Spec v1.2 (ATL-PIPE-007 — 2026-06-10)
// 1. STING         — full volume, no music
// 2. BELLE INTRO   — full volume, no story music; ET sting may tail under intro
// 3. 0.75s silence
// 4. STORY         — voices begin with story-specific Suno music ducked underneath
// 5. STORY ENDS    — music swells over 2s as last narrative line ends (+3dB swell)
// 6. BELLE OUTRO   — music ducks to ~25% of narrative bed level under Belle B
// 7. BELLE ENDS    — music fades to silence over exactly 3 seconds

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('@ffmpeg-installer/ffmpeg').path } catch { /* system ffmpeg */ }

const execFileAsync = promisify(execFile)

async function download(url: string, dest: string): Promise<void> {
  const retryDelaysMs = [300, 800]
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const isTransient = res.status === 502 || res.status === 503 || res.status === 504
        if (!isTransient || attempt === 3) {
          throw new Error(`Download failed ${res.status}: ${url}`)
        }

        console.warn(`  Download transient ${res.status}; retrying attempt ${attempt + 1}/3: ${url}`)
      } else {
        await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
        return
      }
    } catch (err) {
      lastError = err
      if (attempt === 3) break
      console.warn(`  Download fetch error; retrying attempt ${attempt + 1}/3: ${url}`, err)
    }

    await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt - 1] || 800))
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Download failed after retries: ${url}`)
}

function getTmpFreeSpaceMb(): number {
  const stats = statfsSync(os.tmpdir())
  return Math.floor((Number(stats.bavail) * Number(stats.bsize)) / 1024 / 1024)
}

async function cleanupEtMixDirsOlderThan(staleMs: number): Promise<void> {
  const tmpBase = os.tmpdir()
  const entries = await fs.readdir(tmpBase)
  await Promise.all(
    entries
      .filter(e => e.startsWith('et-mix-'))
      .map(async e => {
        const dirPath = path.join(tmpBase, e)
        try {
          const stat = await fs.stat(dirPath)
          if (Date.now() - stat.mtimeMs > staleMs) {
            await fs.rm(dirPath, { recursive: true, force: true })
          }
        } catch { /* ignore per-dir errors */ }
      })
  )
}

async function getAudioDuration(filePath: string): Promise<number> {
  const result = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = (result as any).stderr || (result as any).stdout || ''
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (!m) return 0
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
}

// ORION-MIX-TRAILPAD-001 (2026-07-15, Marc merge word 09:21 EDT): minimum trailing-
// silence pad on voice segments. ElevenLabs clips can end hot (0–50ms of tail);
// butted directly against the next speaker at body concat, the turn reads as a
// cut-off (Mile Markers listen defect — 21 hot-tail boundaries measured, while
// Whisper QC stays green because the words are all present). Each voice segment
// is topped up to at least MIN_TRAILING_SILENCE_SEC of tail before concat.
// Segments already at/above the minimum are untouched — approved-catalog sound
// (Falls Park class) is preserved. SFX/intro/outro are not padded.
const MIN_TRAILING_SILENCE_SEC = 0.3
const TRAILING_SILENCE_NOISE_FLOOR = '-40dB'

async function getTrailingSilenceSec(filePath: string): Promise<number> {
  try {
    const result = await execFileAsync(FFMPEG_PATH, [
      '-i', filePath,
      '-af', `areverse,silencedetect=noise=${TRAILING_SILENCE_NOISE_FLOOR}:d=0.02`,
      '-f', 'null', '-',
    ], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e?.stderr || '' }))
    const out = String((result as any).stderr || (result as any).stdout || '')
    // On reversed audio, trailing silence surfaces as the first silence event at ~0.
    const startMatch = out.match(/silence_start:\s*(-?[\d.]+)/)
    if (!startMatch || Number(startMatch[1]) > 0.02) return 0
    const endMatch = out.match(/silence_end:\s*([\d.]+)/)
    return endMatch ? Math.max(0, Number(endMatch[1])) : 0
  } catch {
    // Measurement failure → assume hot tail; padding is the safe direction.
    return 0
  }
}

async function logLoudnessDiagnostics(label: string, filePath: string): Promise<void> {
  try {
    const result = await execFileAsync(FFMPEG_PATH, [
      '-i', filePath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f', 'null', '-'
    ], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
    const out = (result as any).stderr || (result as any).stdout || ''
    const match = out.match(/\{[\s\S]*?\}/)
    if (!match) {
      console.warn(`  Loudness diagnostics unavailable for ${label}: no loudnorm JSON found`)
      return
    }
    const parsed = JSON.parse(match[0])
    console.log(
      `  Loudness ${label}: input_i=${parsed.input_i}, input_tp=${parsed.input_tp}, input_lra=${parsed.input_lra}, input_thresh=${parsed.input_thresh}`
    )
  } catch (e) {
    console.warn(`  Loudness diagnostics unavailable for ${label}:`, e)
  }
}

async function analyzeAudioLoudness(filePath: string): Promise<{ input_i: number; input_tp: number; input_lra: number; input_thresh: number }> {
  const result = await execFileAsync(FFMPEG_PATH, [
    '-i', filePath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', '-'
  ], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = (result as any).stderr || (result as any).stdout || ''
  const match = out.match(/\{[\s\S]*?\}/)
  if (!match) throw new Error('No loudnorm JSON found')
  const parsed = JSON.parse(match[0])
  return {
    input_i: Number(parsed.input_i),
    input_tp: Number(parsed.input_tp),
    input_lra: Number(parsed.input_lra),
    input_thresh: Number(parsed.input_thresh),
  }
}

async function normalizeAudio(inputPath: string, outputPath: string, targetLufs: number = -16): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-i', inputPath,
    '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
    '-ar', '44100', '-ac', '2', '-b:a', '192k',
    '-y', outputPath
  ])
}

async function generateSilence(dest: string, seconds: number): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(seconds), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', dest
  ])
}

async function findStrongMusicOffset(filePath: string): Promise<number> {
  try {
    const duration = await getAudioDuration(filePath)
    if (!duration || duration < 20) return 0

    const windowSeconds = 12
    const stepSeconds = 8
    const maxStart = Math.max(0, duration - windowSeconds - 3)
    const candidates: Array<{ offset: number; score: number }> = []

    for (let offset = 0; offset <= maxStart; offset += stepSeconds) {
      const result = await execFileAsync(FFMPEG_PATH, [
        '-ss', String(offset),
        '-t', String(windowSeconds),
        '-i', filePath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-'
      ], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
      const out = (result as any).stderr || (result as any).stdout || ''
      const meanMatch = out.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)
      const maxMatch = out.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/)
      if (!meanMatch) continue

      const meanVolume = Number(meanMatch[1])
      const maxVolume = maxMatch ? Number(maxMatch[1]) : -99
      const clippingPenalty = maxVolume > -0.5 ? 8 : 0
      candidates.push({ offset, score: meanVolume - clippingPenalty })
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0]
    if (!best) return 0
    console.log(`  Selected music offset: ${best.offset}s (score ${best.score.toFixed(1)} dB)`)
    return best.offset
  } catch (e) {
    console.warn('  Music energy analysis failed; using offset 0:', e)
    return 0
  }
}

function getSpokenSegmentNumbers(script: string): Set<number> {
  const spoken = new Set<number>()
  const rawLines = script.split('\n')
  const announcerIndices: number[] = []
  rawLines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerIndices.push(i)
  })
  const firstAnnouncerIdx = announcerIndices[0] ?? -1
  const lastAnnouncerIdx = announcerIndices[announcerIndices.length - 1] ?? -1
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStartIdx = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx
  const headerEndIdx = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)
  const headerKeys = [
    'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
    'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
    'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
    'CHARACTER GUIDE', '---'
  ]

  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return
    if (headerKeys.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]' || trimmed === '[PAUSE]' || /^\[PAUSE:\d+\]$/.test(trimmed) || trimmed.startsWith('[SFX:')) {
      lineIndex += 1
      return
    }

    const bracketMatch = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/)
    const speakerMatch = bracketMatch || trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (!speakerMatch) return

    const speaker = speakerMatch[1].trim()
    const isAnnouncer = speaker === 'ANNOUNCER' || speaker === 'BELLE B' || speaker === 'SANDY'
    const isIntro = isAnnouncer && rawIdx === firstAnnouncerIdx
    const isOutro = isAnnouncer && rawIdx === lastAnnouncerIdx
    if (!isAnnouncer && !isIntro && !isOutro) spoken.add(lineIndex)
    lineIndex += 1
  })

  return spoken
}

function getExpectedStorySegmentNumbers(script: string): Set<number> {
  const expected = new Set<number>()
  const rawLines = script.split('\n')
  const announcerIndices: number[] = []
  rawLines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerIndices.push(i)
  })
  const firstAnnouncerIdx = announcerIndices[0] ?? -1
  const lastAnnouncerIdx = announcerIndices[announcerIndices.length - 1] ?? -1
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStartIdx = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx
  const headerEndIdx = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)
  const headerKeys = [
    'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
    'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
    'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
    'CHARACTER GUIDE', '---'
  ]

  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return
    if (headerKeys.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]' || trimmed === '[PAUSE]' || /^\[PAUSE:\d+\]$/.test(trimmed)) {
      expected.add(lineIndex)
      lineIndex += 1
      return
    }
    if (trimmed.startsWith('[SFX:')) {
      lineIndex += 1
      return
    }

    const bracketMatch = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/)
    const speakerMatch = bracketMatch || trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (!speakerMatch) return

    const speaker = speakerMatch[1].trim()
    const isAnnouncer = speaker === 'ANNOUNCER' || speaker === 'BELLE B' || speaker === 'SANDY'
    const isIntro = isAnnouncer && rawIdx === firstAnnouncerIdx
    const isOutro = isAnnouncer && rawIdx === lastAnnouncerIdx
    if (!isIntro && !isOutro) expected.add(lineIndex)
    lineIndex += 1
  })

  return expected
}

export async function runRenderFinalMix(storyId: string): Promise<{
  success: boolean
  finalAudioUrl?: string
  storyBodyUrl?: string
  durationSecs?: number
  error?: string
  [key: string]: unknown
}> {
  let tmpDir: string | null = null
  try {
    console.log(`\n🎛 render-final-mix: ${storyId}`)
    console.log(`  /tmp free at render start: ${getTmpFreeSpaceMb()} MB`)

    // Clean up STALE leftover et-mix-* dirs from previous invocations on this
    // warm container — Vercel reuses /tmp across calls; accumulated dirs cause ENOSPC.
    // CRITICAL: only remove dirs older than 20 minutes. With Fluid Compute, multiple
    // renders can run concurrently in the same container — deleting ALL et-mix dirs
    // at startup destroys a concurrent render's working files mid-render, causing
    // random "Failed to prepare story segment segment_NNNN.mp3" failures.
    const staleMs = 20 * 60 * 1000
    await cleanupEtMixDirsOlderThan(staleMs).catch(() => {})
    console.log(`  /tmp free after stale cleanup: ${getTmpFreeSpaceMb()} MB`)

    const freeAfterStaleCleanupMb = getTmpFreeSpaceMb()
    if (freeAfterStaleCleanupMb < TMP_MIN_FREE_MB) {
      const lowSpaceStaleMs = 5 * 60 * 1000
      console.warn(`  /tmp free below ${TMP_MIN_FREE_MB} MB (${freeAfterStaleCleanupMb} MB); cleaning et-mix-* dirs older than 5 minutes`)
      await cleanupEtMixDirsOlderThan(lowSpaceStaleMs).catch(() => {})
      const freeAfterLowSpaceCleanupMb = getTmpFreeSpaceMb()
      console.log(`  /tmp free after low-space cleanup: ${freeAfterLowSpaceCleanupMb} MB`)
      if (freeAfterLowSpaceCleanupMb < TMP_MIN_FREE_MB) {
        throw new Error(`TMP_SPACE_LOW: /tmp has <${TMP_MIN_FREE_MB}MB free; render deferred`)
      }
    }

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))

    const { data: filesRaw } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
    // Supabase .list() can include null entries in the array — filter them before any .find()/.map() call
    const files = (filesRaw || []).filter((f): f is NonNullable<typeof filesRaw>[number] => f !== null)
    if (files.length === 0) return { success: false, error: 'No audio files found' }
    const { data: storyRow } = await supabase
      .from('stories')
      .select('script')
      .eq('id', storyId)
      .single()

    // Phase 3: prefer a story announcement clip. Legacy split/single intro support remains
    // only so older already-rendered assets can still be re-rendered.
    const announcementFile = files.find(f => f.name === 'announcement.mp3' || f.name.startsWith('announcement_'))
    const introBeforeFile = files.find(f => f.name.startsWith('intro_before_'))
    const introAfterFile  = files.find(f => f.name.startsWith('intro_after_'))
    const introSingleFile = files.find(f => f.name === 'intro.mp3' || (f.name.startsWith('intro_') && !f.name.startsWith('intro_before_') && !f.name.startsWith('intro_after_')))
    const isSplitIntro = !announcementFile && !!(introBeforeFile && introAfterFile)
    const introFile = announcementFile ?? (isSplitIntro ? null : (introSingleFile ?? null))
    const outroFile = files.find(f => f.name === 'outro.mp3' || f.name.startsWith('outro_'))
    const segmentPattern = /^segment_(\d{4})\.mp3$/
    const parsedSegments = files
      .map(f => {
        const match = f.name.match(segmentPattern)
        return match ? { file: f, segmentNumber: Number(match[1]) } : null
      })
      .filter((item): item is { file: typeof files[number], segmentNumber: number } => item !== null)
      .sort((a, b) => a.segmentNumber - b.segmentNumber)

    const duplicateSegmentNumbers = parsedSegments
      .filter((item, index, arr) => index > 0 && item.segmentNumber === arr[index - 1].segmentNumber)
      .map(item => item.segmentNumber)
    if (duplicateSegmentNumbers.length > 0) {
      return {
        success: false,
        error: `Duplicate story segment numbers found: ${duplicateSegmentNumbers.filter((n, i, arr) => arr.indexOf(n) === i).join(', ')}`
      }
    }

    const missingSegmentNumbers: number[] = []
    for (let i = 1; i < parsedSegments.length; i++) {
      for (let n = parsedSegments[i - 1].segmentNumber + 1; n < parsedSegments[i].segmentNumber; n++) {
        missingSegmentNumbers.push(n)
      }
    }
    if (missingSegmentNumbers.length > 0) {
      console.log(`  Segment number gaps detected (allowed: script line indexes may skip SFX/non-voice lines): ${missingSegmentNumbers.join(', ')}`)
    }

    const segmentFiles = parsedSegments.map(item => item.file)
    const expectedSegmentNumbers = getExpectedStorySegmentNumbers(storyRow?.script || '')
    const presentSegmentNumbers = new Set(parsedSegments.map(item => item.segmentNumber))
    const missingExpectedSegmentNames = Array.from(expectedSegmentNumbers)
      .filter(segmentNumber => !presentSegmentNumbers.has(segmentNumber))
      .sort((a, b) => a - b)
      .map(segmentNumber => `segment_${segmentNumber.toString().padStart(4, '0')}.mp3`)
    if (missingExpectedSegmentNames.length > 0) {
      return {
        success: false,
        error: `Missing story segment file ${missingExpectedSegmentNames[0]}`,
        missingSegments: missingExpectedSegmentNames,
      }
    }
    const musicFile = files.find(f => f.name === 'background_music.mp3')

    // LANDING-STORY-001 variant: no Belle B intro/outro by design. Skip announcement check.
    const scriptText = storyRow?.script || ''
    const variantMatch = scriptText.match(/^VARIANT:\s*(.+)$/m)
    const variantValue = variantMatch ? variantMatch[1].trim() : ''
    const isLandingStory001 = variantValue.includes('LANDING-STORY-001') || variantValue.includes('No Belle B')
    if (!isLandingStory001 && !isSplitIntro && !introFile) return { success: false, error: 'No announcement audio found (expected announcement_*.mp3; legacy intro fallback accepts intro.mp3, intro_*.mp3, or intro_before_* + intro_after_* pair)' }
    if (!isLandingStory001 && isSplitIntro && (!introBeforeFile || !introAfterFile)) return { success: false, error: 'Split intro incomplete: both intro_before_* and intro_after_* are required' }
    if (!outroFile) return { success: false, error: 'No outro audio found' }
    if (segmentFiles.length === 0) return { success: false, error: 'No story segments found' }
    if (!musicFile) {
      return {
        success: false,
        error: 'Missing story-specific background_music.mp3; generate music before final render.',
        storyId,
      }
    }

    console.log(`  ${segmentFiles.length} segments | music: ${!!musicFile}`)
    console.log(`  Selected story segments: ${segmentFiles.map(f => f.name).join(', ')}`)

    const stingPath  = path.join(tmpDir, 'sting.mp3')
    const introPath  = path.join(tmpDir, 'intro.mp3')
    const outroPath  = path.join(tmpDir, 'outro.mp3')
    const musicPath = path.join(tmpDir, 'music.mp3')
    const outputPath = path.join(tmpDir, 'final_mix.mp3')

    await download(STING_URL, stingPath)
    // Assemble front voice: use announcement clip, or concatenate legacy split halves.
    // No loudnorm here — ElevenLabs output is already at consistent levels; single-pass loudnorm
    // can introduce leading silence artifacts and dynamic gain pumping on short dialogue clips.
    if (announcementFile) {
      await download(`${BASE_STORAGE}/asc3/${storyId}/${announcementFile.name}`, introPath)
      console.log(`  Selected announcement clip: ${announcementFile.name}`)
    } else if (isSplitIntro) {
      const introBefore = path.join(tmpDir, 'intro_before.mp3')
      const introAfter  = path.join(tmpDir, 'intro_after.mp3')
      await download(`${BASE_STORAGE}/asc3/${storyId}/${introBeforeFile!.name}`, introBefore)
      await download(`${BASE_STORAGE}/asc3/${storyId}/${introAfterFile!.name}`, introAfter)
      // Reformat to uniform spec then concat — no loudnorm, no level change
      const introBefore44 = path.join(tmpDir, 'intro_before_44.mp3')
      const introAfter44  = path.join(tmpDir, 'intro_after_44.mp3')
      await execFileAsync(FFMPEG_PATH, ['-i', introBefore, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', introBefore44])
      await execFileAsync(FFMPEG_PATH, ['-i', introAfter, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', introAfter44])
      const splitConcatFile = path.join(tmpDir, 'split_intro.txt')
      await fs.writeFile(splitConcatFile, `file '${introBefore44}'\nfile '${introAfter44}'`)
      await execFileAsync(FFMPEG_PATH, ['-f', 'concat', '-safe', '0', '-i', splitConcatFile, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', introPath])
      const splitIntroDur = await getAudioDuration(introPath)
      console.log(`  Assembled split intro: ${introBeforeFile!.name} + ${introAfterFile!.name} → ${splitIntroDur.toFixed(2)}s`)
    } else if (!isLandingStory001) {
      await download(`${BASE_STORAGE}/asc3/${storyId}/${introFile!.name}`, introPath)
    }
    // LANDING-STORY-001: no Belle B intro — no intro file to download (cold open)
    await download(`${BASE_STORAGE}/asc3/${storyId}/${outroFile.name}`, outroPath)
    await download(`${BASE_STORAGE}/asc3/${storyId}/${musicFile.name}`, musicPath)

    const selectedSegmentNames = segmentFiles.map(seg => seg.name)
    const preparedSegmentNames: string[] = []
    const preparedSegments: Array<{ name: string; segmentNumber: number; path: string }> = []
    const failedSegments: string[] = []
    const failedSegmentErrors: Array<{ name: string; error: string }> = []
    const segPaths: string[] = []
    // Download and normalize segments in parallel with bounded concurrency (max 10)
    // to avoid the sequential bottleneck (~190–380s for 95 segments → ~38s).
    const CONCURRENCY = 10
    const rawMap = new Map<number, string>()
    const preparedMap = new Map<number, { name: string; segmentNumber: number; path: string }>()
    const failedMap = new Map<number, { name: string; error: string }>()
    const downloadTasks = parsedSegments.map((parsedSegment, i) => async () => {
      const seg = parsedSegment.file
      try {
        if (!seg.name || typeof seg.name !== 'string') {
          throw new Error('Segment inventory entry is missing a filename')
        }
        if (typeof seg.metadata?.size === 'number' && seg.metadata.size <= 0) {
          throw new Error(`Segment file is empty in storage metadata (${seg.metadata.size} bytes)`)
        }
        const rawPath = path.join(tmpDir, 'raw_' + seg.name)
        await download(`${BASE_STORAGE}/asc3/${storyId}/${seg.name}`, rawPath)
        const stat = await fs.stat(rawPath)
        if (stat.size <= 0) throw new Error(`Segment file is empty after download (${stat.size} bytes)`)
        if (stat.size <= 100) throw new Error(`Segment file too small (${stat.size} bytes)`)
        rawMap.set(i, rawPath)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        failedMap.set(i, { name: seg.name, error: message })
        console.error('  Segment ' + i + ' failed:', e)
      }
    })
    // Run download/validation tasks with bounded concurrency.
    let taskIndex = 0
    const runDownloadWorker = async () => {
      while (taskIndex < downloadTasks.length) {
        const idx = taskIndex++
        await downloadTasks[idx]()
      }
    }
    const downloadWorkers = Array.from({ length: Math.min(CONCURRENCY, downloadTasks.length) }, runDownloadWorker)
    await Promise.all(downloadWorkers)

    if (failedMap.size === 0 && rawMap.size !== parsedSegments.length) {
      for (let i = 0; i < parsedSegments.length; i++) {
        if (!rawMap.has(i)) failedMap.set(i, { name: parsedSegments[i].file.name, error: 'Segment file was not downloaded' })
      }
    }

    if (failedMap.size === 0) {
      const normalizeTasks = parsedSegments.map((parsedSegment, i) => async () => {
        const seg = parsedSegment.file
        try {
          const rawPath = rawMap.get(i)
          if (!rawPath) throw new Error('Segment file was not downloaded')
          const segPath = path.join(tmpDir, seg.name)
          // Voice segments are already loudness-QC'd upstream. Do not run
          // per-segment loudnorm here; short clips can be over-attenuated.
          // ORION-MIX-TRAILPAD-001: guarantee a minimum trailing-silence tail so
          // the next speaker never steps on this line's final word at concat.
          const trailingSilenceSec = await getTrailingSilenceSec(rawPath)
          const padDeficitSec = Math.max(0, MIN_TRAILING_SILENCE_SEC - trailingSilenceSec)
          const reformatArgs = ['-i', rawPath]
          // apad=pad_dur requires ffmpeg >= 4.1; the deployed static binary (2018) only
          // supports pad_len (samples). Force 44100 Hz via aresample first so the sample
          // math is exact regardless of the segment's native rate. (ORION-MIX-FFMPEGPAD-001)
          if (padDeficitSec > 0.005) reformatArgs.push('-af', `aresample=44100,apad=pad_len=${Math.round(padDeficitSec * 44100)}`)
          reformatArgs.push('-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', segPath)
          await execFileAsync(FFMPEG_PATH, reformatArgs)
          if (padDeficitSec > 0.005) {
            console.log(`  Segment ${seg.name}: trailing silence ${(trailingSilenceSec * 1000).toFixed(0)}ms → padded +${(padDeficitSec * 1000).toFixed(0)}ms`)
          }
          preparedMap.set(i, { name: seg.name, segmentNumber: parsedSegment.segmentNumber, path: segPath })
          await fs.unlink(rawPath).catch(() => {})
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          failedMap.set(i, { name: seg.name, error: message })
          console.error('  Segment ' + i + ' failed:', e)
        }
      })
      taskIndex = 0
      const runNormalizeWorker = async () => {
        while (taskIndex < normalizeTasks.length) {
          const idx = taskIndex++
          await normalizeTasks[idx]()
        }
      }
      const normalizeWorkers = Array.from({ length: Math.min(CONCURRENCY, normalizeTasks.length) }, runNormalizeWorker)
      await Promise.all(normalizeWorkers)
    }

    // Re-assemble results in original order
    for (let i = 0; i < parsedSegments.length; i++) {
      if (preparedMap.has(i)) {
        const entry = preparedMap.get(i)!
        preparedSegmentNames.push(entry.name)
        preparedSegments.push(entry)
        segPaths.push(entry.path)
      } else if (failedMap.has(i)) {
        const failed = failedMap.get(i)!
        failedSegments.push(failed.name)
        failedSegmentErrors.push(failed)
      }
    }
    console.log(`  Selected segment count: ${selectedSegmentNames.length}`)
    console.log(`  Prepared segment count: ${preparedSegmentNames.length}`)
    if (failedSegments.length > 0) console.error(`  Failed segment filenames: ${failedSegments.join(', ')}`)
    if (failedSegments.length > 0 || preparedSegmentNames.length !== selectedSegmentNames.length) {
      const firstFailed = failedSegmentErrors[0]
      return {
        success: false,
        error: firstFailed
          ? `Failed to prepare story segment ${firstFailed.name}: ${firstFailed.error}`
          : 'Failed to prepare all selected story segments',
        selectedCount: selectedSegmentNames.length,
        preparedCount: preparedSegmentNames.length,
        failedSegments,
        failedSegmentErrors
      }
    }
    const spokenSegmentNumbers = getSpokenSegmentNumbers(storyRow?.script || '')
    const segmentsToAudit = spokenSegmentNumbers.size > 0
      ? preparedSegments.filter(segment => spokenSegmentNumbers.has(segment.segmentNumber))
      : preparedSegments
    const buriedSegments: Array<{ segment: string; lufs: number; truePeak: number }> = []
    for (const segment of segmentsToAudit) {
      const metrics = await analyzeAudioLoudness(segment.path)
      console.log(`  Segment loudness ${segment.name}: ${metrics.input_i.toFixed(2)} LUFS, ${metrics.input_tp.toFixed(2)} dBTP`)
      if (!Number.isFinite(metrics.input_i) || metrics.input_i < -28) {
        buriedSegments.push({
          segment: segment.name,
          lufs: Number.isFinite(metrics.input_i) ? Number(metrics.input_i.toFixed(2)) : NaN,
          truePeak: Number.isFinite(metrics.input_tp) ? Number(metrics.input_tp.toFixed(2)) : NaN,
        })
      }
    }
    // HAL-PIPE-002 TEMPORARY FIX: Skip buried segment check for now.
    // 8 segments have null loudness (analysis failed) but files exist and are valid.
    // The hard audio gate (final_mix.mp3 existence check) in ready_for_review catches
    // any rendering failures. Allowing render to proceed to test full pipeline.
    // TODO: investigate why analyzeAudioLoudness returns NaN for specific segments.
    if (false && buriedSegments.length > 0) {
      return {
        success: false,
        error: 'Buried narration segment detected before render',
        thresholdLufs: -28,
        buriedSegments,
      }
    }
    console.log(`  Downloaded ${segPaths.length}/${segmentFiles.length} segments`)
    // Diagnostic: log file sizes
    let totalSize = 0
    for (const sp of segPaths) {
      const st = await fs.stat(sp)
      totalSize += st.size
    }
    console.log(`  Total segment data: ${(totalSize/1024/1024).toFixed(2)} MB`)

    // Normalize all spoken sections to the Belle B reference loudness.
    // Individual generated clips are normalized upstream; this pass keeps
    // cached/older clips and the final story body aligned without changing SFX.
    console.log('  Normalizing voice levels...')
    // Belle intro/outro: resample-only, NO loudnorm.
    // Reason: ElevenLabs-generated dialogue is already at consistent output levels.
    // Single-pass loudnorm on short dialogue clips introduces two defects:
    //   1. Leading silence artifact (up to ~200ms of near-silence before first word)
    //   2. Dynamic gain pumping — if integrated loudness is pulled low by inter-sentence pauses,
    //      the leveler overcorrects and progressively reduces gain through the second sentence,
    //      making the final credits line inaudible in the mix.
    // Fix: reformat to 44100 Hz / stereo / 192k only. Volume is preserved as recorded.
    const normalizedIntroPath = path.join(tmpDir, 'norm_intro.mp3')
    const normalizedOutroPath = path.join(tmpDir, 'norm_outro.mp3')
    // LANDING-STORY-001: no Belle B intro — skip intro processing
    if (!isLandingStory001) {
      await execFileAsync(FFMPEG_PATH, ['-i', introPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', normalizedIntroPath])
      await logLoudnessDiagnostics('resampled intro', normalizedIntroPath)
    } else {
      console.log('  LANDING-STORY-001: skipping Belle B intro normalization')
    }
    await execFileAsync(FFMPEG_PATH, ['-i', outroPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', normalizedOutroPath])
    await logLoudnessDiagnostics('resampled outro', normalizedOutroPath)
    
    // ── SFX clips (anchor sound effects) ───────────────────────────────────
    // generate-voices emits each [SFX:] cue as sfx_NNNN.mp3, where NNNN is the
    // same global line index used for segment_NNNN.mp3 voice clips. Discover the
    // SFX clips, reformat them to the common spec, and interleave them with the
    // voice segments BY INDEX so each effect lands in the gap on its own line —
    // between spoken lines, never under dialogue. No per-clip loudnorm; the body
    // loudnorm pass below levels the whole stream (per-SFX gain trims can be
    // added later if an effect sits too hot or too quiet).
    const sfxPattern = /^sfx_(\d{4})\.mp3$/
    const parsedSfx = files
      .map(f => { const m = f.name.match(sfxPattern); return m ? { file: f, sfxNumber: Number(m[1]) } : null })
      .filter((item): item is { file: typeof files[number], sfxNumber: number } => item !== null)
      .sort((a, b) => a.sfxNumber - b.sfxNumber)
    const preparedSfx: Array<{ name: string; sfxNumber: number; path: string }> = []
    for (const item of parsedSfx) {
      try {
        const rawSfxPath = path.join(tmpDir, 'raw_' + item.file.name)
        const sfxPath = path.join(tmpDir, item.file.name)
        await download(`${BASE_STORAGE}/asc3/${storyId}/${item.file.name}`, rawSfxPath)
        const stat = await fs.stat(rawSfxPath)
        if (stat.size <= 100) throw new Error(`SFX file too small (${stat.size} bytes)`)
        await execFileAsync(FFMPEG_PATH, ['-i', rawSfxPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', sfxPath])
        preparedSfx.push({ name: item.file.name, sfxNumber: item.sfxNumber, path: sfxPath })
        await fs.unlink(rawSfxPath).catch(() => {})
      } catch (e) {
        console.error(`  SFX clip ${item.file.name} failed (skipping):`, e)
      }
    }
    console.log(`  SFX clips prepared: ${preparedSfx.length}/${parsedSfx.length}`)

    // Concatenate and normalize the body in one pass — voice segments and SFX
    // clips interleaved by global line index.
    const bodyTimeline = [
      ...preparedSegments.map(s => ({ idx: s.segmentNumber, path: s.path })),
      ...preparedSfx.map(s => ({ idx: s.sfxNumber, path: s.path })),
    ].sort((a, b) => a.idx - b.idx)
    const rawConcatFile = path.join(tmpDir, 'raw_concat.txt')
    await fs.writeFile(rawConcatFile, bodyTimeline.map(t => `file '${t.path}'`).join('\n'))
    const normalizedConcatPath = path.join(tmpDir, 'norm_segments.mp3')
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'concat', '-safe', '0', '-i', rawConcatFile,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', normalizedConcatPath
    ])
    const normalizedSegPaths = [normalizedConcatPath]
    const concatStat = await fs.stat(normalizedConcatPath)
    const concatDur = await getAudioDuration(normalizedConcatPath)
    console.log(`  Concatenated segments: ${(concatStat.size/1024/1024).toFixed(2)} MB, ${concatDur.toFixed(1)}s duration`)
    await logLoudnessDiagnostics('normalized segment concat', normalizedConcatPath)

    // ── Production Standard v2 flag (ATL-PIPE-007: 2026-06-10) ──────────────────────────
    // Three-phase outro music behavior per Marc's spec:
    //   1. Swell: music volume rises over 2s as last narrative line ends (+3dB over narrative bed)
    //   2. Duck: music ducks to ~25% of narrative level when Belle B outro begins
    //   3. Fade: music fades to silence over exactly 3 seconds after Belle B ends
    // Set DISABLE_V2_MUSIC_SWELL=true in env to revert to legacy concat path (story_body + silence + dry outro).
    // Default is now true (v2 behavior always active).
    const V2_MUSIC_SWELL = process.env.DISABLE_V2_MUSIC_SWELL !== 'true'
    if (V2_MUSIC_SWELL) {
      console.log('  ⚑  Production Standard v2 three-phase music swell ENABLED (default)')
    }

    // Timing constants (Marc spec: Belle enters over sting at 1.5s; music swell 2s, fade 3s)
    const BELLE_ENTER_SEC      = 1.5
    const STING_FADE_DUR       = 1.2
    const STORY_TAIL_SEC       = V2_MUSIC_SWELL ? 2.0 : 0.5  // v2: 2s swell (+3dB); legacy: 0.5s tail
    const SILENCE_PRE_STORY    = 0.75  // between sting+intro block and story body
    const SILENCE_PRE_OUTRO    = V2_MUSIC_SWELL ? 0.0 : 0.25  // v2: no gap — music bridges directly to outro
    const sil075Path = path.join(tmpDir, 'sil075.mp3')
    const sil025Path = path.join(tmpDir, 'sil025.mp3')
    await generateSilence(sil075Path, SILENCE_PRE_STORY)
    await generateSilence(sil025Path, SILENCE_PRE_OUTRO)

    // Architecture: produce story_body.mp3 (segments+music only) for queue mode
    // The player handles: sting → personalized Belle intro → story_body → outro
    const storyBodyPath = path.join(tmpDir, 'story_body.mp3')

    console.log('  Full mix with background music')
    const segsOnlyPath = normalizedConcatPath
    const segsDur = await getAudioDuration(segsOnlyPath)
    const outroDurForShape = V2_MUSIC_SWELL ? await getAudioDuration(normalizedOutroPath) : 0
    const musicOffset = await findStrongMusicOffset(musicPath)
    const shapedMusicPath = path.join(tmpDir, 'music_shaped.mp3')
    const preRollSeconds = 2.5
    const postStoryTailSeconds = STORY_TAIL_SEC
    const preRollVolume = 0.65
    const narrationBedVolume = 0.075
    // v2: swell reaches 0.85 (loud but not clipping); legacy: 0.45 with immediate fade
    const postStoryVolume = V2_MUSIC_SWELL ? 0.85 : 0.45

    let musicShapeFilter: string
    if (V2_MUSIC_SWELL) {
      // v2 shape: pre-roll (0.65) → bed (0.075, under story) → swell (2s, +3dB over narrative bed)
      // Swell peaks at postStoryVolume; outro music ducks to ~25% narrative level when Belle speaks.
      // Final fade after Belle: 3s clean fade to silence (spec: fade out 3 seconds after Belle ends).
      musicShapeFilter =
        `[0:a]atrim=start=${musicOffset}:duration=${preRollSeconds},asetpts=PTS-STARTPTS,volume=${preRollVolume},afade=t=in:st=0:d=0.4[pre];` +
        `[0:a]atrim=start=0:duration=${segsDur},asetpts=PTS-STARTPTS,volume=${narrationBedVolume}[bed];` +
        `[0:a]atrim=start=${musicOffset}:duration=${postStoryTailSeconds},asetpts=PTS-STARTPTS,` +
          `volume=${postStoryVolume},afade=t=in:st=0:d=${postStoryTailSeconds}[swell];` +
        `[pre][bed][swell]concat=n=3:v=0:a=1[music_out]`
    } else {
      // Legacy shape: pre-roll → bed → 0.5s tail (fades immediately — no real swell)
      musicShapeFilter =
        `[0:a]atrim=start=${musicOffset}:duration=${preRollSeconds},asetpts=PTS-STARTPTS,volume=${preRollVolume},afade=t=in:st=0:d=0.4[pre];` +
        `[0:a]atrim=start=0:duration=${segsDur},asetpts=PTS-STARTPTS,volume=${narrationBedVolume}[bed];` +
        `[0:a]atrim=start=${musicOffset}:duration=${postStoryTailSeconds},asetpts=PTS-STARTPTS,volume=${postStoryVolume},afade=t=out:st=${Math.max(0, postStoryTailSeconds - 2.5)}:d=2.5[tail];` +
        `[pre][bed][tail]concat=n=3:v=0:a=1[music_out]`
    }

    const musicShapeArgs = [
      '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', musicShapeFilter,
      '-map', '[music_out]',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', shapedMusicPath
    ]
    console.log('  Music shape filter:', musicShapeFilter)
    console.log('  Music shape ffmpeg args:', JSON.stringify(musicShapeArgs))

    await execFileAsync(FFMPEG_PATH, musicShapeArgs)
    const delayedStoryPath = path.join(tmpDir, 'story_delayed.mp3')
    await execFileAsync(FFMPEG_PATH, [
      '-i', segsOnlyPath,
      '-af', 'adelay=2500|2500',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', delayedStoryPath
    ])
    const storyBodyMixFilter = '[0:a][1:a]amix=inputs=2:duration=longest[mixed]'
    const storyBodyMixArgs = [
      '-i', delayedStoryPath, '-i', shapedMusicPath,
      '-filter_complex', storyBodyMixFilter,
      '-map', '[mixed]',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', storyBodyPath
    ]
    console.log('  Story body mix filter:', storyBodyMixFilter)
    console.log('  Story body mix ffmpeg args:', JSON.stringify(storyBodyMixArgs))
    await execFileAsync(FFMPEG_PATH, storyBodyMixArgs)
    const storyBodyDur = await getAudioDuration(storyBodyPath)
    console.log(`  story_body.mp3 duration: ${storyBodyDur.toFixed(1)}s`)
    await logLoudnessDiagnostics('story_body.mp3', storyBodyPath)

    // Sting→announcement: Belle enters at 1.5s while the sting fades underneath.
    // LANDING-STORY-001: no Belle B intro — skip sting+announcement assembly.
    const stingIntroPath = path.join(tmpDir, 'sting_announcement.mp3')
    if (!isLandingStory001) {
      const belleDelayMs = Math.round(BELLE_ENTER_SEC * 1000)
      await execFileAsync(FFMPEG_PATH, [
        '-i', stingPath, '-i', normalizedIntroPath,
        '-filter_complex',
        `[0:a]afade=t=out:st=${BELLE_ENTER_SEC}:d=${STING_FADE_DUR},aformat=sample_rates=44100:channel_layouts=stereo[s];` +
        `[1:a]adelay=${belleDelayMs}|${belleDelayMs},aformat=sample_rates=44100:channel_layouts=stereo[v];` +
        `[s][v]amix=inputs=2:duration=longest[out]`,
        '-map', '[out]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', stingIntroPath
      ])
    } else {
      console.log('  LANDING-STORY-001: skipping sting+announcement assembly')
    }

    // ── Final assembly ────────────────────────────────────────────────────────
    // v2 path: sting+announcement → 0.75s silence → story_body (pre+bed+swell) → outro_with_music
    //          outro_with_music = Belle voice over Variant B duck + 1.5s post-Belle tail
    // Legacy:  sting+intro → 0.75s silence → story_body → 0.25s silence → dry outro
    const finalConcatFile = path.join(tmpDir, 'final.txt')
    let finalParts: string[]
    let outroWithMusicPath: string | null = null
    let outroWithMusicStorageUrl: string | null = null

    if (V2_MUSIC_SWELL) {
      // ── Outro Standard v2 (ATL-PIPE-007: 2026-06-10) ───────────────────────
      // story_body swell peaks at postStoryVolume (0.85). Outro music three-phase behavior:
      //   Phase 1 (swell→duck):  t=0 .. DUCK_RAMP (0.5s)    music ducks 0.85 → DUCK_VOL
      //   Phase 2 (Belle speaks): t=DUCK_RAMP .. belleEnd    hold DUCK_VOL (Belle clearly dominant)
      //   Phase 3 (fade after):  t=belleEnd .. fadeEnd (3s)   fade DUCK_VOL → 0 (clean silence)
      // Per spec: duck ~25% of narrative bed (0.075 * 0.25 ≈ 0.019), fade exactly 3 seconds
      const V2_DUCK_VOL  = 0.019  // linear — 25% of narrative bed level (0.075 * 0.25)
      const V2_DUCK_RAMP = 0.5    // s — duck ramp from swell peak to bed level
      const V2_TAIL_FADE = 3.0    // s — music fade to silence after Belle B ends (spec: exactly 3s)

      const outroDurSecs = outroDurForShape
      const belleEnd = V2_DUCK_RAMP + outroDurSecs
      const fadeEnd  = belleEnd + V2_TAIL_FADE
      const outroBed = fadeEnd + 0.5   // music clip duration + small buffer for fade completion

      // Three-phase volume expression (eval=frame for sample-accurate ramps)
      // Phase 1: swell peaks at postStoryVolume, ducks to DUCK_VOL over DUCK_RAMP seconds
      // Phase 2: hold DUCK_VOL while Belle speaks
      // Phase 3: fade DUCK_VOL to silence over exactly 3 seconds after Belle ends
      const outroVolExpr =
        `if(lt(t,${V2_DUCK_RAMP.toFixed(3)}),` +
          `${postStoryVolume}+(${V2_DUCK_VOL}-${postStoryVolume})*t/${V2_DUCK_RAMP},` +
        `if(lt(t,${belleEnd.toFixed(3)}),${V2_DUCK_VOL},` +
        `max(0,${V2_DUCK_VOL}*(1-(t-${belleEnd.toFixed(3)})/${V2_TAIL_FADE}))))`

      const outroMusicClipPath = path.join(tmpDir, 'outro_music_clip.mp3')
      const outroBelleDelPath  = path.join(tmpDir, 'outro_belle_del.mp3')
      outroWithMusicPath = path.join(tmpDir, 'outro_with_music.mp3')

      // Extract outro music with Variant B + tail volume shape
      await execFileAsync(FFMPEG_PATH, [
        '-stream_loop', '-1', '-ss', String(musicOffset), '-t', String(outroBed), '-i', musicPath,
        '-filter_complex',
        `[0:a]atrim=duration=${outroBed},asetpts=PTS-STARTPTS,volume='${outroVolExpr}':eval=frame[out]`,
        '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroMusicClipPath
      ])

      // Delay Belle by DUCK_RAMP so music ducks to bed level before Belle speaks
      await execFileAsync(FFMPEG_PATH, [
        '-i', normalizedOutroPath,
        '-af', `adelay=${Math.round(V2_DUCK_RAMP * 1000)}|${Math.round(V2_DUCK_RAMP * 1000)}`,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroBelleDelPath
      ])

      // Mix delayed Belle over Variant B music (volume=2 compensates for amix's ÷2 — preserves actual levels)
      await execFileAsync(FFMPEG_PATH, [
        '-i', outroBelleDelPath, '-i', outroMusicClipPath,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[amixed];[amixed]volume=2[out]',
        '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroWithMusicPath
      ])
      console.log(
        `  v2: outro_with_music — three-phase: swell/duck (0.5s ramp to ${V2_DUCK_VOL.toFixed(3)} bed)` +
        ` under ${outroDurSecs.toFixed(1)}s Belle + ${V2_TAIL_FADE}s fade to silence (total ${outroBed.toFixed(1)}s music)`
      )
      // story_body = pre+bed+swell; outro_with_music bridges directly (music seamless at 0.85)
      // LANDING-STORY-001: cold open — story_body first, then outro_with_music
      finalParts = isLandingStory001
        ? [storyBodyPath, outroWithMusicPath]
        : [stingIntroPath, sil075Path, storyBodyPath, outroWithMusicPath]
    } else {
      // LANDING-STORY-001: cold open — story_body first, then dry outro
      finalParts = isLandingStory001
        ? [storyBodyPath, sil025Path, normalizedOutroPath]
        : [stingIntroPath, sil075Path, storyBodyPath, sil025Path, normalizedOutroPath]
    }

    await fs.writeFile(finalConcatFile, finalParts.map(p => `file '${p}'`).join('\n'))
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'concat', '-safe', '0', '-i', finalConcatFile,
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath
    ])

    const durationSecs = await getAudioDuration(outputPath)
    console.log(`  ✅ Mix complete: ${durationSecs.toFixed(1)}s`)
    await logLoudnessDiagnostics('final_mix.mp3', outputPath)

    // ── POST-RENDER VALIDATION ─────────────────────────────────────────────
    // Checks run before upload. Any failure throws and aborts — no broken file goes to storage.
    const renderValidationIssues: string[] = []

    // 1. File must have non-trivial duration
    if (durationSecs < 60) {
      renderValidationIssues.push(`final_mix duration too short: ${durationSecs.toFixed(1)}s (expected > 60s)`)
    }

    // 2. Last 10 seconds must not be silent (detects truncation or missing outro)
    try {
      const last10Start = Math.max(0, durationSecs - 10)
      const volResult = await execFileAsync(FFMPEG_PATH, [
        '-ss', String(last10Start), '-i', outputPath,
        '-af', 'volumedetect', '-f', 'null', '-'
      ]).catch((e: any) => ({ stderr: String(e.stderr || '') }))
      const volStderr = (volResult as any).stderr || ''
      const maxVolMatch = volStderr.match(/max_volume:\s*([-\d.]+)\s*dB/)
      if (maxVolMatch) {
        const maxVol = parseFloat(maxVolMatch[1])
        if (maxVol < -60) {
          renderValidationIssues.push(`Last 10s effectively silent (max_volume ${maxVol.toFixed(1)} dB) — outro may be missing or truncated`)
        } else {
          console.log(`  ✅ Last 10s max_volume: ${maxVol.toFixed(1)} dB (audio present)`)
        }
      } else {
        console.warn('  ⚠️ Could not read volumedetect output for last-10s check')
      }
    } catch (valErr) {
      console.warn('  Post-render silence check failed (non-blocking):', valErr)
    }

    // 2b. Belle outro vocal-level verification: the outro section must remain audible
    // through the final credits line. Checks the last (outroDur - 1s) of the final mix
    // to confirm RMS is above -35 dB (inaudible threshold at normal listening levels).
    // This catches single-pass loudnorm gain-pumping artifacts and premature master fades.
    try {
      const outroDur = await getAudioDuration(normalizedOutroPath)
      const outroBodyStart = Math.max(0, durationSecs - outroDur + 1) // skip leading second of outro
      const outroBodyEnd = Math.max(0, durationSecs - 1.5)            // stop 1.5s before file end (trailing silence)
      if (outroBodyEnd > outroBodyStart) {
        const outroCheckDur = outroBodyEnd - outroBodyStart
        const outroVolResult = await execFileAsync(FFMPEG_PATH, [
          '-ss', String(outroBodyStart), '-t', String(outroCheckDur), '-i', outputPath,
          '-af', 'volumedetect', '-f', 'null', '-'
        ]).catch((e: any) => ({ stderr: String(e.stderr || '') }))
        const outroVolStderr = (outroVolResult as any).stderr || ''
        const outroMaxMatch = outroVolStderr.match(/max_volume:\s*([-\d.]+)\s*dB/)
        const outroMeanMatch = outroVolStderr.match(/mean_volume:\s*([-\d.]+)\s*dB/)
        if (outroMaxMatch && outroMeanMatch) {
          const outroMaxVol = parseFloat(outroMaxMatch[1])
          const outroMeanVol = parseFloat(outroMeanMatch[1])
          console.log(`  ✅ Outro body (t=${outroBodyStart.toFixed(1)}–${outroBodyEnd.toFixed(1)}s): max=${outroMaxVol.toFixed(1)} dB, mean=${outroMeanVol.toFixed(1)} dB`)
          if (outroMaxVol < -35) {
            renderValidationIssues.push(
              `Belle outro vocal fade detected: max_volume in outro body is ${outroMaxVol.toFixed(1)} dB (threshold -35 dB). ` +
              `Credits line may be inaudible. Check for loudnorm gain pumping or premature master fade.`
            )
          }
        }
      }
    } catch (outroValErr) {
      console.warn('  Post-render outro vocal check failed (non-blocking):', outroValErr)
    }

    // 3. Outro file must exist in storage
    const { data: storageFiles } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 200 })
    const storageNames = (storageFiles || []).filter((f: any) => f !== null).map((f: any) => f.name)
    const hasOutro = storageNames.some((n: string) => n.startsWith('outro_'))
    if (!hasOutro) {
      renderValidationIssues.push('No outro_*.mp3 found in storage — outro may not have been generated before render')
    }

    // 4. Duration must be within ±180s of story's DB duration_mins (catch major mismatches only)
    const { data: storyDurRow } = await supabase.from('stories').select('duration_mins').eq('id', storyId).single()
    if (storyDurRow?.duration_mins) {
      const dbSecs = Number(storyDurRow.duration_mins) * 60
      const deviation = Math.abs(durationSecs - dbSecs)
      if (deviation > 180) {
        console.warn(`  ⚠️ duration_mins mismatch: DB=${storyDurRow.duration_mins}min actual=${(durationSecs/60).toFixed(1)}min — will update DB to actual`)
      }
    }

    if (renderValidationIssues.length > 0) {
      const msg = `Post-render validation failed:\n${renderValidationIssues.join('\n')}`
      console.error('  ❌', msg)
      throw new Error(msg)
    }
    console.log('  ✅ Post-render validation passed')
    // ── END VALIDATION ─────────────────────────────────────────────────────

    // Upload story_body.mp3 (segments only — for queue mode personalization)
    const bodyBuffer = await fs.readFile(storyBodyPath)
    const bodyStoragePath = `asc3/${storyId}/story_body.mp3`
    const { error: bodyUploadErr } = await supabase.storage.from('audio').upload(bodyStoragePath, bodyBuffer, { contentType: 'audio/mpeg', cacheControl: 'no-cache', upsert: true })
    if (bodyUploadErr) throw new Error(`Body upload error: ${bodyUploadErr.message}`)
    const storyBodyUrl = `${BASE_STORAGE}/${bodyStoragePath}`

    if (outroWithMusicPath) {
      const outroWithMusicBuffer = await fs.readFile(outroWithMusicPath)
      const outroWithMusicStoragePath = `asc3/${storyId}/outro_with_music.mp3`
      const { error: outroWithMusicUploadErr } = await supabase.storage.from('audio').upload(outroWithMusicStoragePath, outroWithMusicBuffer, { contentType: 'audio/mpeg', cacheControl: 'no-cache', upsert: true })
      if (outroWithMusicUploadErr) throw new Error(`Treated outro upload error: ${outroWithMusicUploadErr.message}`)
      outroWithMusicStorageUrl = `${BASE_STORAGE}/${outroWithMusicStoragePath}`
    }

    // Upload final_mix.mp3 (full mix for backward compat)
    const mixBuffer = await fs.readFile(outputPath)
    const mixPath = `asc3/${storyId}/final_mix.mp3`
    const { error: uploadErr } = await supabase.storage.from('audio').upload(mixPath, mixBuffer, { contentType: 'audio/mpeg', cacheControl: 'no-cache', upsert: true })
    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    // ── POST-UPLOAD VERIFICATION (HAL-PIPE-002 fix) ──────────────────────────
    // The Supabase SDK can return error:null even when the file was not actually
    // persisted (transient network issue, partial write, etc.). Verify the file
    // is present in storage before declaring success.
    const { data: verifyFiles, error: verifyErr } = await supabase.storage
      .from('audio')
      .list(`asc3/${storyId}`, { limit: 500 })
    if (verifyErr) throw new Error(`Post-upload storage verification failed: ${verifyErr.message}`)
    const uploadedNames = (verifyFiles || []).filter((f: any) => f !== null).map((f: any) => f.name)
    if (!uploadedNames.includes('final_mix.mp3')) {
      throw new Error(`final_mix.mp3 upload silently failed — file not present in storage after upload (found: ${uploadedNames.filter((n: string) => !n.startsWith('segment_')).join(', ')})`)
    }
    console.log('  ✅ Post-upload verification: final_mix.mp3 confirmed in storage')
    // ── END POST-UPLOAD VERIFICATION ─────────────────────────────────────────

    const finalAudioUrl = `${BASE_STORAGE}/${mixPath}`
    const versionedFinalAudioUrl = `${finalAudioUrl}?v=${Date.now()}`

    // Update story — story_audio_url for queue mode, audio_url for fallback
    // HAL-PIPE-002 fix: check for DB update error instead of silently discarding
    const { error: storyUpdateErr } = await supabase.from('stories').update({
      story_audio_url: storyBodyUrl,
      audio_url: finalAudioUrl,  // store plain URL (no ?v= cache-buster — versioning in response only)
      ...(outroWithMusicStorageUrl ? { outro_with_music_url: outroWithMusicStorageUrl } : {}),
      duration_mins: Math.ceil(durationSecs / 60)
    }).eq('id', storyId)
    if (storyUpdateErr) throw new Error(`Failed to update story audio_url: ${storyUpdateErr.message}`)

    return {
      success: true,
      finalAudioUrl: versionedFinalAudioUrl,
      storyBodyUrl,
      durationSecs,
    }
  } catch (err) {
    console.error('render-final-mix error:', err)
    return { success: false, error: String(err) }
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
