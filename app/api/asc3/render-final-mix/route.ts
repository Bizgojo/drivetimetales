import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
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
  FFMPEG_PATH = eval('require')('ffmpeg-static') as string
} catch {
  // system ffmpeg fallback
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`

// Endless Tales signature sting — stored in Supabase
const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/sting-B-harp-chime.mp3`

// ─── ASC3 PRODUCTION STANDARD v1.0 (locked Mar 22, 2026) ─────────────────────
//
// SEQUENCE:
//  1. STING (5.84s, full volume, no music underneath)
//  2. BELLE B INTRO (full volume, NO music underneath)
//  3. 0.75s silence
//  4. STORY MUSIC ONLY — 2.5s at full volume (atmosphere, no voices)
//  5. STORY CONTENT — voices at -16 LUFS each, music ducked to 15% underneath
//  6. STORY ENDS → music rises to full, then fades out over 3s
//  7. 1s silence
//  8. BELLE B OUTRO (full volume, NO music underneath)
//
// Do NOT change this sequence without Marc's explicit written approval.
// ─────────────────────────────────────────────────────────────────────────────

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const ffprobePath = FFMPEG_PATH.replace(/ffmpeg$/, 'ffprobe')
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ])
    return parseFloat(stdout.trim()) || 0
  } catch {
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
 * Normalize a single audio file to target LUFS (-16 LUFS per ASC3 standard).
 * This ensures all voices are at a consistent level before mixing.
 */
async function normalizeLoudness(inputPath: string, outputPath: string, targetLUFS = -16): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-i', inputPath,
    '-af', `loudnorm=I=${targetLUFS}:TP=-1.5:LRA=11`,
    '-ar', '44100', '-b:a', '192k',
    '-y', outputPath
  ])
}

