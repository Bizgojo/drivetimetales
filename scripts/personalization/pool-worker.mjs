#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import dotenv from 'dotenv'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

dotenv.config({ path: '.env.local' })

const FFMPEG_PATH = ffmpegInstaller.path
const execFileAsync = promisify(execFile)
const BOLD_RED = '\x1b[1;31m'
const RESET = '\x1b[0m'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const BASE_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/audio`
const STING_URL = `${BASE_STORAGE}/sting/ET_Signature_Sting_v7.mp3.mp3`
const BELLE_B_VOICE_ID = 'GMhgX8fCR9GUtd3kmlKC'
const BELLE_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}
const BELLE_ENTER_SEC = 1.5
const STING_FADE_UNDER_BELLE_SEC = 1.2
const OPENERS_PER_TONE = Number(process.env.OPENERS_PER_TONE || 0)
const CONCURRENCY = 3
const WATCH_INTERVAL_MS = 15_000

function startMarker(label) {
  console.log(`${BOLD_RED}========== START ${label} ==========${RESET}`)
}

function endMarker(label) {
  console.log(`${BOLD_RED}========== END ${label} ==========${RESET}`)
}

function requireEnv() {
  const missing = []
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY')
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`)
}

function cleanError(err) {
  return String(err instanceof Error ? err.message : err).slice(0, 2000)
}

function safePathPart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || createHash('sha256').update(String(value || 'empty')).digest('hex').slice(0, 12)
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function getAudioDuration(filePath) {
  const result = await execFileAsync(FFMPEG_PATH, ['-i', filePath, '-f', 'null', '-'], { encoding: 'utf8' }).catch(e => ({ stdout: '', stderr: e.stderr || '' }))
  const out = result.stderr || result.stdout || ''
  const match = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (!match) return 0
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])
}

async function reformatAudio(input, output) {
  await execFileAsync(FFMPEG_PATH, [
    '-i', input,
    '-ar', '44100', '-ac', '2', '-b:a', '192k',
    '-y', output,
  ])
}

async function renderOpenerVoice(text, output) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: BELLE_SETTINGS,
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS failed ${res.status}: ${await res.text()}`)
  const rawPath = output.replace(/\.mp3$/, '.raw.mp3')
  try {
    await fs.writeFile(rawPath, Buffer.from(await res.arrayBuffer()))
    await reformatAudio(rawPath, output)
  } finally {
    await fs.unlink(rawPath).catch(() => {})
  }
}

async function uploadAudio(storagePath, filePath) {
  const buffer = await fs.readFile(filePath)
  const { error } = await supabase.storage.from('audio').upload(storagePath, buffer, {
    contentType: 'audio/mpeg',
    cacheControl: '31536000',
    upsert: true,
  })
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`)
  return `${BASE_STORAGE}/${storagePath}`
}

async function claimOneJob({ retry = false } = {}) {
  const statuses = retry ? ['pending', 'failed'] : ['pending']

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data: candidates, error: readError } = await supabase
      .from('name_pool_jobs')
      .select('id,pronunciation_key,canonical_spelling,status,requested_at')
      .in('status', statuses)
      .order('requested_at', { ascending: true })
      .limit(10)

    if (readError) throw new Error(`Failed to read pending jobs: ${readError.message}`)
    if (!candidates?.length) return null

    for (const candidate of candidates) {
      const { data: claimed, error: claimError } = await supabase
        .from('name_pool_jobs')
        .update({
          status: 'processing',
          error_text: null,
          finished_at: null,
        })
        .eq('id', candidate.id)
        .eq('status', candidate.status)
        .select('id,pronunciation_key,canonical_spelling,status,requested_at')
        .maybeSingle()

      if (claimError) throw new Error(`Failed to claim job ${candidate.id}: ${claimError.message}`)
      if (claimed) return claimed
    }
  }

  return null
}

async function loadPool(pronunciationKey) {
  const { data, error } = await supabase
    .from('name_pools')
    .select('pronunciation_key,canonical_spelling,phonetic_hint,status')
    .eq('pronunciation_key', pronunciationKey)
    .single()
  if (error || !data) throw new Error(`Failed to load name_pools row for ${pronunciationKey}: ${error?.message || 'not found'}`)
  return data
}

async function loadOpeners() {
  const { data, error } = await supabase
    .from('personalized_intro_openers')
    .select('id,tone_cluster,template_text')
    .eq('is_active', true)
    .order('tone_cluster', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`Failed to load personalized openers: ${error.message}`)

  if (!OPENERS_PER_TONE || OPENERS_PER_TONE <= 0) return data || []

  const counts = new Map()
  return (data || []).filter(opener => {
    const tone = opener.tone_cluster || 'unknown'
    const count = counts.get(tone) || 0
    if (count >= OPENERS_PER_TONE) return false
    counts.set(tone, count + 1)
    return true
  })
}

async function loadExistingClipOpenerIds(pronunciationKey) {
  const { data, error } = await supabase
    .from('name_opener_clips')
    .select('opener_id')
    .eq('pronunciation_key', pronunciationKey)
  if (error) throw new Error(`Failed to load existing name_opener_clips: ${error.message}`)
  return new Set((data || []).map(row => row.opener_id))
}

