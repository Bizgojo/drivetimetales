import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Use system ffmpeg (Mac dev) or ffmpeg-static (Vercel)
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

// Download a URL to a local /tmp file
async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(dest, buf)
}

// POST body: { storyId, musicVolume?: number (0–1, default 0.35) }
export async function POST(req: NextRequest) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))

  try {
    const { storyId, musicVolume = 0.35 } = await req.json()
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    console.log(`🎬 Starting final mix for story ${storyId} (music vol: ${musicVolume})`)

    // ── 1. Fetch story record ──────────────────────────────────────────────
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('id, title, intro_audio_url, outro_audio_url')
      .eq('id', storyId)
      .single()

    if (storyErr || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

    // ── 2. Find folder ID and list segments ──────────────────────────────
    const refUrl = story.intro_audio_url || ''
    const folderMatch = refUrl.match(/asc3\/([^/]+)\//)
    const folderId = folderMatch?.[1]
    if (!folderId) return NextResponse.json({ error: 'Cannot determine storage folder from intro URL' }, { status: 400 })

    const { data: files } = await supabase.storage
      .from('audio')
      .list(`asc3/${folderId}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })

    const segments = (files || [])
      .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
      .sort((a, b) => a.name.localeCompare(b.name))

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const musicUrl = bgFile ? `${BASE_STORAGE}/asc3/${folderId}/background_music.mp3` : null

    console.log(`  📂 Folder: ${folderId} | Segments: ${segments.length} | Music: ${!!musicUrl}`)

    // ── 3. Download all audio files ──────────────────────────────────────
    const introPath  = path.join(tmpDir, 'intro.mp3')
    const outroPath  = path.join(tmpDir, 'outro.mp3')
    const musicPath  = musicUrl ? path.join(tmpDir, 'music.mp3') : null
    const outputPath = path.join(tmpDir, 'final_mix.mp3')

    await download(story.intro_audio_url, introPath)
    await download(story.outro_audio_url, outroPath)
    if (musicUrl && musicPath) await download(musicUrl, musicPath)

    const segPaths: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const p = path.join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp3`)
      await download(`${BASE_STORAGE}/asc3/${folderId}/${segments[i].name}`, p)
      segPaths.push(p)
    }

    // ── 4. Build ffmpeg concat list for dialogue ──────────────────────────
    // Order: intro → 1.5s silence → story segments → 2.5s silence → outro
    const silencePath15 = path.join(tmpDir, 'sil15.mp3')
    const silencePath25 = path.join(tmpDir, 'sil25.mp3')

    // Generate silence files
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '1.5', '-q:a', '9', '-acodec', 'libmp3lame', '-y', silencePath15
    ])
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '2.5', '-q:a', '9', '-acodec', 'libmp3lame', '-y', silencePath25
    ])

    const concatList = [
      introPath,
      silencePath15,
      ...segPaths,
      silencePath25,
      outroPath,
    ]

    const concatListPath = path.join(tmpDir, 'concat.txt')
    await fs.writeFile(concatListPath, concatList.map(p => `file '${p}'`).join('\n'))

    // ── 5. Run ffmpeg mix ─────────────────────────────────────────────────
    const ffArgs: string[] = []

    if (musicPath) {
      // Two inputs: concat dialogue + background music
      ffArgs.push(
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-stream_loop', '-1', '-i', musicPath,
        '-filter_complex',
        // dialogue at full vol; music at musicVolume with fade-in 3s, fade-out 5s
        [
          '[0:a]aformat=sample_rates=44100:channel_layouts=stereo[dialogue]',
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume}[music_raw]`,
          // get dialogue duration for fade-out timing via adelay trick:
          // fade out music in last 5s — we do it unconditionally at end using afade
          `[music_raw]afade=t=in:st=0:d=3,afade=t=out:st=9999:d=5[music_faded]`,
          '[dialogue][music_faded]amix=inputs=2:duration=first:dropout_transition=3[out]',
        ].join(';'),
        '-map', '[out]',
        '-ar', '44100', '-ac', '2',
        '-b:a', '192k',
        '-y', outputPath
      )
    } else {
      // No music: just concat dialogue
      ffArgs.push(
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-ar', '44100', '-ac', '2',
        '-b:a', '192k',
        '-y', outputPath
      )
    }

    console.log('  🎛️  Running ffmpeg...')
    const { stderr } = await execFileAsync(FFMPEG_PATH, ffArgs)
    if (stderr && stderr.includes('Error')) throw new Error(`ffmpeg error: ${stderr.slice(-500)}`)

    // ── 6. Upload final mix to Supabase ───────────────────────────────────
    const buffer = await fs.readFile(outputPath)
    const storagePath = `asc3/${folderId}/final_mix.mp3`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    // ── 7. Update stories.audio_url ───────────────────────────────────────
    await supabase.from('stories').update({ audio_url: publicUrl }).eq('id', storyId)

    console.log(`✅ Final mix ready: ${publicUrl}`)
    return NextResponse.json({ success: true, finalAudioUrl: publicUrl })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Render final mix error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  } finally {
    // Clean up tmp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
