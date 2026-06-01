import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 800
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const _execFileAsync = promisify(execFile)
const execFileAsync = async (cmd: string, args: string[], opts?: any) => {
  try {
    return await _execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 100, ...opts })
  } catch (err: any) {
    const stderr = err?.stderr ? String(err.stderr) : ''
    const stdout = err?.stdout ? String(err.stdout) : ''
    if (!stderr && !stdout) throw err

    const enhanced = new Error([
      err?.message || String(err),
      stderr ? `stderr:\n${stderr}` : '',
      stdout ? `stdout:\n${stdout}` : '',
    ].filter(Boolean).join('\n'))
    ;(enhanced as any).stderr = stderr
    ;(enhanced as any).stdout = stdout
    ;(enhanced as any).code = err?.code
    throw enhanced
  }
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`

// ASC3 Mix Spec v1.1 (LOCKED)
// 1. STING         — full volume, no music
// 2. BELLE INTRO   — full volume, no story music; ET sting may tail under intro
// 3. 0.75s silence
// 4. STORY         — voices begin with story-specific Suno music ducked underneath
// 5. STORY ENDS    — music fades over 3s
// 6. 1.0s silence
// 7. BELLE OUTRO   — full volume, no story music

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('@ffmpeg-installer/ffmpeg').path } catch { /* system ffmpeg */ }

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

async function getAudioDuration(filePath: string): Promise<number> {
  const result = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = (result as any).stderr || (result as any).stdout || ''
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (!m) return 0
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
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
    'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
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

export async function POST(req: NextRequest) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))
  try {
    const { storyId } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    console.log(`\n🎛 render-final-mix: ${storyId}`)

    const { data: files } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
    if (!files || files.length === 0) return NextResponse.json({ success: false, error: 'No audio files found' }, { status: 400 })
    const { data: storyRow } = await supabase
      .from('stories')
      .select('script')
      .eq('id', storyId)
      .single()

    // Detect split intro (intro_before_* + intro_after_*) vs single intro file.
    // Split intros are generated when the script contains a [LISTENER_NAME] placeholder.
    // The before/after halves must be concatenated in order; missing either half is an error.
    const introBeforeFile = files.find(f => f.name.startsWith('intro_before_'))
    const introAfterFile  = files.find(f => f.name.startsWith('intro_after_'))
    const introSingleFile = files.find(f => f.name === 'intro.mp3' || (f.name.startsWith('intro_') && !f.name.startsWith('intro_before_') && !f.name.startsWith('intro_after_')))
    const isSplitIntro = !!(introBeforeFile && introAfterFile)
    const introFile = isSplitIntro ? null : (introSingleFile ?? null)
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
      return NextResponse.json({
        success: false,
        error: `Duplicate story segment numbers found: ${duplicateSegmentNumbers.filter((n, i, arr) => arr.indexOf(n) === i).join(', ')}`
      }, { status: 400 })
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
    const musicFile = files.find(f => f.name === 'background_music.mp3')

    if (!isSplitIntro && !introFile) return NextResponse.json({ success: false, error: 'No intro audio found (expected intro.mp3, intro_*.mp3, or intro_before_* + intro_after_* pair)' }, { status: 400 })
    if (isSplitIntro && (!introBeforeFile || !introAfterFile)) return NextResponse.json({ success: false, error: 'Split intro incomplete: both intro_before_* and intro_after_* are required' }, { status: 400 })
    if (!outroFile) return NextResponse.json({ success: false, error: 'No outro audio found' }, { status: 400 })
    if (segmentFiles.length === 0) return NextResponse.json({ success: false, error: 'No story segments found' }, { status: 400 })
    if (!musicFile) {
      return NextResponse.json({
        success: false,
        error: 'Missing story-specific background_music.mp3; generate music before final render.',
        storyId,
      }, { status: 422 })
    }

    console.log(`  ${segmentFiles.length} segments | music: ${!!musicFile}`)
    console.log(`  Selected story segments: ${segmentFiles.map(f => f.name).join(', ')}`)

    const stingPath  = path.join(tmpDir, 'sting.mp3')
    const introPath  = path.join(tmpDir, 'intro.mp3')
    const outroPath  = path.join(tmpDir, 'outro.mp3')
    const musicPath = path.join(tmpDir, 'music.mp3')
    const outputPath = path.join(tmpDir, 'final_mix.mp3')

    await download(STING_URL, stingPath)
    // Assemble intro: concatenate split halves (intro_before + intro_after) or use single file.
    // No loudnorm here — ElevenLabs output is already at consistent levels; single-pass loudnorm
    // can introduce leading silence artifacts and dynamic gain pumping on short dialogue clips.
    if (isSplitIntro) {
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
    } else {
      await download(`${BASE_STORAGE}/asc3/${storyId}/${introFile!.name}`, introPath)
    }
    await download(`${BASE_STORAGE}/asc3/${storyId}/${outroFile.name}`, outroPath)
    await download(`${BASE_STORAGE}/asc3/${storyId}/${musicFile.name}`, musicPath)

    const selectedSegmentNames = segmentFiles.map(seg => seg.name)
    const preparedSegmentNames: string[] = []
    const preparedSegments: Array<{ name: string; segmentNumber: number; path: string }> = []
    const failedSegments: string[] = []
    const segPaths: string[] = []
    // Download and normalize segments sequentially to avoid memory pressure
    for (let i = 0; i < parsedSegments.length; i++) {
      const parsedSegment = parsedSegments[i]
      const seg = parsedSegment.file
      try {
        const rawPath = path.join(tmpDir, 'raw_' + seg.name)
        const segPath = path.join(tmpDir, seg.name)
        await download(`${BASE_STORAGE}/asc3/${storyId}/${seg.name}`, rawPath)
        const stat = await fs.stat(rawPath)
        if (stat.size <= 100) throw new Error(`Segment file too small (${stat.size} bytes)`)
        // Voice segments are already loudness-QC'd upstream. Do not run
        // per-segment loudnorm here; short clips can be over-attenuated.
        await execFileAsync(FFMPEG_PATH, ['-i', rawPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', segPath])
        preparedSegmentNames.push(seg.name)
        preparedSegments.push({ name: seg.name, segmentNumber: parsedSegment.segmentNumber, path: segPath })
        segPaths.push(segPath)
        await fs.unlink(rawPath).catch(() => {})
      } catch (e) {
        failedSegments.push(seg.name)
        console.error('  Segment ' + i + ' failed:', e)
      }
    }
    console.log(`  Selected segment count: ${selectedSegmentNames.length}`)
    console.log(`  Prepared segment count: ${preparedSegmentNames.length}`)
    if (failedSegments.length > 0) console.error(`  Failed segment filenames: ${failedSegments.join(', ')}`)
    if (failedSegments.length > 0 || preparedSegmentNames.length !== selectedSegmentNames.length) {
      return NextResponse.json({
        success: false,
        error: 'Failed to prepare all selected story segments',
        selectedCount: selectedSegmentNames.length,
        preparedCount: preparedSegmentNames.length,
        failedSegments
      }, { status: 500 })
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
    if (buriedSegments.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Buried narration segment detected before render',
        thresholdLufs: -28,
        buriedSegments,
      }, { status: 422 })
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
    await execFileAsync(FFMPEG_PATH, ['-i', introPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', normalizedIntroPath])
    await execFileAsync(FFMPEG_PATH, ['-i', outroPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', normalizedOutroPath])
    await logLoudnessDiagnostics('resampled intro', normalizedIntroPath)
    await logLoudnessDiagnostics('resampled outro', normalizedOutroPath)
    
    // Concatenate and normalize all story segments in one pass
    const rawConcatFile = path.join(tmpDir, 'raw_concat.txt')
    await fs.writeFile(rawConcatFile, segPaths.map(p => `file '${p}'`).join('\n'))
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

    // ── Production Standard v2 flag (2026-05-29) ──────────────────────────
    // Set ENABLE_V2_MUSIC_SWELL=true in env to test the v2 swell+outro-fade behaviour.
    // When false (default): legacy concat path — story_body + silence + dry outro.
    // When true: story_body includes 4s swell, outro plays over fading music (no dry outro).
    // DO NOT enable globally until test render is approved by Marc.
    const V2_MUSIC_SWELL = process.env.ENABLE_V2_MUSIC_SWELL === 'true'
    if (V2_MUSIC_SWELL) {
      console.log('  ⚑  Production Standard v2 music swell ENABLED (test mode)')
    }

    // Timing constants (Marc spec: sting→Belle 0.3-0.7s, story→outro 0.5-1.0s total)
    const STING_TO_BELLE_SEC   = 0.5   // crossfadeStart below — Belle enters sting at 0.5s
    const STORY_TAIL_SEC       = V2_MUSIC_SWELL ? 4.0 : 0.5  // v2: 4s swell window; legacy: 0.5s (was 3.0→1.5→0.5)
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
      // v2 shape: pre-roll → bed (under story) → swell (4s, peaks at postStoryVolume)
      // Outro music is handled separately in the final assembly (Variant B duck + 3s tail).
      // outrofade removed from story_body: it caused double-music when outro_with_music was appended.
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

    // Sting→Belle crossfade: Belle enters at STING_TO_BELLE_SEC (0.5s) — natural pause, no dead air
    const stingDur = await getAudioDuration(stingPath)
    const crossfadeStart = STING_TO_BELLE_SEC
    const stingIntroPath = path.join(tmpDir, 'sting_intro.mp3')
    const delayMs = Math.round(crossfadeStart * 1000)
    await execFileAsync(FFMPEG_PATH, [
      '-i', stingPath, '-i', normalizedIntroPath,
      '-filter_complex',
      `[0:a]afade=t=out:st=${crossfadeStart}:d=${Math.max(0.5, stingDur - crossfadeStart)}[sting_fade];` +
      `[1:a]adelay=${delayMs}|${delayMs}[intro_delayed];` +
      `[sting_fade][intro_delayed]amix=inputs=2:duration=longest[out]`,
      '-map', '[out]',
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', stingIntroPath
    ])

    // ── Final assembly ────────────────────────────────────────────────────────
    // v2 path: sting+intro → 0.75s silence → story_body (pre+bed+swell) → outro_with_music
    //          outro_with_music = Belle voice over Variant B duck + 1.5s post-Belle tail
    // Legacy:  sting+intro → 0.75s silence → story_body → 0.25s silence → dry outro
    const finalConcatFile = path.join(tmpDir, 'final.txt')
    let finalParts: string[]

    if (V2_MUSIC_SWELL) {
      // ── Outro Standard v2 — Variant B duck + 1.5s post-Belle tail (revised May 30 2026) ───
      // story_body swell peaks at postStoryVolume (0.85). Outro music continues seamlessly:
      //   t=0 .. DUCK_RAMP:    music ducks 0.85 → DUCK_VOL (Belle enters when duck completes)
      //   t=DUCK_RAMP .. belleEnd:  hold DUCK_VOL — soft bed, Belle clearly dominant
      //   t=belleEnd .. riseEnd:    rise DUCK_VOL → TAIL_VOL over RISE_DUR
      //   t=riseEnd .. holdEnd:     hold TAIL_VOL for TAIL_HOLD (1.5s audible tail after Belle)
      //   t=holdEnd .. fadeEnd:     fade TAIL_VOL → 0 over TAIL_FADE (clean end)
      const V2_DUCK_VOL  = 0.04   // linear — near-silent bed under Belle
      const V2_DUCK_RAMP = 0.5    // s — duck from swell level; Belle enters after ramp completes
      const V2_TAIL_VOL  = 0.40   // linear — audible post-Belle level (~-8 dB from swell peak)
      const V2_RISE_DUR  = 0.5    // s — rise from duck to tail vol after Belle ends
      const V2_TAIL_HOLD = 1.5    // s — music tail after Belle ends (revised from 3.0s)
      const V2_TAIL_FADE = 2.0    // s — clean fade to silence

      const outroDurSecs = outroDurForShape
      const belleEnd = V2_DUCK_RAMP + outroDurSecs
      const riseEnd  = belleEnd + V2_RISE_DUR
      const holdEnd  = riseEnd + V2_TAIL_HOLD
      const outroBed = holdEnd + V2_TAIL_FADE + 0.5   // full outro music clip duration + buffer

      // Variant B + tail volume expression (eval=frame for sample-accurate ramp)
      const outroVolExpr =
        `if(lt(t,${V2_DUCK_RAMP.toFixed(3)}),` +
          `${postStoryVolume}+(${V2_DUCK_VOL}-${postStoryVolume})*t/${V2_DUCK_RAMP},` +
        `if(lt(t,${belleEnd.toFixed(3)}),${V2_DUCK_VOL},` +
        `if(lt(t,${riseEnd.toFixed(3)}),` +
          `${V2_DUCK_VOL}+(${V2_TAIL_VOL}-${V2_DUCK_VOL})*(t-${belleEnd.toFixed(3)})/${V2_RISE_DUR},` +
        `if(lt(t,${holdEnd.toFixed(3)}),${V2_TAIL_VOL},` +
        `max(0,${V2_TAIL_VOL}*(1-(t-${holdEnd.toFixed(3)})/${V2_TAIL_FADE}))))))`

      const outroMusicClipPath = path.join(tmpDir, 'outro_music_clip.mp3')
      const outroBelleDelPath  = path.join(tmpDir, 'outro_belle_del.mp3')
      const outroWithMusicPath = path.join(tmpDir, 'outro_with_music.mp3')

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

      // Mix delayed Belle over Variant B music (normalize=0 — preserve actual levels)
      await execFileAsync(FFMPEG_PATH, [
        '-i', outroBelleDelPath, '-i', outroMusicClipPath,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0:duration=longest[out]',
        '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outroWithMusicPath
      ])
      console.log(
        `  v2: outro_with_music — Variant B duck (${V2_DUCK_VOL}) under ${outroDurSecs.toFixed(1)}s Belle` +
        ` + ${V2_TAIL_HOLD}s tail + ${V2_TAIL_FADE}s fade (total ${outroBed.toFixed(1)}s music)`
      )
      // story_body = pre+bed+swell; outro_with_music bridges directly (music seamless at 0.85)
      finalParts = [stingIntroPath, sil075Path, storyBodyPath, outroWithMusicPath]
    } else {
      finalParts = [stingIntroPath, sil075Path, storyBodyPath, sil025Path, normalizedOutroPath]
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
    const storageNames = (storageFiles || []).map((f: any) => f.name)
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

    // Upload final_mix.mp3 (full mix for backward compat)
    const mixBuffer = await fs.readFile(outputPath)
    const mixPath = `asc3/${storyId}/final_mix.mp3`
    const { error: uploadErr } = await supabase.storage.from('audio').upload(mixPath, mixBuffer, { contentType: 'audio/mpeg', cacheControl: 'no-cache', upsert: true })
    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)
    const finalAudioUrl = `${BASE_STORAGE}/${mixPath}`
    const versionedFinalAudioUrl = `${finalAudioUrl}?v=${Date.now()}`

    // Update story — story_audio_url for queue mode, audio_url for fallback
    await supabase.from('stories').update({
      story_audio_url: storyBodyUrl,
      audio_url: versionedFinalAudioUrl,
      duration_mins: Math.ceil(durationSecs / 60)
    }).eq('id', storyId)

    return NextResponse.json({
      success: true,
      finalAudioUrl: versionedFinalAudioUrl,
      storyBodyUrl,
      durationSecs,
    })
  } catch (err) {
    console.error('render-final-mix error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
