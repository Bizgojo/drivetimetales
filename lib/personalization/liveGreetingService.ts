/**
 * PERS-LIVE-001 — storage / LLM / TTS side of live listener-name greetings.
 * Pure rules live in liveGreeting.ts.
 *
 * Runs inside the long-lived Next.js server on EC2, so an in-flight
 * generation can be shared between the playlist request (which starts it)
 * and the player's clip request (which waits for it).
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CANONICAL_BELLE_B_VOICE_ID } from '@/lib/voiceConstants'
import {
  buildGreetingPrompt,
  cleanGreetingCandidate,
  fallbackGreetingTemplate,
  fillGreeting,
  greetingClipPath,
  greetingTemplatePath,
  nameSlug,
  validateGreetingTemplate,
  type LiveGreetingContext,
  type LiveGreetingKind,
} from '@/lib/personalization/liveGreeting'

const BUCKET = 'audio'
const WRITER_MODEL = process.env.LIVE_GREETING_WRITER_MODEL || 'claude-sonnet-4-6'
const TTS_MODEL = process.env.LIVE_GREETING_TTS_MODEL || 'eleven_multilingual_v2'
// Same Belle B settings as app/api/admin/generate-belle-intro.
const BELLE_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }

let cachedSupabase: SupabaseClient | null = null
function db(): SupabaseClient {
  if (!cachedSupabase) {
    cachedSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return cachedSupabase
}

export function publicStorageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

async function storageObjectExists(path: string): Promise<boolean> {
  try {
    // Cache-busting query so a CDN-cached 404 from before the upload is never reused.
    const res = await fetch(`${publicStorageUrl(path)}?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Story context
// ---------------------------------------------------------------------------

export type GreetingStory = {
  id: string
  series_id: string | null
  series_name?: string | null
  title?: string | null
  primary_genre?: string | null
  genre?: string | null
  description?: string | null
  series_total_episodes?: number | null
  series_is_finale?: boolean | null
  outro_text?: string | null
}

export async function loadGreetingStory(storyId: string): Promise<GreetingStory | null> {
  const { data, error } = await db()
    .from('stories')
    .select('id,series_id,series_name,title,primary_genre,genre,description,series_total_episodes,series_is_finale,outro_text')
    .eq('id', storyId)
    .maybeSingle()
  if (error) throw new Error('story lookup failed: ' + error.message)
  return (data as GreetingStory) || null
}

async function seriesContext(story: GreetingStory, kind: LiveGreetingKind): Promise<LiveGreetingContext> {
  // Series-level description comes from episode one when available.
  let description = story.description || null
  if (story.series_id) {
    const { data } = await db()
      .from('stories')
      .select('description')
      .eq('series_id', story.series_id)
      .eq('series_episode_number', 1)
      .maybeSingle()
    if ((data as any)?.description) description = (data as any).description
  }
  return {
    seriesTitle: String(story.series_name || story.title || '').trim(),
    genre: story.primary_genre || story.genre || null,
    totalEpisodes: story.series_total_episodes ?? null,
    seriesDescription: description,
    finaleOutroText: kind === 'finale_signoff' ? story.outro_text || null : null,
  }
}

// ---------------------------------------------------------------------------
// Template (one per series + kind)
// ---------------------------------------------------------------------------

export type GreetingTemplateRecord = {
  template: string
  source: 'writer' | 'fallback'
  model: string | null
  attempts: Array<{ text: string; issues: string[] }>
  createdAt: string
  seriesId: string
  kind: LiveGreetingKind
}

async function readTemplate(seriesId: string, kind: LiveGreetingKind): Promise<GreetingTemplateRecord | null> {
  const { data, error } = await db().storage.from(BUCKET).download(greetingTemplatePath(seriesId, kind))
  if (error || !data) return null
  try {
    const parsed = JSON.parse(await data.text()) as GreetingTemplateRecord
    if (parsed?.template && validateGreetingTemplate(kind, parsed.template).length === 0) return parsed
    if (parsed?.template && parsed.source === 'fallback') return parsed
  } catch {
    /* unreadable → rewrite */
  }
  return null
}

