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
const execFileAsync = (cmd: string, args: string[], opts?: any) => _execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 100, ...opts })
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
    if (trimmed === '[BEAT]' || /^\[PAUSE:\d+\]$/.test(trimmed) || trimmed.startsWith('[SFX:')) {
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

    const introFile = files.find(f => f.name === 'intro.mp3' || f.name.startsWith('intro_'))
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

    if (!introFile) return NextResponse.json({ success: false, error: 'No intro audio found' }, { status: 400 })
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
    await download(`${BASE_STORAGE}/asc3/${storyId}/${introFile.name}`, introPath)
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
      if (!Number.isFinite(metrics.input_i) || metrics.input_i < -22) {
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
        thresholdLufs: -22,
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
    const normalizedIntroPath = path.join(tmpDir, 'norm_intro.mp3')
    const normalizedOutroPath = path.join(tmpDir, 'norm_outro.mp3')
    await normalizeAudio(introPath, normalizedIntroPath, -16)
    await normalizeAudio(outroPath, normalizedOutroPath, -16)
    await logLoudnessDiagnostics('normalized intro', normalizedIntroPath)
    await logLoudnessDiagnostics('normalized outro', normalizedOutroPath)
    
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

    const sil075Path = path.join(tmpDir, 'sil075.mp3')
    const sil035Path = path.join(tmpDir, 'sil035.mp3')  // tight gap before outro
    await generateSilence(sil075Path, 0.75)
    await generateSilence(sil035Path, 0.35)  // was 1.0s — reduced to avoid dead air before outro

    // Architecture: produce story_body.mp3 (segments+music only) for queue mode
    // The player handles: sting → personalized Belle intro → story_body → outro
    const storyBodyPath = path.join(tmpDir, 'story_body.mp3')

    console.log('  Full mix with background music')
    const segsOnlyPath = normalizedConcatPath
    const segsDur = await getAudioDuration(segsOnlyPath)
    const musicOffset = await findStrongMusicOffset(musicPath)
    const shapedMusicPath = path.join(tmpDir, 'music_shaped.mp3')
    const preRollSeconds = 2.5
    const postStoryTailSeconds = 1.5  // was 3s — reduced so music tail doesn't add dead air before outro
    const preRollVolume = 0.65
    const narrationBedVolume = 0.075
    const postStoryVolume = 0.45
    const musicShapeFilter =
      `[0:a]atrim=start=${musicOffset}:duration=${preRollSeconds},asetpts=PTS-STARTPTS,volume=${preRollVolume},afade=t=in:st=0:d=0.4[pre];` +
      `[0:a]atrim=start=0:duration=${segsDur},asetpts=PTS-STARTPTS,volume=${narrationBedVolume}[bed];` +
      `[0:a]atrim=start=${musicOffset}:duration=${postStoryTailSeconds},asetpts=PTS-STARTPTS,volume=${postStoryVolume},afade=t=out:st=${Math.max(0, postStoryTailSeconds - 2.5)}:d=2.5[tail];` +
      `[pre][bed][tail]concat=n=3:v=0:a=1[music_out]`
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
    const storyBodyMixFilter = '[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[mixed]'
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

    // Build sting+intro crossfade: Belle B starts at 0.5s into sting — enters quickly, sting fades under
    // was 1.2s — reduced so Belle doesn't feel delayed after the sting fires
    const stingDur = await getAudioDuration(stingPath)
    const crossfadeStart = 0.5
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

    // Build final_mix: crossfaded sting+intro + clean silence + story_body + tight silence + outro
    // Timing: sting→Belle 0.5s | intro→story 0.75s | story→outro 0.35s (no long dead air gaps)
    const finalConcatFile = path.join(tmpDir, 'final.txt')
    const finalParts = [stingIntroPath, sil075Path, storyBodyPath, sil035Path, normalizedOutroPath]
    await fs.writeFile(finalConcatFile, finalParts.map(p => `file '${p}'`).join('\n'))
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'concat', '-safe', '0', '-i', finalConcatFile,
      '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath
    ])

    const durationSecs = await getAudioDuration(outputPath)
    console.log(`  ✅ Mix complete: ${durationSecs.toFixed(1)}s`)
    await logLoudnessDiagnostics('final_mix.mp3', outputPath)

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