// POST body: { storyId, musicVolume?: number (0–1, default 0.15 per standard) }
export async function POST(req: NextRequest) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-mix-'))

  try {
    const { storyId, musicVolume = 0.15 } = await req.json()
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    console.log(`🎬 Rendering final mix for story ${storyId} (ASC3 standard v1.0)`)

    // ── 1. Fetch story ────────────────────────────────────────────────────
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .select('id, title, intro_audio_url, outro_audio_url, story_audio_url')
      .eq('id', storyId)
      .single()

    if (storyErr || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

    const refUrl = story.story_audio_url || story.intro_audio_url || ''
    const folderMatch = refUrl.match(/asc3\/([^/]+)\//)
    const folderId = folderMatch?.[1]
    if (!folderId) return NextResponse.json({ error: `Cannot determine storage folder from URLs` }, { status: 400 })

    const { data: files } = await supabase.storage
      .from('audio')
      .list(`asc3/${folderId}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })

    const segments = (files || [])
      .filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3'))
      .sort((a, b) => a.name.localeCompare(b.name))

    const bgFile = (files || []).find(f => f.name === 'background_music.mp3')
    const bgMusicUrl = bgFile ? `${BASE_STORAGE}/asc3/${folderId}/background_music.mp3` : null

    console.log(`  📂 ${folderId} | ${segments.length} segments | bg music: ${!!bgMusicUrl}`)

    // ── 2. Download all files ────────────────────────────────────────────
    const stingPath       = path.join(tmpDir, 'sting.mp3')
    const introVoicePath  = path.join(tmpDir, 'intro_voice.mp3')
    const outroVoicePath  = path.join(tmpDir, 'outro_voice.mp3')
    const bgMusicPath     = bgMusicUrl ? path.join(tmpDir, 'bg_music.mp3') : null
    const outputPath      = path.join(tmpDir, 'final_mix.mp3')

    await download(STING_URL, stingPath)
    await download(story.intro_audio_url, introVoicePath)
    await download(story.outro_audio_url, outroVoicePath)
    if (bgMusicUrl && bgMusicPath) await download(bgMusicUrl, bgMusicPath)

    // Download and normalize each story segment to -16 LUFS
    const segPaths: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const rawPath  = path.join(tmpDir, `seg_raw_${String(i).padStart(3, '0')}.mp3`)
      const normPath = path.join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp3`)
      await download(`${BASE_STORAGE}/asc3/${folderId}/${segments[i].name}`, rawPath)
      await normalizeLoudness(rawPath, normPath, -16)
      segPaths.push(normPath)
    }
    console.log(`  ✅ ${segPaths.length} segments downloaded and normalized to -16 LUFS`)

    // ── 3. Build silence gaps ────────────────────────────────────────────
    // Step 3: 0.75s silence after Belle B intro
    const sil075Path = path.join(tmpDir, 'sil075.mp3')
    await generateSilence(sil075Path, 0.75)

    // Step 7: 1.0s silence before Belle B outro
    const sil10Path = path.join(tmpDir, 'sil10.mp3')
    await generateSilence(sil10Path, 1.0)

    if (!bgMusicPath) {
      // ── 4a. No background music — just concat with proper structure ──────
      console.log('  ⚠️  No background music found — mixing without music')

      const concatListPath = path.join(tmpDir, 'concat.txt')
      const concatParts = [stingPath, introVoicePath, sil075Path, ...segPaths, sil10Path, outroVoicePath]
      await fs.writeFile(concatListPath, concatParts.map(p => `file '${p}'`).join('\n'))

      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-ar', '44100', '-ac', '2', '-b:a', '192k',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-y', outputPath
      ])
    } else {
      // ── 4b. Full mix with background music per ASC3 standard ─────────────
      //
      // SEQUENCE:
      //  sting | intro_voice | 0.75s | [2.5s music-only] | story_segs | [music rises+fades] | 1s | outro_voice
      //
      // Background music:
      //  - Steps 4–6 only (not under sting or Belle B)
      //  - Step 4: full volume for 2.5s (music-only atmosphere intro)
      //  - Step 5: ducked to musicVolume (15%) under all dialogue
      //  - Step 6: rises back to full volume, then fades out over 3s

      // Build the dialogue-only concat (sting + intro + silence + segments)
      // We'll handle music separately then merge

      // Concat: sting + intro_voice + 0.75s silence + story segments
      const dialogueConcatPath = path.join(tmpDir, 'dialogue_concat.txt')
      const dialogueParts = [stingPath, introVoicePath, sil075Path, ...segPaths]
      await fs.writeFile(dialogueConcatPath, dialogueParts.map(p => `file '${p}'`).join('\n'))

      const dialoguePath = path.join(tmpDir, 'dialogue.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', dialogueConcatPath,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', dialoguePath
      ])

      // Calculate timing offsets
      const stingDur   = await getAudioDuration(stingPath)
      const introDur   = await getAudioDuration(introVoicePath)
      const musicStart = stingDur + introDur + 0.75  // music begins after sting + intro + pause

      const segsDur = (await Promise.all(segPaths.map(p => getAudioDuration(p)))).reduce((a, b) => a + b, 0)
      const musicEnd = musicStart + 2.5 + segsDur  // 2.5s music-only + all story segments

      // Music volume envelope:
      // 0 → musicStart: silent (no music under sting or Belle B)
      // musicStart → musicStart+2.5s: full volume (atmosphere intro — Steps 4)
      // musicStart+2.5s → musicEnd: ducked to musicVolume (Steps 5)
      // musicEnd → musicEnd+3s: rise back to full then fade out (Steps 6)
      const musicAtmoEnd   = musicStart + 2.5
      const musicFadeStart = musicEnd
      const musicFadeEnd   = musicEnd + 3.0

      const totalDur = musicFadeEnd + 1.0 + (await getAudioDuration(outroVoicePath)) + 2.0

      console.log(`  🎵 Music timing: starts at ${musicStart.toFixed(1)}s, atmo ends ${musicAtmoEnd.toFixed(1)}s, ducked ${musicAtmoEnd.toFixed(1)}–${musicFadeStart.toFixed(1)}s, fades ${musicFadeStart.toFixed(1)}–${musicFadeEnd.toFixed(1)}s`)

      // Build music track with volume automation using volume filter
      // volume filter: silent before music starts, full for atmosphere, ducked for story, rises then fades
      const musicProcessedPath = path.join(tmpDir, 'music_processed.mp3')
      const volFilter = [
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo`,
        // Delay music start to musicStart (silence before that)
        `,adelay=${Math.round(musicStart * 1000)}|${Math.round(musicStart * 1000)}`,
        // Trim to total duration
        `,atrim=end=${totalDur}`,
        // Loop seamlessly
      ].join('')

      // Use volume filter with enable expressions for the different phases
      // Phase 1: musicStart to musicAtmoEnd — full volume (1.0)
      // Phase 2: musicAtmoEnd to musicFadeStart — ducked (musicVolume = 0.15)
      // Phase 3: musicFadeStart to musicFadeEnd — rise from ducked back to full, then fade to 0
      const musicVolFilter =
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `atrim=end=${totalDur},` +
        `adelay=${Math.round(musicStart * 1000)}|${Math.round(musicStart * 1000)},` +
        // Apply volume envelope
        `volume=enable='between(t,${musicStart},${musicAtmoEnd})':volume=1.0,` +
        `volume=enable='between(t,${musicAtmoEnd},${musicFadeStart})':volume=${musicVolume},` +
        // Rise back to full then fade out
        `afade=t=in:st=${musicFadeStart}:d=1.5:curve=log,` +
        `afade=t=out:st=${musicFadeStart + 1.5}:d=1.5[music]`

      // Concat dialogue + 1s silence + outro
      const outroConcatPath = path.join(tmpDir, 'outro_concat.txt')
      await fs.writeFile(outroConcatPath, [dialoguePath, sil10Path, outroVoicePath].map(p => `file '${p}'`).join('\n'))
      const fullDialoguePath = path.join(tmpDir, 'full_dialogue.mp3')
      await execFileAsync(FFMPEG_PATH, [
        '-f', 'concat', '-safe', '0', '-i', outroConcatPath,
        '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', fullDialoguePath
      ])

      // Final mix: dialogue + music, then loudnorm to -14 LUFS
      await execFileAsync(FFMPEG_PATH, [
        '-i', fullDialoguePath,
        '-stream_loop', '-1', '-i', bgMusicPath!,
        '-filter_complex',
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[dialogue];` +
          musicVolFilter + `;` +
          `[dialogue][music]amix=inputs=2:duration=first:dropout_transition=0[premix];` +
          `[premix]loudnorm=I=-14:TP=-1.5:LRA=11[out]`,
        '-map', '[out]',
        '-ar', '44100', '-ac', '2', '-b:a', '192k',
        '-y', outputPath
      ])
    }

    console.log('  🎛️  ffmpeg mix complete')

    // ── 5. Upload to Supabase ────────────────────────────────────────────
    const buffer = await fs.readFile(outputPath)
    const storagePath = `asc3/${folderId}/final_mix.mp3`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`)

    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(storagePath)

    await supabase.from('stories').update({ audio_url: publicUrl }).eq('id', storyId)

    const finalDuration = await getAudioDuration(outputPath)
    console.log(`✅ Final mix ready (${finalDuration.toFixed(1)}s): ${publicUrl}`)
    return NextResponse.json({ success: true, finalAudioUrl: publicUrl, durationSecs: finalDuration })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Render final mix error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