async function writeTemplateWithLlm(kind: LiveGreetingKind, ctx: LiveGreetingContext) {
  const attempts: Array<{ text: string; issues: string[] }> = []
  if (!process.env.ANTHROPIC_API_KEY) return { template: null as string | null, attempts }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let prompt = buildGreetingPrompt(kind, ctx)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const msg = await anthropic.messages.create({
      model: WRITER_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content.map((block: any) => (block?.type === 'text' ? block.text : '')).join(' ')
    const text = cleanGreetingCandidate(raw)
    const issues = validateGreetingTemplate(kind, text)
    attempts.push({ text, issues })
    if (!issues.length) return { template: text, attempts }
    prompt = `${buildGreetingPrompt(kind, ctx)}\n\nYour previous line was rejected: ${issues.join('; ')}.\nPrevious line: ${text}\nWrite a new line that follows every rule.`
  }
  return { template: null, attempts }
}

export async function ensureGreetingTemplate(story: GreetingStory, kind: LiveGreetingKind): Promise<GreetingTemplateRecord> {
  const seriesId = String(story.series_id || '')
  if (!seriesId) throw new Error('story has no series_id')
  const existing = await readTemplate(seriesId, kind)
  if (existing) return existing

  const ctx = await seriesContext(story, kind)
  let written: { template: string | null; attempts: Array<{ text: string; issues: string[] }> } = { template: null, attempts: [] }
  try {
    written = await writeTemplateWithLlm(kind, ctx)
  } catch (err) {
    console.warn('[live-greeting] writer failed; using fallback line:', err instanceof Error ? err.message : String(err))
  }
  const record: GreetingTemplateRecord = {
    template: written.template || fallbackGreetingTemplate(kind, ctx),
    source: written.template ? 'writer' : 'fallback',
    model: written.template ? WRITER_MODEL : null,
    attempts: written.attempts,
    createdAt: new Date().toISOString(),
    seriesId,
    kind,
  }
  const { error } = await db().storage.from(BUCKET).upload(
    greetingTemplatePath(seriesId, kind),
    Buffer.from(JSON.stringify(record, null, 2)),
    { contentType: 'application/json', upsert: true }
  )
  if (error) console.warn('[live-greeting] template save failed (clip still made):', error.message)
  console.log('[live-greeting] template written', { seriesId, kind, source: record.source, template: record.template })
  return record
}

// ---------------------------------------------------------------------------
// Audio (one per series + kind + first name)
// ---------------------------------------------------------------------------

async function belleTts(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY missing')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CANONICAL_BELLE_B_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: BELLE_SETTINGS }),
  })
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Mono → 44.1 kHz stereo 192k (iOS plays stereo segments reliably) with a
 * lead-in pause: short after the announcement, longer after the finale's
 * outro music so the goodbye doesn't crowd it.
 */
async function toPlayerMp3(mono: Buffer, leadInMs: number): Promise<Buffer> {
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const os = await import('os')
    const path = await import('path')
    const fs = await import('fs')
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tmpIn = path.join(os.tmpdir(), `live_greeting_in_${stamp}.mp3`)
    const tmpOut = path.join(os.tmpdir(), `live_greeting_out_${stamp}.mp3`)
    fs.writeFileSync(tmpIn, mono)
    await promisify(execFile)('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', tmpIn,
      '-af', `adelay=${Math.max(0, Math.round(leadInMs))}:all=1,apad=pad_dur=0.4`,
      '-ac', '2', '-ar', '44100', '-b:a', '192k', '-y', tmpOut,
    ])
    const out = fs.readFileSync(tmpOut)
    try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut) } catch { /* best effort */ }
    return out
  } catch (err) {
    console.warn('[live-greeting] ffmpeg unavailable; using mono clip:', err instanceof Error ? err.message : String(err))
    return mono
  }
}

const inFlight = new Map<string, Promise<string>>()

/**
 * Returns the public URL of the clip for (series, kind, first name), making it
 * if needed. Concurrent callers for the same clip share one generation.
 */
export function ensureGreetingClip(story: GreetingStory, kind: LiveGreetingKind, firstName: string): Promise<string> {
  const seriesId = String(story.series_id || '')
  const slug = nameSlug(firstName)
  if (!seriesId || !slug) return Promise.reject(new Error('series and first name required'))
  const path = greetingClipPath(seriesId, kind, slug)
  const existing = inFlight.get(path)
  if (existing) return existing

  const work = (async () => {
    if (await storageObjectExists(path)) return publicStorageUrl(path)
    const startedAt = Date.now()
    const record = await ensureGreetingTemplate(story, kind)
    const text = fillGreeting(record.template, firstName)
    const audio = await toPlayerMp3(await belleTts(text), kind === 'finale_signoff' ? 600 : 350 /* FINALE-SIGNOFF-ORDER-001: follows the last scene directly now */)
    const { error } = await db().storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mpeg', upsert: true })
    if (error) throw new Error('clip upload failed: ' + error.message)
    console.log('[live-greeting] clip made', { seriesId, kind, slug, ms: Date.now() - startedAt, ttsModel: TTS_MODEL })
    return publicStorageUrl(path)
  })()

  inFlight.set(path, work)
  work.finally(() => inFlight.delete(path)).catch(() => {})
  return work
}

/** Fire-and-forget start used by the playlist route; never throws. */
export function startGreetingClip(story: GreetingStory, kind: LiveGreetingKind, firstName: string): void {
  ensureGreetingClip(story, kind, firstName).catch((err) => {
    console.warn('[live-greeting] background generation failed:', { storyId: story.id, kind, error: err instanceof Error ? err.message : String(err) })
  })
}

/** Resolves to the clip URL, or null if it is not ready within waitMs. */
export async function waitForGreetingClip(story: GreetingStory, kind: LiveGreetingKind, firstName: string, waitMs: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), waitMs) })
  try {
    return await Promise.race([ensureGreetingClip(story, kind, firstName), timeout])
  } catch (err) {
    console.warn('[live-greeting] clip unavailable:', { storyId: story.id, kind, error: err instanceof Error ? err.message : String(err) })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
