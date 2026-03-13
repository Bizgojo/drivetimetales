/**
 * POST /api/landing/render-mix
 * Renders a final mix for a landing_stories entry using:
 *  - The original story's segments (from stories.story_audio_url folder)
 *  - The landing story's intro_audio_url + outro_audio_url
 * Uploads result to Supabase and updates landing_stories.audio_url.
 *
 * Body: { landingStoryId, musicVolume?: number }
 */
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 min — needed for long stories (80+ segments)
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('ffmpeg-static') as string } catch { /* system ffmpeg */ }

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
    const { stderr } = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'])
    const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
    if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
  } catch { /* ignore */ }
  return 0
}

async function generateSilence(outPath: string, secs: number): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(secs), '-q:a', '9', '-acodec', 'libmp3lame', '-y', outPath,
  ])
}

async function mixVoiceWithMusic(voicePath: string, musicPath: string, outPath: string, musicVol: number, tailSecs: number, fadeSecs: number): Promise<void> {
  const voiceDur = await getAudioDuration(voicePath)
  const totalMusicDur = voiceDur + tailSecs + fadeSecs
  const fadeStart = voiceDur + tailSecs
  await execFileAsync(FFMPEG_PATH, [
    '-i', voicePath,
    '-stream_loop', '-1', '-i', musicPath,
    '-filter_complex', [
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[voice]`,
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVol},atrim=start=0:end=${totalMusicDur},afade=t=out:st=${fadeStart}:d=${fadeSecs}[music]`,
      `[voice][music]amix=inputs=2:duration=longest:dropout_transition=0[out]`,
    ].join(';'),
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outPath,
  ])
}

export async function POST(req: NextRequest) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-lp-mix-'))
  try {
    const { landingStoryId, musicVolume = 0.35 } = await req.json()
    if (!landingStoryId) return NextResponse.json({ error: 'landingStoryId required' }, { status: 400 })

    // Fetch landing story + linked source story
    const { data: ls, error: lsErr } = await supabase
      .from('landing_stories')
      .select('id, title, story_id, intro_audio_url, outro_audio_url')
      .eq('id', landingStoryId)
      .single()
    if (lsErr || !ls) return NextResponse.json({ error: 'Landing story not found' }, { status: 404 })

    if (!ls.story_id) return NextResponse.json({ error: 'No linked app story — cannot render mix' }, { status: 400 })

    // Get source story's segment folder
    const { data: source } = await supabase
      .from('stories')
      .select('story_audio_url')
      .eq('id', ls.story_id)
      .single()

    const refUrl = source?.story_audio_url || ''
    const folderMatch = refUrl.match(/asc3\/([^/]+)\//)
    const folderId = folderMatch?.[1]
    if (!folderId) return NextResponse.json({ error: 'Cannot find segment storage folder for source story' }, { status: 400 })

    // List segments
    const { data: files } = await supabase.storage
      .from('audio')
      .list(`asc3/${folderId}`, { limit: 300, sortBy: { column: 'name', order: 'asc' } })

    const segments = (files || [])
      .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
      .sort((a, b) => a.name.localeCompare(b.name))

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const bgMusicUrl = bgFile ? `${BASE_STORAGE}/asc3/${folderId}/background_music.mp3` : null

    console.log(`🎬 Landing mix: ${ls.title} | ${segments.length} segments | bg: ${!!bgMusicUrl}`)

    // Download files
    const introPath = path.join(tmpDir, 'intro.mp3')
    const outroPath = path.join(tmpDir, 'outro.mp3')
    const ioMusicPath = path.join(tmpDir, 'io_music.mp3')
    const bgPath = bgMusicUrl ? path.join(tmpDir, 'bg.mp3') : null
    const outputPath = path.join(tmpDir, 'final.mp3')

    if (!ls.intro_audio_url) throw new Error('No intro audio — regenerate intro audio first')
    if (!ls.outro_audio_url) throw new Error('No outro audio — regenerate outro audio first')

    await download(ls.intro_audio_url, introPath)
    await download(ls.outro_audio_url, outroPath)
    await download(INTRO_OUTRO_MUSIC_URL, ioMusicPath)
    if (bgMusicUrl && bgPath) await download(bgMusicUrl, bgPath)

    const segPaths: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const p = path.join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp3`)
      await download(`${BASE_STORAGE}/asc3/${folderId}/${segments[i].name}`, p)
      segPaths.push(p)
    }

    // Mix intro + outro with io music
    const introMixPath = path.join(tmpDir, 'intro_mix.mp3')
    const outroMixPath = path.join(tmpDir, 'outro_mix.mp3')
    await mixVoiceWithMusic(introPath, ioMusicPath, introMixPath, 0.35, 0, 2)
    await mixVoiceWithMusic(outroPath, ioMusicPath, outroMixPath, 0.35, 3, 3)

    const sil15 = path.join(tmpDir, 'sil15.mp3')
    const sil25 = path.join(tmpDir, 'sil25.mp3')
    await generateSilence(sil15, 1.5)
    await generateSilence(sil25, 2.5)

    const concatList = [introMixPath, sil15, ...segPaths, sil25, outroMixPath]
    const concatListPath = path.join(tmpDir, 'concat.txt')
    await fs.writeFile(concatListPath, concatList.map(p => `file '${p}'`).join('\n'))

    if (bgPath) {
      const introDur = await getAudioDuration(introMixPath)
      const segsDur = await Promise.all(segPaths.map(p => getAudioDuration(p))).then(ds => ds.reduce((a, b) => a + b, 0))
      const bgStart = introDur + 1.5
      const bgEnd = bgStart + segsDur
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-stream_loop', '-1', '-i', bgPath,
        '-filter_complex', [
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[dialogue]`,
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume},adelay=${Math.round(bgStart * 1000)}|${Math.round(bgStart * 1000)},atrim=end=${bgEnd + 2},afade=t=out:st=${bgEnd - 3}:d=3[bg]`,
          `[dialogue][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`,
        ].join(';'),
        '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath,
      ])
    } else {
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outputPath,
      ])
    }

    // Upload
    const buffer = await fs.readFile(outputPath)
    const storagePath = `landing/${landingStoryId}/final_mix.mp3`
    const { error: uploadErr } = await supabase.storage.from('audio').upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)
    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    // Update landing_stories.audio_url
    await supabase.from('landing_stories').update({ audio_url: publicUrl }).eq('id', landingStoryId)

    return NextResponse.json({ success: true, audioUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Landing render-mix error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