async function mapLimit(items, limit, fn) {
  const results = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function renderClipForOpener({ pronunciationKey, nameForSpeech, opener }) {
  const safeKey = safePathPart(pronunciationKey)
  const safeOpener = safePathPart(opener.id)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'et-name-pool-'))
  const stingRaw = path.join(tmpDir, 'sting.raw.mp3')
  const openerVoice = path.join(tmpDir, 'opener_voice.mp3')
  const introClip = path.join(tmpDir, 'intro_clip.mp3')

  try {
    const text = String(opener.template_text || '').replace(/\[LISTENER_NAME\]/g, nameForSpeech)
    await renderOpenerVoice(text, openerVoice)
    await download(STING_URL, stingRaw)

    await execFileAsync(FFMPEG_PATH, [
      '-i', stingRaw,
      '-i', openerVoice,
      '-filter_complex',
      `[0:a]afade=t=out:st=${BELLE_ENTER_SEC}:d=${STING_FADE_UNDER_BELLE_SEC},aformat=sample_rates=44100:channel_layouts=stereo[s];[1:a]adelay=${Math.round(BELLE_ENTER_SEC * 1000)}|${Math.round(BELLE_ENTER_SEC * 1000)},aformat=sample_rates=44100:channel_layouts=stereo[v];[s][v]amix=inputs=2:duration=longest:normalize=0[out]`,
      '-map', '[out]',
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', introClip,
    ])

    const openerOnlyPath = `personalized/openers/${safeKey}/${safeOpener}_voice.mp3`
    const introPath = `personalized/openers/${safeKey}/${safeOpener}.mp3`
    const [openerOnlyUrl, introAudioUrl] = await Promise.all([
      uploadAudio(openerOnlyPath, openerVoice),
      uploadAudio(introPath, introClip),
    ])
    const durationMs = Math.round((await getAudioDuration(introClip)) * 1000)

    const { error: upsertError } = await supabase
      .from('name_opener_clips')
      .upsert({
        pronunciation_key: pronunciationKey,
        opener_id: opener.id,
        tone_cluster: opener.tone_cluster,
        intro_audio_url: introAudioUrl,
        opener_only_url: openerOnlyUrl,
        duration_ms: durationMs,
      }, { onConflict: 'pronunciation_key,opener_id' })

    if (upsertError) throw new Error(`Failed to upsert name_opener_clips: ${upsertError.message}`)
    return { ok: true, openerId: opener.id }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function countClips(pronunciationKey) {
  const { count, error } = await supabase
    .from('name_opener_clips')
    .select('opener_id', { count: 'exact', head: true })
    .eq('pronunciation_key', pronunciationKey)
  if (error) throw new Error(`Failed to count name_opener_clips: ${error.message}`)
  return count || 0
}

async function markJobFailed(job, err) {
  const errorText = cleanError(err)
  console.error(`[name-pool-worker] job failed key=${job?.pronunciation_key}: ${errorText}`)
  if (job?.id) {
    await supabase
      .from('name_pool_jobs')
      .update({ status: 'failed', error_text: errorText, finished_at: new Date().toISOString() })
      .eq('id', job.id)
  }
  if (job?.pronunciation_key) {
    await supabase
      .from('name_pools')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('pronunciation_key', job.pronunciation_key)
  }
}

async function processJob(job) {
  console.log(`[name-pool-worker] processing job=${job.id} key=${job.pronunciation_key}`)
  const pool = await loadPool(job.pronunciation_key)
  const nameForSpeech = String(pool.phonetic_hint || pool.canonical_spelling || job.canonical_spelling || '').trim()
  if (!nameForSpeech) throw new Error(`No nameForSpeech for ${job.pronunciation_key}`)

  const openers = await loadOpeners()
  const existing = await loadExistingClipOpenerIds(job.pronunciation_key)
  const pendingOpeners = openers.filter(opener => !existing.has(opener.id))
  console.log(`[name-pool-worker] key=${job.pronunciation_key} openers=${openers.length} existing=${existing.size} pending=${pendingOpeners.length}`)

  const results = await mapLimit(pendingOpeners, CONCURRENCY, async opener => {
    try {
      const result = await renderClipForOpener({
        pronunciationKey: job.pronunciation_key,
        nameForSpeech,
        opener,
      })
      console.log(`[name-pool-worker] key=${job.pronunciation_key} opener=${opener.id} ok`)
      return result
    } catch (err) {
      console.error(`[name-pool-worker] key=${job.pronunciation_key} opener=${opener.id} fail: ${cleanError(err)}`)
      throw err
    }
  })

  const okCount = results.filter(result => result?.ok).length
  const clipCount = await countClips(job.pronunciation_key)
  const now = new Date().toISOString()
  const { error: poolError } = await supabase
    .from('name_pools')
    .update({ status: 'ready', clip_count: clipCount, updated_at: now })
    .eq('pronunciation_key', job.pronunciation_key)
  if (poolError) throw new Error(`Failed to mark name_pools ready: ${poolError.message}`)

  const { error: jobError } = await supabase
    .from('name_pool_jobs')
    .update({ status: 'done', error_text: null, finished_at: now })
    .eq('id', job.id)
  if (jobError) throw new Error(`Failed to mark name_pool_jobs done: ${jobError.message}`)

  console.log(`[name-pool-worker] job done key=${job.pronunciation_key} rendered=${okCount} clip_count=${clipCount}`)
}

async function runOnce({ retry = false } = {}) {
  requireEnv()
  let processed = 0
  while (true) {
    const job = await claimOneJob({ retry })
    if (!job) break
    processed += 1
    try {
      await processJob(job)
    } catch (err) {
      await markJobFailed(job, err)
    }
  }
  console.log(`[name-pool-worker] run complete processed=${processed}`)
  return processed
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const watch = args.has('--watch')
  const retry = args.has('--retry')

  startMarker('name-pool-worker')
  try {
    do {
      await runOnce({ retry })
      if (watch) await new Promise(resolve => setTimeout(resolve, WATCH_INTERVAL_MS))
    } while (watch)
  } finally {
    endMarker('name-pool-worker')
  }
}

main().catch(err => {
  console.error('[name-pool-worker] fatal:', cleanError(err))
  process.exitCode = 1
})
