import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const STING_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/sting/ET_Signature_Sting_v7.mp3.mp3`
const BELLE_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }
const PERSONALIZED_MIX_VERSION = 'v1'
const STING_TO_BELLE_SEC = 0.5
const INTRO_GAP_SEC = 0.4

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('@ffmpeg-installer/ffmpeg').path } catch { /* system ffmpeg */ }

const execFileAsync = promisify(execFile)

type StoryAudioRow = {
  id: string
  title: string | null
  genre: string | null
  primary_genre: string | null
  audio_url: string | null
  story_audio_url: string | null
  outro_audio_url: string | null
  outro_with_music_url: string | null
  script_version: number | null
  updated_at: string | null
}

type PersonalizedOpener = {
  id: string
  tone_cluster: string
  template_text: string
  name_position: string | null
}

type UserOpenerClip = {
  id: string
  opener_id: string
  audio_url: string | null
  last_used_at: string | null
  rotation_count: number | null
}

function hashPart(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'friend'
}

function normalizeGenre(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

async function download(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function getAudioDuration(filePath: string): Promise<number> {
  const result = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = (result as any).stderr || (result as any).stdout || ''
  const match = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (!match) return 0
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
}

async function publicFileExists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

async function generateSilence(dest: string, seconds: number) {
  await execFileAsync(FFMPEG_PATH, [
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(seconds),
    '-ar', '44100', '-ac', '2', '-b:a', '192k',
    '-y', dest,
  ])
}

async function reformatAudio(input: string, output: string) {
  await execFileAsync(FFMPEG_PATH, [
    '-i', input,
    '-ar', '44100', '-ac', '2', '-b:a', '192k',
    '-y', output,
  ])
}

async function concatAudio(files: string[], output: string) {
  const listPath = path.join(os.tmpdir(), `personalized_concat_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`)
  try {
    await fs.writeFile(listPath, files.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'))
    await execFileAsync(FFMPEG_PATH, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', output,
    ])
  } finally {
    await fs.unlink(listPath).catch(() => {})
  }
}

async function renderOpenerAudio(text: string, output: string) {
  const elKey = process.env.ELEVENLABS_API_KEY
  if (!elKey) throw new Error('ELEVENLABS_API_KEY is not configured')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CANONICAL_BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: BELLE_SETTINGS }),
  })
  if (!res.ok) throw new Error(`Belle opener generation failed: ${res.status} ${await res.text()}`)
  const rawPath = output.replace(/\.mp3$/, '.raw.mp3')
  try {
    await fs.writeFile(rawPath, Buffer.from(await res.arrayBuffer()))
    await reformatAudio(rawPath, output)
  } finally {
    await fs.unlink(rawPath).catch(() => {})
  }
}

async function resolveToneCluster(story: StoryAudioRow) {
  const genre = normalizeGenre(story.primary_genre || story.genre)
  if (!genre) return 'dark'
  const { data, error } = await supabase
    .from('genre_tone_cluster')
    .select('tone_cluster')
    .ilike('genre', genre)
    .maybeSingle()
  if (error) {
    console.warn('[personalized-final-mix] genre cluster lookup failed:', error.message)
    return 'dark'
  }
  return String(data?.tone_cluster || 'dark').trim() || 'dark'
}

async function pickOpener(userId: string, preferredName: string, toneCluster: string) {
  const { data: openers, error: openerError } = await supabase
    .from('personalized_intro_openers')
    .select('id,tone_cluster,template_text,name_position')
    .eq('tone_cluster', toneCluster)
    .eq('is_active', true)
  if (openerError) throw new Error(`Failed to load personalized openers: ${openerError.message}`)
  if (!openers?.length) throw new Error(`No active personalized openers for tone cluster "${toneCluster}"`)

  const openerIds = openers.map((opener: PersonalizedOpener) => opener.id)
  const { data: clips, error: clipError } = await supabase
    .from('user_intro_opener_clips')
    .select('id,opener_id,audio_url,last_used_at,rotation_count')
    .eq('user_id', userId)
    .eq('preferred_name', preferredName)
    .in('opener_id', openerIds)
  if (clipError) throw new Error(`Failed to load user opener clips: ${clipError.message}`)

  const clipByOpener = new Map<string, UserOpenerClip>((clips || []).map((clip: UserOpenerClip) => [clip.opener_id, clip]))
  const ranked = [...(openers as PersonalizedOpener[])]
    .map(opener => ({ opener, clip: clipByOpener.get(opener.id) || null, random: Math.random() }))
    .sort((a, b) => {
      const aTime = a.clip?.last_used_at ? Date.parse(a.clip.last_used_at) : 0
      const bTime = b.clip?.last_used_at ? Date.parse(b.clip.last_used_at) : 0
      return aTime - bTime || a.random - b.random
    })

  return ranked[0]
}

async function renderOrReuseOpenerClip(userId: string, preferredName: string, opener: PersonalizedOpener, existingClip: UserOpenerClip | null) {
  if (existingClip?.audio_url && await publicFileExists(existingClip.audio_url)) return existingClip

  const spokenText = opener.template_text.replace(/\[LISTENER_NAME\]/g, preferredName)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-opener-'))
  const openerPath = path.join(tmpDir, 'opener.mp3')
  try {
    await renderOpenerAudio(spokenText, openerPath)
    const buffer = await fs.readFile(openerPath)
    const storagePath = `personalized-openers/${hashPart(userId)}/${safeName(preferredName)}/${opener.id}.mp3`
    const { error: uploadError } = await supabase.storage.from('audio').upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
      upsert: true,
    })
    if (uploadError) throw new Error(`Failed to upload opener clip: ${uploadError.message}`)
    const audioUrl = `${BASE_STORAGE}/${storagePath}`
    const { data: clip, error: upsertError } = await supabase
      .from('user_intro_opener_clips')
      .upsert({
        user_id: userId,
        opener_id: opener.id,
        preferred_name: preferredName,
        audio_url: audioUrl,
      }, { onConflict: 'user_id,opener_id,preferred_name' })
      .select('id,opener_id,audio_url,last_used_at,rotation_count')
      .single()
    if (upsertError) throw new Error(`Failed to save opener clip: ${upsertError.message}`)
    return clip as UserOpenerClip
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function markOpenerUsed(clip: UserOpenerClip) {
  const count = Number(clip.rotation_count || 0)
  const { error } = await supabase
    .from('user_intro_opener_clips')
    .update({
      last_used_at: new Date().toISOString(),
      rotation_count: count + 1,
    })
    .eq('id', clip.id)
  if (error) console.warn('[personalized-final-mix] failed to mark opener used:', error.message)
}

async function renderPersonalizedAudio(story: StoryAudioRow, userId: string, preferredName: string, opener: PersonalizedOpener, openerAudioUrl: string) {
  const scriptVersion = Number(story.script_version || 1)
  const nameHash = hashPart(preferredName.toLowerCase())
  const userHash = hashPart(userId)
  const storagePath = `asc3/${story.id}/personalized/${userHash}/${nameHash}/${scriptVersion}/${opener.id}/${PERSONALIZED_MIX_VERSION}/final_mix.mp3`
  const publicUrl = `${BASE_STORAGE}/${storagePath}`
  if (await publicFileExists(publicUrl)) return { finalMixUrl: publicUrl, cached: true }

  const bodyUrl = String(story.story_audio_url || '').trim()
  const outroUrl = String(story.outro_with_music_url || story.outro_audio_url || '').trim()
  if (!bodyUrl) throw new Error('Story is missing story_audio_url')
  if (!outroUrl) throw new Error('Story is missing outro_with_music_url/outro_audio_url')

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-personalized-mix-'))
  const stingRaw = path.join(tmpDir, 'sting.raw.mp3')
  const openerRaw = path.join(tmpDir, 'opener.raw.mp3')
  const bodyRaw = path.join(tmpDir, 'body.raw.mp3')
  const outroRaw = path.join(tmpDir, 'outro.raw.mp3')
  const opener44 = path.join(tmpDir, 'opener.44.mp3')
  const body44 = path.join(tmpDir, 'body.44.mp3')
  const outro44 = path.join(tmpDir, 'outro.44.mp3')
  const stingFade = path.join(tmpDir, 'sting_fade.mp3')
  const gap = path.join(tmpDir, 'gap.mp3')
  const finalPath = path.join(tmpDir, 'final_mix.mp3')
  try {
    await Promise.all([
      download(STING_URL, stingRaw),
      download(openerAudioUrl, openerRaw),
      download(bodyUrl, bodyRaw),
      download(outroUrl, outroRaw),
    ])
    await Promise.all([
      reformatAudio(openerRaw, opener44),
      reformatAudio(bodyRaw, body44),
      reformatAudio(outroRaw, outro44),
      generateSilence(gap, INTRO_GAP_SEC),
    ])

    const stingDur = await getAudioDuration(stingRaw)
    await execFileAsync(FFMPEG_PATH, [
      '-i', stingRaw,
      '-filter_complex',
      `[0:a]afade=t=out:st=${STING_TO_BELLE_SEC}:d=${Math.max(0.5, stingDur - STING_TO_BELLE_SEC)},aformat=sample_rates=44100:channel_layouts=stereo[out]`,
      '-map', '[out]',
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', stingFade,
    ])
    await concatAudio([stingFade, gap, opener44, body44, outro44], finalPath)

    const buffer = await fs.readFile(finalPath)
    const { error: uploadError } = await supabase.storage.from('audio').upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
      upsert: true,
    })
    if (uploadError) throw new Error(`Failed to upload personalized final mix: ${uploadError.message}`)
    return { finalMixUrl: publicUrl, cached: false }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function renderPersonalizedFinalMix({
  storyId,
  userId,
  preferredName,
}: {
  storyId: string
  userId: string
  preferredName: string
}) {
  const cleanName = String(preferredName || '').trim()
  if (!storyId) throw new Error('storyId is required')
  if (!userId) throw new Error('userId is required')
  if (!cleanName) throw new Error('preferredName is required')

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id,title,genre,primary_genre,audio_url,story_audio_url,outro_audio_url,outro_with_music_url,script_version,updated_at')
    .eq('id', storyId)
    .single()
  if (storyError || !story) throw new Error(`Story not found: ${storyError?.message || storyId}`)

  const toneCluster = await resolveToneCluster(story as StoryAudioRow)
  const { opener, clip: existingClip } = await pickOpener(userId, cleanName, toneCluster)
  const clip = await renderOrReuseOpenerClip(userId, cleanName, opener, existingClip)
  if (!clip.audio_url) throw new Error('Personalized opener clip has no audio_url')
  const rendered = await renderPersonalizedAudio(story as StoryAudioRow, userId, cleanName, opener, clip.audio_url)
  await markOpenerUsed(clip)

  return {
    success: true,
    finalMixUrl: rendered.finalMixUrl,
    cached: rendered.cached,
    toneCluster,
    openerId: opener.id,
    openerTemplate: opener.template_text,
    openerClipUrl: clip.audio_url,
    scriptVersion: Number((story as StoryAudioRow).script_version || 1),
    assembly: 'sting_fade + 0.4s gap + opener + story_audio_url + outro; no master normalization',
  }
}
