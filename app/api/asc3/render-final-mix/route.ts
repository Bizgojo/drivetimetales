import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export const runtime = 'nodejs'
export const maxDuration = 300

const execFileAsync = (cmd: string, args: string[]) => new Promise<{stdout:string,stderr:string}>((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
    if (err) reject(Object.assign(err, { stdout, stderr }))
    else resolve({ stdout, stderr })
  })
})
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v6.mp3`

// ASC3 Mix Spec v1.0 (LOCKED)
// 1. STING         — full volume, no music
// 2. BELLE B INTRO — full volume, no music
// 3. 0.75s silence
// 4. MUSIC ONLY    — 2.5s full volume atmosphere
// 5. STORY         — voices, music ducked to 15%
// 6. STORY ENDS    — music rises to full, fades over 3s
// 7. 1.0s silence
// 8. BELLE B OUTRO — full volume, no music

let FFMPEG_PATH = 'ffmpeg'
async function findFfmpeg() {
  const candidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  try { const s = require('ffmpeg-static'); if (s) candidates.unshift(s) } catch {}
  for (const p of candidates) { try { await fs.access(p); FFMPEG_PATH = p; return } catch {} }
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function getAudioDuration(filePath: string): Promise<number> {
  const result = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = (result as any).stderr || (result as any).stdout || ''
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (!m) return 0
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
}

async function normalizeAudio(inputPath: string, outputPath: string, targetLufs: number = -16): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-i', inputPath,
    '-af', `volume=${targetLufs === -14 ? '1.5' : targetLufs === -18 ? '0.7' : '1.0'}`,
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

export async function POST(req: NextRequest) {
  await findFfmpeg()
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))
  try {
    const { storyId } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    console.log(`\n🎛 render-final-mix: ${storyId}`)

    const { data: files } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
    if (!files || files.length === 0) return NextResponse.json({ success: false, error: 'No audio files found' }, { status: 400 })

    const introFile = files.find(f => f.name.startsWith('intro_'))
    const outroFile = files.find(f => f.name.startsWith('outro_'))
    const segmentFiles = files
      .filter(f => f.name.startsWith('segment_') || f.name.startsWith('sfx_'))
      .sort((a, b) => (parseInt(a.name.replace(/\D/g, '')) || 0) - (parseInt(b.name.replace(/\D/g, '')) || 0))
    const musicFile = files.find(f => f.name === 'background_music.mp3')

    if (!introFile) return NextResponse.json({ success: false, error: 'No intro audio found' }, { status: 400 })
    if (!outroFile) return NextResponse.json({ success: false, error: 'No outro audio found' }, { status: 400 })
    if (segmentFiles.length === 0) return NextResponse.json({ success: false, error: 'No story segments found' }, { status: 400 })

    console.log(`  ${segmentFiles.length} segments | music: ${!!musicFile}`)

    const stingPath  = path.join(tmpDir, 'sting.mp3')
    const introPath  = path.join(tmpDir, 'intro.mp3')
    const outroPath  = path.join(tmpDir, 'outro.mp3')
    const musicPath  = musicFile ? path.join(tmpDir, 'music.mp3') : null
    const outputPath = path.join(tmpDir, 'final_mix.mp3')

    await download(STING_URL, stingPath)
    await download(`${BASE_STORAGE}/asc3/${storyId}/${introFile.name}`, introPath)
    await download(`${BASE_STORAGE}/asc3/${storyId}/${outroFile.name}`, outroPath)
    if (musicPath && musicFile) await download(`${BASE_STORAGE}/asc3/${storyId}/${musicFile.name}`, musicPath)

    const segPaths: string[] = []
    for (const seg of segmentFiles) {
      const segPath = path.join(tmpDir, seg.name)
      try {
        await download(`${BASE_STORAGE}/asc3/${storyId}/${seg.name}`, segPath)
        const stat = await fs.stat(segPath)
        if (stat.size > 100) segPaths.push(segPath)
        else console.warn(`  Skipping empty: ${seg.name}`)
      } catch (e) { console.warn(`  Failed to download: ${seg.name}`) }
    }
    console.log(`  Downloaded ${segPaths.length}/${segmentFiles.length} segments`)

    // Use source paths directly — ElevenLabs output is already consistent
    const normalizedIntroPath = introPath
    const normalizedOutroPath = outroPath
    const normalizedSegPaths = segPaths

    const sil075Path = path.join(tmpDir, 'sil075.mp3')
    const sil100Path = path.join(tmpDir, 'sil100.mp3')
    await generateSilence(sil075Path, 0.75)
    await generateSilence(sil100Path, 1.0)

    // Architecture: produce story_body.mp3 (segments+music only) for queue mode
    // The player handles: sting → personalized Belle intro → story_body → outro
    const storyBodyPath = path.join(tmpDir, 'story_body.mp3')

    if (!musicPath) {
      console.log('  No music — concatenating segments only for story_body')
      const bodyConcatFile = path.join(tmpDir, 'body_concat.txt')
      await fs.writeFile(bodyConcatFile, normalizedSegPaths.map(p => `file '${p}'`).join('\n'))
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', bodyConcatFile,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', storyBodyPath
      ])
      // Also produce full final_mix for backward compat
      const concatFile = path.join(tmpDir, 'concat.txt')
      await fs.writeFile(concatFile, [stingPath, sil075Path, normalizedIntroPath, sil075Path, ...normalizedSegPaths, sil100Path, normalizedOutroPath].map(p => `file '${p}'`).join('\n'))
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath
      ])
    } else {
      console.log('  Full mix with background music')
      // Mix segments with music for story_body
      const segConcatFile = path.join(tmpDir, 'seg_concat.txt')
      await fs.writeFile(segConcatFile, segPaths.map(p => `file '${p}'`).join('\n'))
      const segsOnlyPath = path.join(tmpDir, 'segs_only.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', segConcatFile,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', segsOnlyPath
      ])
      const segsDur = await getAudioDuration(segsOnlyPath)
      const musicBodyMixedPath = path.join(tmpDir, 'music_body.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-i', musicPath,
        '-filter_complex',
        `[0:a]atrim=0:${segsDur + 3},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=2.5,afade=t=out:st=${segsDur}:d=3,volume=0.15[music_out]`,
        '-map', '[music_out]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', musicBodyMixedPath
      ])
      await execFileAsync(FFMPEG_PATH, [
        '-i', segsOnlyPath, '-i', musicBodyMixedPath,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:normalize=0[mixed]',
        '-map', '[mixed]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', storyBodyPath
      ])
      // Also produce full final_mix for backward compat
      const dialogueParts = [stingPath, sil075Path, normalizedIntroPath, sil075Path, ...segPaths]
      const dialogueConcatFile = path.join(tmpDir, 'dialogue.txt')
      await fs.writeFile(dialogueConcatFile, dialogueParts.map(p => `file '${p}'`).join('\n'))
      const dialoguePath = path.join(tmpDir, 'dialogue.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', dialogueConcatFile,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', dialoguePath
      ])
      const stingDur = await getAudioDuration(stingPath)
      const introDur = await getAudioDuration(introPath)
      const musicStart = stingDur + introDur + 0.75
      const musicEnd = musicStart + segsDur
      const musicMixedPath = path.join(tmpDir, 'music_mixed.mp3')
      const delayMs = Math.round(musicStart * 1000)
      await execFileAsync(FFMPEG_PATH, [
        '-i', musicPath,
        '-filter_complex',
        `[0:a]atrim=0:${musicEnd + 3},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=2.5,afade=t=out:st=${musicEnd}:d=3,volume=0.15,adelay=${delayMs}|${delayMs}[music_out]`,
        '-map', '[music_out]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', musicMixedPath
      ])
      const mixedPath = path.join(tmpDir, 'mixed.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-i', dialoguePath, '-i', musicMixedPath,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:normalize=0[mixed]',
        '-map', '[mixed]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', mixedPath
      ])
      const finalConcatFile = path.join(tmpDir, 'final.txt')
      await fs.writeFile(finalConcatFile, [mixedPath, sil100Path, normalizedOutroPath].map(p => `file '${p}'`).join('\n'))
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', finalConcatFile,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath
      ])
    }

    const durationSecs = await getAudioDuration(outputPath)
    console.log(`  ✅ Mix complete: ${durationSecs.toFixed(1)}s`)

    // Upload story_body.mp3 (segments only — for queue mode personalization)
    const bodyBuffer = await fs.readFile(storyBodyPath)
    const bodyStoragePath = `asc3/${storyId}/story_body.mp3`
    const { error: bodyUploadErr } = await supabase.storage.from('audio').upload(bodyStoragePath, bodyBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (bodyUploadErr) throw new Error(`Body upload error: ${bodyUploadErr.message}`)
    const storyBodyUrl = `${BASE_STORAGE}/${bodyStoragePath}`

    // Upload final_mix.mp3 (full mix for backward compat)
    const mixBuffer = await fs.readFile(outputPath)
    const mixPath = `asc3/${storyId}/final_mix.mp3`
    const { error: uploadErr } = await supabase.storage.from('audio').upload(mixPath, mixBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)
    const finalAudioUrl = `${BASE_STORAGE}/${mixPath}`

    // Update story — story_audio_url for queue mode, audio_url for fallback
    await supabase.from('stories').update({
      story_audio_url: storyBodyUrl,
      audio_url: finalAudioUrl
    }).eq('id', storyId)

    return NextResponse.json({ success: true, finalAudioUrl, storyBodyUrl, durationSecs })
  } catch (err) {
    console.error('render-final-mix error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
