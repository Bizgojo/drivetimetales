import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Use ffmpeg-static (Vercel) or fall back to system ffmpeg
let FFMPEG_PATH = 'ffmpeg'
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FFMPEG_PATH = require('ffmpeg-static') as string
} catch {
  // system ffmpeg fallback
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const INTRO_OUTRO_MUSIC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(FFMPEG_PATH.replace('ffmpeg', 'ffprobe').replace(/ffmpeg$/, 'ffprobe'), [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ])
    return parseFloat(stdout.trim()) || 0
  } catch {
    // ffprobe might not be available — use ffmpeg to probe
    try {
      const { stderr } = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'])
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
    } catch { /* ignore */ }
    return 0
  }
}

async function generateSilence(outPath: string, durationSecs: number): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(durationSecs), '-q:a', '9', '-acodec', 'libmp3lame', '-y', outPath
  ])
}

/**
 * Mix a voice track with music underneath.
 * Music plays under voice at `musicVol`, then continues `tailSecs` after voice ends, then fades out over `fadeSecs`.
 */
async function mixVoiceWithMusic(
  voicePath: string,
  musicPath: string,
  outPath: string,
  musicVol: number,
  tailSecs: number,
  fadeSecs: number
): Promise<void> {
  const voiceDur = await getAudioDuration(voicePath)
  const totalMusicDur = voiceDur + tailSecs + fadeSecs
  const fadeStart = voiceDur + tailSecs

  await execFileAsync(FFMPEG_PATH, [
    '-i', voicePath,
    '-stream_loop', '-1', '-i', musicPath,
    '-filter_complex', [
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[voice]`,
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `volume=${musicVol},` +
        `atrim=start=0:end=${totalMusicDur},` +
        `afade=t=out:st=${fadeStart}:d=${fadeSecs}[music]`,
      `[voice][music]amix=inputs=2:duration=longest:dropout_transition=0[out]`,
    ].join(';'),
    '-map', '[out]',
    '-ar', '44100', '-ac', '2', '-b:a', '192k',
    '-y', outPath
  ])
}

// POST body: { storyId, musicVolume?: number (0–1, default 0.35) }
export async function POST(req: NextRequest) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))

  try {
    const { storyId, musicVolume = 0.35 } = await req.json()
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    console.log(`🎬 Rendering final mix for story ${storyId} (music vol: ${musicVolume})`)

    // ── 1. Fetch story ────────────────────────────────────────────────────
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('id, title, intro_audio_url, outro_audio_url')
      .eq('id', storyId)
      .single()

    if (storyErr || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

    // Segments are always stored at asc3/{storyId}/ — use storyId directly as folder
    // (intro_audio_url URL may differ if regenerated, so don't rely on it for folder)
    const folderId = storyId

    const { data: files } = await supabase.storage
      .from('audio')
      .list(`asc3/${folderId}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })

    const segments = (files || [])
      .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
      .sort((a, b) => a.name.localeCompare(b.name))

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const bgMusicUrl = bgFile ? `${BASE_STORAGE}/asc3/${folderId}/background_music.mp3` : null

    console.log(`  📂 ${folderId} | ${segments.length} segments | all files: ${(files||[]).map(f=>f.name).join(', ')} | bg music: ${!!bgMusicUrl}`)

    // ── 2. Download all files ────────────────────────────────────────────
    const introVoicePath  = path.join(tmpDir, 'intro_voice.mp3')
    const outroVoicePath  = path.join(tmpDir, 'outro_voice.mp3')
    const ioMusicPath     = path.join(tmpDir, 'io_music.mp3')
    const bgMusicPath     = bgMusicUrl ? path.join(tmpDir, 'bg_music.mp3') : null
    const outputPath      = path.join(tmpDir, 'final_mix.mp3')

    await download(story.intro_audio_url, introVoicePath)
    await download(story.outro_audio_url, outroVoicePath)
    await download(INTRO_OUTRO_MUSIC_URL, ioMusicPath)
    if (bgMusicUrl && bgMusicPath) await download(bgMusicUrl, bgMusicPath)

    const segPaths: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const p = path.join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp3`)
      await download(`${BASE_STORAGE}/asc3/${folderId}/${segments[i].name}`, p)
      segPaths.push(p)
    }

    // ── 3. Build intro mix: Belle B intro + io music underneath ──────────
    // Music plays under intro voice, fades out in 2s after she finishes
    const introMixPath = path.join(tmpDir, 'intro_mix.mp3')
    await mixVoiceWithMusic(introVoicePath, ioMusicPath, introMixPath, 0.35, 0, 2)
    console.log('  ✅ Intro mix done')

    // ── 4. Build outro mix: Belle B outro + io music, 3s tail, 3s fade ───
    const outroMixPath = path.join(tmpDir, 'outro_mix.mp3')
    await mixVoiceWithMusic(outroVoicePath, ioMusicPath, outroMixPath, 0.35, 3, 3)
    console.log('  ✅ Outro mix done')

    // ── 5. Generate silence gaps ─────────────────────────────────────────
    const sil15Path = path.join(tmpDir, 'sil15.mp3')
    const sil25Path = path.join(tmpDir, 'sil25.mp3')
    await generateSilence(sil15Path, 1.5)
    await generateSilence(sil25Path, 2.5)

    // ── 6. Build dialogue concat list ────────────────────────────────────
    // intro_mix → 1.5s → story segments → 2.5s → outro_mix
    const concatList = [introMixPath, sil15Path, ...segPaths, sil25Path, outroMixPath]
    const concatListPath = path.join(tmpDir, 'concat.txt')
    await fs.writeFile(concatListPath, concatList.map(p => `file '${p}'`).join('\n'))

    // ── 7. Final mix: concat + background music under story segments ──────
    if (bgMusicPath) {
      // Get durations to calculate when BG music should start/end
      const introDur = await getAudioDuration(introMixPath)
      const segsDur = await Promise.all(segPaths.map(p => getAudioDuration(p)))
        .then(ds => ds.reduce((a, b) => a + b, 0))
      const bgStartSecs = introDur + 1.5          // after intro + gap
      const bgEndSecs   = bgStartSecs + segsDur   // exactly covers story segments

      console.log(`  🎵 BG music: starts at ${bgStartSecs.toFixed(1)}s, ends at ${bgEndSecs.toFixed(1)}s`)

      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-stream_loop', '-1', '-i', bgMusicPath,
        '-filter_complex', [
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[dialogue]`,
          // Delay BG music to start when story begins, trim when story ends, volume + fadeout
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
            `volume=${musicVolume},` +
            `adelay=${Math.round(bgStartSecs * 1000)}|${Math.round(bgStartSecs * 1000)},` +
            `atrim=end=${bgEndSecs + 2},` +       // +2s buffer, amix will cut at dialogue end
            `afade=t=out:st=${bgEndSecs - 3}:d=3[bg]`,   // fade BG out 3s before story ends
          `[dialogue][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`,
        ].join(';'),
        '-map', '[out]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k',
        '-y', outputPath
      ])
    } else {
      // No background music — just concat the dialogue tracks
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-ar', '44100', '-ac', '2', '-b:a', '192k',
        '-y', outputPath
      ])
    }

    console.log('  🎛️  ffmpeg mix complete')

    // ── 8. Upload to Supabase ────────────────────────────────────────────
    const buffer = await fs.readFile(outputPath)
    const storagePath = `asc3/${folderId}/final_mix.mp3`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    await supabase.from('stories').update({ audio_url: publicUrl }).eq('id', storyId)

    console.log(`✅ Final mix ready: ${publicUrl}`)
    return NextResponse.json({ success: true, finalAudioUrl: publicUrl })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Render final mix error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
