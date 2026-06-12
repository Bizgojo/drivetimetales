import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { sanitizeSeriesTitle } from '@/lib/seriesTitle'
import { buildNamePalettePromptBlock } from '@/lib/story/namePalette'
import { recordProductionLearningEvent } from '@/lib/productionLearning'
import { isBelleBVoiceId } from '@/lib/voiceConstants'
import { runRenderFinalMix } from '../../../asc3/render-final-mix/core'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const WORKER_ID = `run-next:${process.pid}`
const LOCK_STALE_MS = 10 * 60 * 1000
// A job is a zombie when it is status=running, has no lock, and has not been
// touched in this long.  30 minutes is well past any legitimate inter-call gap.
const ZOMBIE_STALE_MS = 30 * 60 * 1000
const NEXT_STEP_AFTER_CREATE = 'generate_script'
const NEXT_STEP_AFTER_STANDALONE_SCRIPT = 'validate_script'
const NEXT_STEP_AFTER_STANDALONE_VALIDATION = 'validate_story_resolution'
const NEXT_STEP_AFTER_STANDALONE_RESOLUTION = 'voice_preflight'
const NEXT_STEP_AFTER_STANDALONE_PREFLIGHT = 'generate_voices'
const NEXT_STEP_AFTER_STANDALONE_VOICES = 'generate_belle_assets'
const NEXT_STEP_AFTER_STANDALONE_BELLE = 'validate_belle_assets'
const NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION = 'validate_belle_quality'
const NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR = 'repair_belle_quality'
const NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY = 'generate_music'
const NEXT_STEP_AFTER_STANDALONE_MUSIC = 'render_final_mix'
const NEXT_STEP_AFTER_STANDALONE_RENDER = 'complete_story_package'
const NEXT_STEP_AFTER_STANDALONE_PACKAGE = 'ready_for_review'
const NEXT_STEP_AFTER_SERIES_CREATE = 'generate_episode_script'
const NEXT_STEP_AFTER_SERIES_SCRIPTS = 'score_validate_package'
const NEXT_STEP_AFTER_SERIES_VALIDATION = 'series_voice_preflight'
const NEXT_STEP_AFTER_SERIES_PREFLIGHT = 'series_generate_voices'
const NEXT_STEP_AFTER_SERIES_VOICES = 'series_generate_belle_assets'
const NEXT_STEP_AFTER_SERIES_BELLE  = 'series_generate_music'
const NEXT_STEP_AFTER_SERIES_MUSIC  = 'series_render_final_mix'
const NEXT_STEP_AFTER_SERIES_RENDER = 'complete_story_package'
const TITLE_MAX_CHARS = 28
const DESCRIPTION_MAX_CHARS = 70
const DESCRIPTION_PAST_TENSE_RE = /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden)\b/i

type ProductionJob = {
  id: string
  queue_item_id: string | null
  story_id: string | null
  series_id: string | null
  job_type: string
  status: string
  current_step: string
  step_index: number
  input_json: any
  state_json: any
  error_json?: any
  logs: any[]
  locked_at: string | null
}

type AuthorRow = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  genre?: string | null
  narrative_voice?: string | null
  style_reference?: string | null
  style_description?: string | null
  narrator_id?: string | null
  narrator_voice_id?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

type VoicePreflightResult = {
  success?: boolean
  preflightOnly?: boolean
  cueCount?: number
  cues?: any[]
  narratorGenderCheck?: any
  estimatedSegmentCount?: any
  blockingReasons?: string[]
  metadata?: any
  error?: string
  [key: string]: any
}

type VoiceGenerationResult = {
  complete: boolean
  hardFailure: boolean
  skippedNonSegment: boolean
  storyId: string
  segmentNumber: number
  report: any
  state: any
}

type SeriesVoiceGenerationResult = VoiceGenerationResult & {
  seriesId: string
  episodeNumber: number
  episodeComplete: boolean
  allComplete: boolean
}

function bad(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status })
}

function nowIso() {
  return new Date().toISOString()
}

function appendLog(job: ProductionJob, message: string, details: Record<string, unknown> = {}) {
  const logs = Array.isArray(job.logs) ? job.logs : []
  return [
    ...logs,
    {
      at: nowIso(),
      step: normalizeStep(job.current_step),
      message,
      ...details,
    },
  ]
}

function normalizeStep(step: string) {
  return step === 'queued' ? 'create_story_row' : step
}

function queueValue(queueItem: any, camelKey: string, snakeKey: string = camelKey) {
  return queueItem?.[camelKey] ?? queueItem?.[snakeKey] ?? ''
}

function queuePlanValue(queueItem: any, label: string) {
  const notes = String(queueValue(queueItem, 'notes') || '')
  const match = notes.match(new RegExp(`^${label}:[ \\t]*([^\\r\\n]*)`, 'im'))
  return match?.[1]?.trim() || ''
}

function runtimeToMinutes(runtime: string) {
  const match = String(runtime || '').match(/\d+/)
  const minutes = match ? Number(match[0]) : 15
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 15
}

function titleFromQueue(queueItem: any) {
  const title = String(queueValue(queueItem, 'title')).trim()
  if (!title || /^untitled story idea$/i.test(title)) return ''
  return title
}

function segmentNumberFromName(name: string): number | null {
  const match = String(name || '').match(/^segment_(\d{4})\.mp3$/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isInteger(value) ? value : null
}

function firstMissingSegmentNumber(missingSegments: unknown, fallback: number): number {
  if (!Array.isArray(missingSegments)) return fallback
  const numbers = missingSegments
    .map(segmentNumberFromName)
    .filter((value): value is number => Number.isInteger(value))
    .sort((a, b) => a - b)
  return numbers[0] ?? fallback
}

function musicPromptFor(script: string, title: string, genre: string) {
  const prompt = extractHeader(script, 'SUNO PROMPT') || extractHeader(script, 'SUNO_PROMPT')
  if (prompt) return prompt
  const genrePart = genre || 'cinematic audio drama'
  return `Cinematic ${genrePart} instrumental score for ${title || 'this story'}. Atmospheric, emotionally specific, no vocals.`
}

function storyTypeFor(job: ProductionJob, queueItem: any): 'standalone' | 'series' {
  const fromJob = String(job.job_type || '').toLowerCase()
  if (fromJob === 'series') return 'series'
  if (fromJob === 'single') return 'standalone'
  const notes = String(queueValue(queueItem, 'notes')).toLowerCase()
  const totalEpisodes = totalEpisodesFor(queueItem)
  if (notes.includes('type: series') || totalEpisodes > 1) return 'series'
  return 'standalone'
}

function totalEpisodesFor(queueItem: any) {
  const explicit = queueValue(queueItem, 'totalEpisodes', 'total_episodes') || queuePlanValue(queueItem, 'Total episodes')
  const total = Number(explicit || 1)
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 1
}

function productionEventMetadata(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const input = job.input_json && typeof job.input_json === 'object' ? job.input_json : {}
  const queueItem = input.queueItem || {}
  const stateEpisodes = Array.isArray(state.episodes) ? state.episodes.length : 0
  const episodeCount = Number(
    state.totalEpisodes ||
    state.seriesCompleteStoryPackage?.episodeCount ||
    state.seriesValidation?.episodeCount ||
    stateEpisodes ||
    totalEpisodesFor(queueItem)
  )
  const seriesTitle = String(
    state.seriesTitle ||
    state.series?.title ||
    state.seriesPackage?.title ||
    queueValue(queueItem, 'title') ||
    ''
  ).trim()

  return {
    job_id: job.id,
    story_id: job.story_id || null,
    series_id: job.series_id || state.seriesId || null,
    series_title: seriesTitle || null,
    episode_count: Number.isFinite(episodeCount) && episodeCount > 0 ? Math.floor(episodeCount) : null,
  }
}

function durationSeconds(startedAt: string | null | undefined, completedAt: string) {
  if (!startedAt) return null
  const started = new Date(startedAt).getTime()
  const completed = new Date(completedAt).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null
  return Math.max(0, Math.round((completed - started) / 1000))
}

async function recordProductionEvent(job: ProductionJob, stage: string, status: 'started' | 'completed' | 'failed', extra: Record<string, unknown> = {}) {
  const payload = {
    ...productionEventMetadata(job),
    stage,
    status,
    ...extra,
  }

  const { error } = await supabase
    .from('production_job_events')
    .insert(payload)

  if (error) {
    console.warn('[run-next] production timing insert failed:', error.message)
  }
}

async function findOpenStageEvent(jobId: string, stage: string) {
  const { data, error } = await supabase
    .from('production_job_events')
    .select('id,started_at')
    .eq('job_id', jobId)
    .eq('stage', stage)
    .eq('status', 'started')
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[run-next] production timing lookup failed:', error.message)
    return null
  }

  return data as { id: string; started_at: string | null } | null
}

async function recordStageStarted(job: ProductionJob, stage: string) {
  const existing = await findOpenStageEvent(job.id, stage)
  if (existing) return

  await recordProductionEvent(job, stage, 'started', {
    started_at: nowIso(),
    completed_at: null,
    duration_seconds: null,
    error_message: null,
  })
}

async function recordStageCompleted(job: ProductionJob, stage: string) {
  const completedAt = nowIso()
  const existing = await findOpenStageEvent(job.id, stage)

  if (!existing) {
    await recordProductionEvent(job, stage, 'completed', {
      started_at: null,
      completed_at: completedAt,
      duration_seconds: null,
      error_message: null,
    })
    return
  }

  const { error } = await supabase
    .from('production_job_events')
    .update({
      ...productionEventMetadata(job),
      status: 'completed',
      completed_at: completedAt,
      duration_seconds: durationSeconds(existing.started_at, completedAt),
      error_message: null,
    })
    .eq('id', existing.id)

  if (error) {
    console.warn('[run-next] production timing completion update failed:', error.message)
  }
}

async function recordStageFailed(job: ProductionJob, stage: string, errorMessage: string) {
  const completedAt = nowIso()
  const existing = await findOpenStageEvent(job.id, stage)

  if (!existing) {
    await recordProductionEvent(job, stage, 'failed', {
      started_at: null,
      completed_at: completedAt,
      duration_seconds: null,
      error_message: errorMessage,
    })
    return
  }

  const { error } = await supabase
    .from('production_job_events')
    .update({
      ...productionEventMetadata(job),
      status: 'failed',
      completed_at: completedAt,
      duration_seconds: durationSeconds(existing.started_at, completedAt),
      error_message: errorMessage,
    })
    .eq('id', existing.id)

  if (error) {
    console.warn('[run-next] production timing failure update failed:', error.message)
  }
}

async function loadProductionJobForTiming(jobId: string) {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.warn('[run-next] production timing job reload failed:', error.message)
    return null
  }

  return data as ProductionJob | null
}

function productionErrorMessage(job: ProductionJob) {
  const errorJson = job.error_json && typeof job.error_json === 'object' ? job.error_json : {}
  return String(errorJson.message || errorJson.reason || errorJson.error || 'Production stage failed')
}

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function extractHeader(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function extractTitle(script: string): string | null {
  return extractHeader(script, 'TITLE') || null
}

function replaceOrInsertHeader(script: string, key: string, value: string): string {
  const headerPattern = new RegExp(`^${key}:\\s*.*$`, 'm')
  if (headerPattern.test(script)) return script.replace(headerPattern, `${key}: ${value}`)
  if (/^GENRE:\s*.*$/m.test(script)) return script.replace(/^GENRE:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  if (/^AUTHOR:\s*.*$/m.test(script)) return script.replace(/^AUTHOR:\s*.*$/m, (line) => `${line}\n${key}: ${value}`)
  return `${key}: ${value}\n${script}`
}

function sanitizeDescription(description: string): string {
  const clean = String(description || '')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .replace(/[.]{2,}|…/g, '')
    .trim()
  const fallback = 'A dangerous secret pulls every choice toward the truth.'
  const source = clean || fallback
  const maxChars = 70
  const weakEnding = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an)$/i
  let next = source
  if (next.length > maxChars) {
    next = ''
    for (const word of source.split(' ')) {
      const candidate = next ? `${next} ${word}` : word
      const punctuated = /[.!?]$/.test(candidate) ? candidate : `${candidate}.`
      if (punctuated.length > maxChars) break
      next = candidate
    }
  }
  next = (next || source.slice(0, maxChars)).replace(/[,\-:;.!?]+$/g, '').trim()
  while (weakEnding.test(next) && next.includes(' ')) next = next.split(' ').slice(0, -1).join(' ').trim()
  if (!next) next = fallback.replace(/[.!?]+$/g, '')
  if (!/[.!?]$/.test(next)) next = `${next}.`
  return next.length > maxChars ? fallback : next
}

function normalizeScriptDescription(script: string, fallbackDescription = '') {
  const description = sanitizeDescription(extractHeader(script, 'DESCRIPTION') || fallbackDescription)
  return {
    script: replaceOrInsertHeader(script, 'DESCRIPTION', description),
    description,
  }
}

function deterministicDescriptionForGenre(genre: string): string {
  const normalizedGenre = genre.toLowerCase()

  if (normalizedGenre.includes('mystery') || normalizedGenre.includes('thriller')) {
    return 'A driver finds a secret someone is willing to kill for.'
  }
  if (normalizedGenre.includes('horror')) {
    return 'A quiet place hides something that should not be awake.'
  }
  if (normalizedGenre.includes('comedy')) {
    return 'One bad decision turns an ordinary trip sideways.'
  }

  return 'One discovery changes everything before the road ends.'
}

function isInvalidStandaloneDescription(description: string): boolean {
  const clean = description
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim()

  if (!clean) return true
  if (clean.length > 65) return true
  if (/[.]{2,}|…/.test(clean)) return true
  if (!/[.!?]$/.test(clean)) return true

  const withoutPunctuation = clean.replace(/[.!?]+$/g, '').trim()
  const weakEnding = /\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an|ancient|old|forgotten|abandoned)$/i
  if (weakEnding.test(withoutPunctuation)) return true

  const weakGeneric = /^(a|an|the)?\s*(story|tale|journey|adventure)\s+(about|of)\b/i
  if (weakGeneric.test(withoutPunctuation)) return true

  const cutoffPatterns = [
    /\b(beneath|under|inside|outside|near|behind|beyond|within|between)\s+(the|a|an)\s+\w+$/i,
    /\b(secret|truth|clue|killer|stranger|place|thing|road|town|house)\s+(that|who|where|when)$/i,
  ]
  return cutoffPatterns.some((pattern) => pattern.test(withoutPunctuation))
}

function normalizeStandaloneDescription(script: string, genre: string) {
  const currentDescription = extractHeader(script, 'DESCRIPTION')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim()

  const description = isInvalidStandaloneDescription(currentDescription)
    ? deterministicDescriptionForGenre(genre)
    : currentDescription

  return {
    script: replaceOrInsertHeader(script, 'DESCRIPTION', description),
    description,
  }
}

function validateCardCopy(script: string) {
  const title = extractHeader(script, 'TITLE')
  const description = extractHeader(script, 'DESCRIPTION')
  const issues: string[] = []
  const titleWords = countWords(title)

  if (!title) {
    issues.push('TITLE is required.')
  } else {
    if (titleWords < 1 || titleWords > 5) {
      issues.push(`TITLE must be 1 to 5 words. Current: ${titleWords} words.`)
    }
    if (title.length > TITLE_MAX_CHARS) {
      issues.push(`TITLE must be ${TITLE_MAX_CHARS} characters or fewer so it fits one line on story cards. Current: ${title.length} characters.`)
    }
  }

  if (!description) {
    issues.push('DESCRIPTION is required.')
  } else {
    if (description.length > DESCRIPTION_MAX_CHARS) {
      issues.push(`DESCRIPTION must be ${DESCRIPTION_MAX_CHARS} characters or fewer so it fits two lines on story cards. Current: ${description.length} characters.`)
    }
    const pastTenseMatch = DESCRIPTION_PAST_TENSE_RE.exec(description)
    if (pastTenseMatch) {
      // Intentionally strict: any blocked word fails BEFORE audio generation.
      // This prevents ElevenLabs credit spend on scripts with story-card copy that
      // will be rejected by the app content team anyway.
      issues.push(
        `DESCRIPTION contains forbidden past-tense/blocked word: "${pastTenseMatch[0]}". ` +
        `Full DESCRIPTION text: "${description}". ` +
        `Rule: DESCRIPTION_PAST_TENSE_RE. ` +
        `Rewrite the DESCRIPTION in present tense (≤70 chars) using active-voice, present-tense verbs only. ` +
        `Blocked words: vanished, was, were, had, found, discovered, left, moved, sealed, signed, forged, buried, hidden.`
      )
    }
  }

  return issues
}

function extractBelleSection(script: string, kind: 'intro' | 'outro') {
  const marker = kind === 'intro' ? 'BELLE B INTRO' : 'BELLE B OUTRO'
  const markerIndex = script.search(new RegExp(`^${marker}\\s*$`, 'im'))
  if (markerIndex < 0) return ''
  const afterMarker = script.slice(markerIndex)
  const match = afterMarker.match(/^BELLE B:\s*(.+)$/im)
  return normalizeHeaderValue(match?.[1] || '')
}

function replaceBelleSection(script: string, kind: 'intro' | 'outro', text: string) {
  const marker = kind === 'intro' ? 'BELLE B INTRO' : 'BELLE B OUTRO'
  const pattern = new RegExp(`(^${marker}\\s*\\n(?:---\\s*\\n)?)(BELLE B:\\s*).*$`, 'im')
  if (!pattern.test(script)) throw new Error(`${marker} block is missing or malformed`)
  return script.replace(pattern, `$1$2${normalizeHeaderValue(text)}`)
}

function normalizeBelleRequiredText(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function belleTextIncludes(text: string, required: string) {
  const haystack = normalizeBelleRequiredText(text)
  const needle = normalizeBelleRequiredText(required)
  return Boolean(needle) && haystack.includes(needle)
}

function hasConcreteNarrativeHook(text: string) {
  return /\b(secret|danger|dangerous|conflict|mystery|mysterious|missing|vanish|vanished|disappear|disappeared|threat|threatened|betrayal|betrayed|lie|lied|hidden|buried|locked|stolen|murder|death|dead|killer|blood|blackmail|sabotage|trap|trapped|choice|warning|evidence|clue|case|crime|manifest|list|letter|message|record|signal|code|map|key|witness|suspect|truth|reveal|reckoning|ferry|ferryman|boat|captain|passenger|passengers|crossing|crossings|names?)\b/i.test(text)
}

function hasConcreteStoryMechanism(text: string) {
  return /\b(manifest|list|ledger|logbook|record|names?|passenger|passengers|ferry|ferryman|boat|captain|crossing|crossings|dock|cargo|ticket|schedule|route|wheelhouse|missing person|impossible name|impossible names)\b/i.test(text)
}

function hasWeakAtmosphericHook(text: string) {
  return /\b(something waiting|in the fog|on that river|your name written down|twenty years ago|secrets? in the fog|waiting in the fog)\b/i.test(text)
}

// ── Intro/outro position validator ────────────────────────────────────────────
// Deterministic pre-approval checks enforcing Belle B intro/outro content rules
// and episode-position rules before a story reaches Ready for Review.
// Subjective rules are stubbed with requireLlmJudgment:true for future LLM pass.

type PositionValidationResult = {
  passed: boolean
  issues: string[]
  requireLlmJudgment: boolean
  episodeType: 'standalone' | 'series_non_finale' | 'series_finale'
}

/** True when the outro contains language that teases forward continuation. */
function hasNextEpisodeTeaseLang(text: string): boolean {
  return /\b(next episode|next time|continue|continues|continuing|keep listening|what happens next|find out|to be continued|coming up|pick up|picks up|what comes next|leads to|leads us|uncover|discover|tune in|join us|listen (in|on)|coming soon|coming back|wait to see|ahead for|what awaits|what['']s next)\b/i.test(text)
}

/** True when the outro contains language that signals a definitive series end. */
function hasSeriesClosureLanguage(text: string): boolean {
  return /\bendless tales original\b/i.test(text) ||
    /\bseries (has |have |is )?(come to |reached its |come to its |drawn to )?(an end|a close|its conclusion|complete|over|finish)\b/i.test(text) ||
    /\b(the final|the last) (chapter|episode|installment|story) of\b/i.test(text)
}

/**
 * Check whether intro text names the episode number.
 * Accepts digit form (\b3\b) and written cardinal/ordinal for episodes 1-20.
 */
function introNamesEpisodeNumber(text: string, n: number): boolean {
  const lower = text.toLowerCase()
  if (new RegExp(`\\b${n}\\b`).test(lower)) return true
  const cardinal = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
  const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
    'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth']
  if (n >= 1 && n <= 20) {
    if (cardinal[n] && lower.includes(cardinal[n])) return true
    if (ordinal[n] && lower.includes(ordinal[n])) return true
  }
  return false
}

/**
 * Pre-approval deterministic validator for Belle B intro/outro content and
 * episode-position rules. Runs before a story transitions to Ready for Review.
 *
 * @param story  Story row fields: title, author, script, series_id, series_name,
 *               episode_number, series_total_episodes, series_is_finale
 * @param introText  Text extracted from BELLE B INTRO block
 * @param outroText  Text extracted from BELLE B OUTRO block
 */
function validateIntroOutroPositionRules(
  story: {
    title?: string | null
    author?: string | null
    script?: string | null
    series_id?: string | null
    series_name?: string | null
    episode_number?: number | null
    series_total_episodes?: number | null
    series_is_finale?: boolean | null
  },
  introText: string,
  outroText: string
): PositionValidationResult {
  const issues: string[] = []
  let requireLlmJudgment = false

  const title   = String(story.title   || '').trim()
  const author  = String(story.author  || '').trim()
  const narrator = extractHeader(String(story.script || ''), 'NARRATOR').trim()
  const isSeries = Boolean(story.series_id)
  const isFinale = Boolean(story.series_is_finale)
  const seriesName  = String(story.series_name || '').trim()
  const episodeNum  = typeof story.episode_number === 'number' ? story.episode_number : null

  const episodeType: 'standalone' | 'series_non_finale' | 'series_finale' =
    !isSeries ? 'standalone' : isFinale ? 'series_finale' : 'series_non_finale'

  const intro = introText || ''
  const outro = outroText || ''

  // ── Intro: shared rules (standalone + series) ─────────────────────────────

  if (!intro) {
    issues.push('intro text is missing')
  } else {
    // Personalization: must include [LISTENER_NAME] placeholder
    if (!intro.includes('[LISTENER_NAME]')) {
      issues.push('intro must include [LISTENER_NAME] placeholder')
    }
    // Concrete narrative hook (event, danger, secret, conflict, mystery, mechanism)
    if (!hasConcreteNarrativeHook(intro)) {
      issues.push('intro must include a concrete narrative hook (event, danger, secret, conflict, mystery, or story mechanism)')
      // TODO(llm): deeper "hook is genuinely personalized" judgment beyond [LISTENER_NAME]
      requireLlmJudgment = true
    }
    // Standalone: must name the story title
    if (episodeType === 'standalone' && title && !belleTextIncludes(intro, title)) {
      issues.push(`standalone intro must name the story title "${title}"`)
    }
    // Series: must name series title, episode number, and episode title
    if (isSeries) {
      if (seriesName && !belleTextIncludes(intro, seriesName)) {
        issues.push(`series intro must name the series title "${seriesName}"`)
      }
      if (episodeNum !== null && !introNamesEpisodeNumber(intro, episodeNum)) {
        issues.push(`series intro must name the episode number (episode ${episodeNum})`)
      }
      if (title && !belleTextIncludes(intro, title)) {
        issues.push(`series intro must name the episode title "${title}"`)
      }
    }
  }

  // ── Outro: missing guard ──────────────────────────────────────────────────

  if (!outro) {
    issues.push('outro text is missing')
    return { passed: false, issues, requireLlmJudgment, episodeType }
  }

  // ── Outro: standalone ────────────────────────────────────────────────────

  if (episodeType === 'standalone') {
    if (title && !belleTextIncludes(outro, title)) {
      issues.push(`standalone outro must name the story title "${title}"`)
    }
    if (author && !belleTextIncludes(outro, author)) {
      issues.push(`standalone outro must name the author "${author}"`)
    }
    if (narrator && !belleTextIncludes(outro, narrator)) {
      issues.push(`standalone outro must name the narrator "${narrator}"`)
    }
    if (hasNextEpisodeTeaseLang(outro)) {
      issues.push('standalone outro must not tease a next episode')
    }
    // TODO(llm): verify outro caps the conclusion rather than just ending atmospherically
    requireLlmJudgment = true
  }

  // ── Outro: non-finale series episode ─────────────────────────────────────

  if (episodeType === 'series_non_finale') {
    if (author && belleTextIncludes(outro, author)) {
      issues.push(`non-finale outro must not name the author "${author}" (credit belongs in finale only)`)
    }
    if (narrator && belleTextIncludes(outro, narrator)) {
      issues.push(`non-finale outro must not name the narrator "${narrator}" (credit belongs in finale only)`)
    }
    if (hasSeriesClosureLanguage(outro)) {
      issues.push('non-finale outro must not present final-series closure language')
    }
    if (!hasNextEpisodeTeaseLang(outro)) {
      issues.push('non-finale outro must tease or point toward the next episode')
      // TODO(llm): verify the tease names the specific unresolved moment rather than vague tension
      requireLlmJudgment = true
    }
  }

  // ── Outro: finale series episode ──────────────────────────────────────────

  if (episodeType === 'series_finale') {
    // Must name the title — accept series name or episode title
    const namesTitle = (seriesName && belleTextIncludes(outro, seriesName)) ||
      (title && belleTextIncludes(outro, title))
    if (!namesTitle && (seriesName || title)) {
      issues.push(`finale outro must name the series title "${seriesName || title}" or episode title`)
    }
    if (author && !belleTextIncludes(outro, author)) {
      issues.push(`finale outro must name the author "${author}"`)
    }
    if (narrator && !belleTextIncludes(outro, narrator)) {
      issues.push(`finale outro must name the narrator "${narrator}"`)
    }
    if (hasNextEpisodeTeaseLang(outro)) {
      issues.push('finale outro must not tease a next episode')
    }
    // TODO(llm): verify finale outro caps the series conclusion and lands the emotional payoff
    requireLlmJudgment = true
  }

  return {
    passed: issues.length === 0,
    issues,
    requireLlmJudgment,
    episodeType,
  }
}

// ── Narrator assignment validator ─────────────────────────────────────────────
// Hard-blocks missing, invalid, mismatched, or fallback narrator assignments
// BEFORE generate-voices is called and before any ElevenLabs credits are spent.

type NarratorValidationResult = {
  passed: boolean
  narratorIssues: string[]
  resolvedVoiceId: string | null
  resolvedVoiceName: string | null
}

/** Fetch every narrator_voices row once; re-use the array across all episodes. */
async function fetchAllNarratorVoices(): Promise<Array<{ name: string; elevenlabs_voice_id: string }>> {
  const { data, error } = await supabase
    .from('narrator_voices')
    .select('name,elevenlabs_voice_id')
  if (error) throw new Error(`narrator_voices lookup failed: ${error.message}`)
  return (data || []) as Array<{ name: string; elevenlabs_voice_id: string }>
}

/**
 * Synchronous narrator/voice assignment validation.
 * Call after fetchAllNarratorVoices() so the DB round-trip happens once per job,
 * not once per episode.
 *
 * Rules:
 *  1. NARRATOR header must be present and non-blank in the script
 *  2. Narrator name must resolve to a row in narrator_voices
 *  3. That row must have a non-empty elevenlabs_voice_id
 *  4. Voice must not be a Belle B / host voice
 *  5. story.narrator_voice_name (if set) must match the script narrator name
 *  6. story.narrator_voice_id (if set) must match the resolved voice ID
 *
 * Null narrator_voice_name + null narrator_voice_id passes if the script narrator
 * resolves cleanly — the link will be written later by complete-story-package.
 *
 * @param story   Must include script, narrator_voice_id, narrator_voice_name
 * @param voices  All narrator_voices rows from fetchAllNarratorVoices()
 * @param label   Optional episode label for prefixed error messages, e.g. 'EP2'
 */
function validateNarratorAssignmentSync(
  story: {
    script?: string | null
    narrator_voice_id?: string | null
    narrator_voice_name?: string | null
  },
  voices: Array<{ name: string; elevenlabs_voice_id: string }>,
  label?: string
): NarratorValidationResult {
  const issues: string[] = []
  const px = label ? `${label}: ` : ''
  const script = String(story.script || '')

  // Rule 1: NARRATOR header must exist and be non-blank
  const scriptNarratorName = extractHeader(script, 'NARRATOR').trim()
  if (!scriptNarratorName) {
    issues.push(`${px}NARRATOR header missing from script`)
    return { passed: false, narratorIssues: issues, resolvedVoiceId: null, resolvedVoiceName: null }
  }

  // Rule 2: Must exist in narrator_voices table (case-insensitive exact match)
  const normalizedScript = scriptNarratorName.toLowerCase()
  const matchedVoice = voices.find(
    (v) => String(v.name || '').toLowerCase().trim() === normalizedScript
  )
  if (!matchedVoice) {
    issues.push(`${px}NARRATOR "${scriptNarratorName}" not found in narrator_voices`)
    return { passed: false, narratorIssues: issues, resolvedVoiceId: null, resolvedVoiceName: null }
  }

  // Rule 3: Row must have a non-empty ElevenLabs voice ID
  const resolvedVoiceId = String(matchedVoice.elevenlabs_voice_id || '').trim()
  if (!resolvedVoiceId) {
    issues.push(`${px}NARRATOR "${scriptNarratorName}" has no elevenlabs_voice_id`)
    return { passed: false, narratorIssues: issues, resolvedVoiceId: null, resolvedVoiceName: matchedVoice.name }
  }

  // Rule 4: Voice must not be Belle B / host voice
  if (isBelleBVoiceId(resolvedVoiceId)) {
    issues.push(`${px}Narrator voice cannot be a Belle B / host voice`)
    return { passed: false, narratorIssues: issues, resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
  }

  // Rule 5: If narrator_voice_name is already set on the story row, it must agree
  const dbVoiceName = String(story.narrator_voice_name || '').trim()
  if (dbVoiceName && dbVoiceName.toLowerCase() !== normalizedScript) {
    issues.push(
      `${px}Script says "${scriptNarratorName}" but story row has narrator_voice_name="${story.narrator_voice_name}"`
    )
    return { passed: false, narratorIssues: issues, resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
  }

  // Rule 6: If narrator_voice_id is already set on the story row, it must agree
  const dbVoiceId = String(story.narrator_voice_id || '').trim()
  if (dbVoiceId && dbVoiceId !== resolvedVoiceId) {
    issues.push(
      `${px}story.narrator_voice_id does not match narrator_voices row for script narrator "${scriptNarratorName}"`
    )
    return { passed: false, narratorIssues: issues, resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
  }

  return { passed: true, narratorIssues: [], resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
}

function validateBelleText(kind: 'intro' | 'outro', text: string, options: { standalone: boolean; title?: string | null; author?: string | null }) {
  const issues: string[] = []
  const lower = text.toLowerCase()
  const wordCount = countWords(text)
  const sentenceCount = (text.match(/[.!?]+/g) || []).length
  const withoutPunctuation = text.replace(/[.!?]["'”’)]*$/g, '').trim()
  const title = String(options.title || '').trim()
  const author = String(options.author || '').trim()

  if (!text) issues.push(`${kind} text is required.`)
  if (text && wordCount < 4) issues.push(`${kind} text is too short.`)
  if (text && !/[.!?]["'”’)]*$/.test(text)) issues.push(`${kind} text appears incomplete; it must end with punctuation.`)
  if (/\b(welcome|begins now|only on endless tales|sponsored by|stay tuned)\b/i.test(text)) {
    issues.push(`${kind} uses forbidden host or promotional language.`)
  }
  if (/\bbelle b\b/i.test(text)) issues.push(`${kind} must say Belle, not Belle B.`)
  if (options.standalone && title && !belleTextIncludes(text, title)) {
    issues.push(`standalone ${kind} must include the story title.`)
  }
  if (options.standalone && kind === 'intro' && text && !hasConcreteNarrativeHook(text)) {
    issues.push('standalone intro must include a concrete narrative hook such as an event, secret, danger, conflict, or mystery mechanism.')
  }
  if (options.standalone && kind === 'intro' && text && hasWeakAtmosphericHook(text) && !hasConcreteStoryMechanism(text)) {
    issues.push('standalone intro is too atmospheric; it must name the concrete story mechanism, object, event, or conflict.')
  }
  if (kind === 'outro') {
    if (wordCount > 42) issues.push('outro must be 42 words or fewer.')
    if (sentenceCount > 2) issues.push('outro must be one or two short sentences.')
    if (/^\s*that was\b/i.test(text)) issues.push('outro must not use a flat "That was..." structure.')
    if (/\b(and|or|but|with|to|of|for|from|by|into|before|after|while|when|where|under|beneath|inside|outside|near|below|above|through|around|across|behind|beyond|against|among|within|between|onto|upon|over|in|on|at|the|a|an)$/i.test(withoutPunctuation)) {
      issues.push('outro appears cut off or incomplete.')
    }
    if (options.standalone && /\b(next episode|next time|continue|keep listening|what happens next|find out|to be continued|cliffhanger)\b/i.test(lower)) {
      issues.push('standalone outro must not tease a next episode.')
    }
    if (options.standalone && author && !belleTextIncludes(text, author)) {
      issues.push('standalone outro must include the author name.')
    }
    if (options.standalone && !/\bendless tales original\b/i.test(text)) {
      issues.push('standalone outro must include the phrase "Endless Tales original".')
    }
  }

  return issues
}

const VALIDATOR_PROMPT = `You are validating an Endless Tales production script.

Use the CURRENT rules:
- Belle B is the announcer.
- Belle B is never narrator or character.
- No SFX in the published story body.
- The title must be 1 to 5 words and 28 characters or fewer.
- DESCRIPTION must be 70 characters or fewer and present tense only.
- DESCRIPTION fails if it uses past-tense constructions or past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- The script must include the required header fields.
- The script must include a CHARACTER GUIDE.
- The script must include BELLE B INTRO and BELLE B OUTRO blocks.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Difficult Solution Rule: the main problem must feel genuinely difficult at the beginning, the middle must reveal leverage and escalating consequences that make the solution possible, and the ending must feel emotionally and logically earned.
- Fail endings where the climax happens offscreen, the protagonist does not affect the outcome, the ending resolves through exposition instead of dramatic action, the emotional arc is unresolved, or the final solution is passive, too easy, or a "villain already dead" anticlimax.

Return exactly one of these:
✅ VALIDATOR RESULT: PASS
Script is cleared for production.

or

❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
- [specific issue]

Be specific.
`

const STORY_RESOLUTION_VALIDATOR_PROMPT = `You are an Endless Tales senior story editor validating whether a production script's ending matches its declared format.

Return JSON only. Do not include markdown.

Required JSON shape:
{
  "pass": true | false,
  "storyTypeDetected": "standalone" | "series_episode" | "series_finale" | "unclear",
  "endingTypeDetected": "resolved" | "intentional_cliffhanger" | "fake_cliffhanger" | "unresolved" | "unclear",
  "issues": ["specific issue"],
  "confidence": 0.0,
  "suggestedFixes": ["specific fix"]
}

Rules:
- Detect whether the script behaves like a standalone, non-finale series episode, or series finale.
- Standalone stories must resolve the central conflict meaningfully.
- Apply the Difficult Solution Rule: the central problem must initially feel hard or nearly impossible, the middle must progressively reveal leverage and consequences, and the final solution must be earned through onstage dramatic action.
- Fail if the protagonist is passive at the ending, the climax happens offscreen, exposition replaces dramatic action, the emotional arc is unresolved, or the outcome arrives because the danger was already gone before the protagonist acted.
- A standalone ending may leave emotional ambiguity, but it must not make the listener feel they are obviously waiting for episode 2.
- Standalone stories fail if they end with a fake "episode one" cliffhanger, unresolved villain/central danger, missing reveal/payoff, or a direct continuation hook.
- Standalone stories pass if the immediate plot question resolves and the ending emotionally lands, even if the final image is haunting or bittersweet.
- Series non-finales may leave a specific unresolved hook if continuation is clear and intentional.
- Series finales must resolve the series-level conflict.
- Be strict about standalone resolution. Do not pass a standalone just because it is atmospheric.
`

const BELLE_QUALITY_VALIDATOR_PROMPT = `You are an Endless Tales senior story editor validating Belle intro/outro copy before audio production continues.

Return JSON only. Do not include markdown.

Required JSON shape:
{
  "pass": true | false,
  "introScore": 0,
  "outroScore": 0,
  "issues": ["specific blocking issue"],
  "confidence": 0.0,
  "suggestedFixes": ["specific fix"]
}

Scoring:
- 9-10: excellent, story-specific, emotionally natural, production-ready.
- 7-8: acceptable and production-ready.
- 0-6: weak, generic, structurally wrong, or emotionally off; fail.

Intro requirements:
- Sounds like a trusted human recommendation, not a host, announcer, trailer, DJ, or ad.
- Gives light audio-first grounding so a driver understands the story world quickly.
- Is story-specific and hooks the listener with one clear sensory, emotional, or conceptual detail.
- For standalone stories, must include the story title naturally.
- For standalone stories, must contain a concrete narrative hook: an event, secret, danger, conflict, mystery mechanism, or specific story problem.
- Reject standalone intros that are only mood, weather, imagery, or atmosphere without narrative intrigue.
- If you could attach this intro to many similar foggy mysteries, fail it.
- Standalone intros must name or imply the actual mechanism that drives the story, such as who is in trouble, what strange event happens, what object/list/record drives the plot, or why the listener should care.
- Vague phrases like "something waiting", "in the fog", "on that river", "your name written down", "secrets", "ink", or "twenty years ago" do not count unless paired with the concrete story mechanism.
- Must not use generic host language such as "Welcome", "begins now", "only on Endless Tales", "tonight", or promotional copy.
- Any [LISTENER_NAME] placeholder must sit naturally in a complete sentence; removing it must not break grammar.

Outro requirements:
- Emotionally lands and feels companion-like, as if Belle is still beside the listener after the story.
- Matches the declared story type.
- Standalone outros must include the story title.
- Standalone outros must include the author name.
- Standalone outros must include the exact phrase "Endless Tales original".
- Standalone outros must leave emotional residue or reflection; do not pass outros that are only title/author credits or plot summary.
- Standalone outros must tie the emotional closure to the actual resolution, choice, reveal, or final consequence of the story.
- Standalone outros must not tease a fake episode 2, "next time", "what happens next", or unresolved continuation.
- Series non-finale outros may create intentional next-episode desire.
- Finale outros should feel complete.
- Credits language is only acceptable if brief and not the emotional center.
- Must not use flat "That was..." credits-style structure as the dominant move.

Fail closed for Belle copy that is generic, promotional, too abrupt, structurally wrong for the story type, emotionally wrong for the ending, or likely to feel awkward in audio.
Only include issues that should block production.
`

const BELLE_QUALITY_REPAIR_PROMPT = `You are repairing only Belle intro/outro copy for an Endless Tales production script.

Return JSON only. Do not include markdown.

Required JSON shape:
{
  "introText": "replacement intro if requested",
  "outroText": "replacement outro if requested"
}

Hard format rules:
- Return valid JSON only. Do not include markdown, comments, explanation, or extra keys.
- Before returning, self-check that each requested line has no more than two sentences.
- Each requested value must be one line of spoken text.
- Intro: one line, maximum two short sentences.
- Outro: one line, maximum two short sentences.
- Do not use semicolons.
- Do not use stacked clauses that read like three or more thoughts joined together.

Content rules:
- Repair only the requested Belle line(s).
- Do not rewrite the story body, title, description, author, narrator, character dialogue, or any non-Belle text.
- Belle is the name. Do not write "Belle B" inside the spoken line.
- Keep BELLE B script block labels unchanged; return spoken text only.
- Belle sounds like a trusted friend, not a host, announcer, DJ, trailer, ad, or promo voice.
- No "Welcome", "begins now", "only on Endless Tales", "tonight", "stay tuned", "next time", or "what happens next" for standalone stories.
- The intro MUST speak directly to the listener using [LISTENER_NAME] — this is a personalized product; [LISTENER_NAME] must appear naturally in a complete sentence.
- NEVER write a third-person synopsis, story description, or plot summary (e.g., "In this story...", "follows a driver...", "a man discovers..."). The listener already chose this story — do not describe it to them.
- Address the listener directly: speak to them as a companion would, using [LISTENER_NAME] and "you".
- Standalone intro must lightly ground the listener in the story world, then add a specific emotional or sensory hook that creates anticipation.
- Outro should emotionally land and feel companion-like.
- Standalone outro must feel complete and must not tease a next episode or deferred resolution.
- Standalone outro must include the story title, author name, and the exact phrase "Endless Tales original".
- Standalone outro must emotionally close around the actual resolution, choice, reveal, or final consequence of the story.
- Outro may include brief credits only if the emotional landing remains the main point.
- Keep outro under 42 words.
`

function parseJsonObject(text: string): any {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found in model response')
    return JSON.parse(match[0])
  }
}

function scriptTail(script: string, maxChars = 1400) {
  const clean = script.replace(/\s+/g, ' ').trim()
  return clean.length <= maxChars ? clean : clean.slice(-maxChars)
}

function runtimeTarget(runtime: string) {
  const minutes = parseInt(String(runtime || '').match(/\d+/)?.[0] || '15', 10)
  const targets: Record<number, { range: string; max: number }> = {
    10: { range: '1,200 to 1,450', max: 1550 },
    15: { range: '1,800 to 2,100', max: 2250 },
    20: { range: '2,400 to 2,850', max: 3000 },
    25: { range: '3,000 to 3,550', max: 3750 },
    30: { range: '3,600 to 4,250', max: 4500 },
  }
  const target = targets[minutes] || targets[15]
  return { runtime: targets[minutes] ? runtime || '15 min' : '15 min', ...target }
}

async function pickAuthor(genre: string, requestedAuthor: string) {
  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to load authors: ${error.message}`)

  const authors = ((data || []) as AuthorRow[]).filter((author) => author.is_active !== false)
  const requested = requestedAuthor.trim().toLowerCase()
  if (requested) {
    const match = authors.find((author) => author.name.toLowerCase() === requested)
    if (match) return match
  }

  const targetGenre = genre.trim().toLowerCase()
  const byGenre = authors.find((author) =>
    [author.primary_genre, author.secondary_genre, author.genre]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === targetGenre)
  )

  return byGenre || authors[0] || null
}

async function saveSeriesParent(payload: Record<string, any>, seriesId?: string) {
  const sanitizedTitle = sanitizeSeriesTitle(payload.title)
  const sanitizedPayload: Record<string, any> = { ...payload, title: sanitizedTitle }
  const categoryPayload: Record<string, any> = { ...sanitizedPayload, category: sanitizedPayload.genre }
  delete categoryPayload.genre

  const genrePayload = { ...sanitizedPayload }

  if (seriesId) {
    const first = await supabase
      .from('series')
      .update(categoryPayload)
      .eq('id', seriesId)
      .select('*')
      .single()

    if (!first.error) return first

    return supabase
      .from('series')
      .update(genrePayload)
      .eq('id', seriesId)
      .select('*')
      .single()
  }

  const first = await supabase
    .from('series')
    .insert(categoryPayload)
    .select('*')
    .single()

  if (!first.error) return first

  return supabase
    .from('series')
    .insert(genrePayload)
    .select('*')
    .single()
}

/**
 * Zombie guard — run once per POST request before selecting a new candidate.
 *
 * A zombie job is one where:
 *   - status = 'running'
 *   - locked_at IS NULL  (no runner holds a lock on it)
 *   - locked_by IS NULL
 *   - current_step is beyond the initial queued/create step (i.e. a step was
 *     started, the runner vanished, and nobody ever resumed it)
 *   - updated_at is older than ZOMBIE_STALE_MS (30 min) — guards against the
 *     legitimate gap between two consecutive run-next calls in autopilot
 *
 * Matched jobs are marked status='failed' with error_json.kind='zombie_stalled'
 * so they surface clearly in the admin UI and autopilot reports instead of
 * silently clogging the queue forever.
 *
 * Recovery: call production-autopilot.js reactivateJob() against the job ID,
 * or POST to run-next with the job ID — the job can be safely resumed from
 * whatever current_step it was frozen at.
 */
/**
 * @param excludeJobId - Explicitly-requested job to skip (we're about to
 *   process it; marking it stalled here would immediately block recovery).
 */
async function detectAndMarkZombieJobs(excludeJobId?: string): Promise<string[]> {
  const zombieCutoff = new Date(Date.now() - ZOMBIE_STALE_MS).toISOString()

  // Steps that legitimately sit in status=running without a lock (terminal or
  // very-short-lived) should not be treated as zombies.
  const SAFE_ZOMBIE_EXEMPT_STEPS = ['queued', 'ready_for_review', 'complete']

  const { data: candidates, error } = await supabase
    .from('production_jobs')
    .select('id,current_step,story_id,series_id,updated_at,state_json')
    .eq('status', 'running')
    .is('locked_at', null)
    .is('locked_by', null)
    .lt('updated_at', zombieCutoff)

  if (error || !candidates?.length) return []

  const zombies = candidates.filter(
    (job: any) =>
      !SAFE_ZOMBIE_EXEMPT_STEPS.includes(String(job.current_step || '')) &&
      // Never mark the job the caller is explicitly requesting — that's a
      // targeted recovery attempt and should be allowed to proceed normally.
      job.id !== excludeJobId
  )
  if (!zombies.length) return []

  const markedIds: string[] = []
  for (const zombie of zombies) {
    // Extract step-specific context from state_json so the error report
    // can tell operators exactly which episode/segment was in-flight when
    // the runner disappeared.  This prevents monitors from reporting
    // "episode: unknown" on series preflight/voice-generation zombies.
    const zombieState = zombie.state_json && typeof zombie.state_json === 'object' ? zombie.state_json : {}
    const zombieContext: Record<string, unknown> = {}
    const step = String(zombie.current_step || '')
    if (step === 'series_voice_preflight') {
      const svp = zombieState.seriesVoicePreflight
      if (svp && typeof svp === 'object') {
        zombieContext.nextEpisodeNumber = (svp as any).nextEpisodeNumber ?? null
        zombieContext.checkedEpisodeCount = Array.isArray((svp as any).checkedEpisodes) ? (svp as any).checkedEpisodes.length : 0
        zombieContext.totalEpisodeCount = (svp as any).episodeCount ?? null
      }
    } else if (step === 'series_generate_voices') {
      const svg = zombieState.seriesVoiceGeneration
      if (svg && typeof svg === 'object') {
        zombieContext.currentEpisodeNumber = (svg as any).currentEpisodeNumber ?? null
        zombieContext.presentCount = (svg as any).presentCount ?? null
        zombieContext.expectedSegmentCount = (svg as any).expectedSegmentCount ?? null
        zombieContext.lastSegmentNumber = (svg as any).lastSegmentNumber ?? null
      }
    } else if (step === 'generate_voices') {
      const vg = zombieState.voiceGeneration
      if (vg && typeof vg === 'object') {
        zombieContext.lastSegmentNumber = (vg as any).lastSegmentNumber ?? null
        zombieContext.nextSegmentNumber = (vg as any).nextSegmentNumber ?? null
        zombieContext.presentCount = (vg as any).presentCount ?? null
        zombieContext.expectedSegmentCount = (vg as any).expectedSegmentCount ?? null
      }
    }

    const { error: updateError } = await supabase
      .from('production_jobs')
      .update({
        status: 'failed',
        error_json: {
          kind: 'zombie_stalled',
          step: zombie.current_step,
          storyId: zombie.story_id || null,
          seriesId: zombie.series_id || null,
          ...(Object.keys(zombieContext).length > 0 ? { context: zombieContext } : {}),
          message:
            'Job was marked running with no lock and no heartbeat for more than ' +
            `${ZOMBIE_STALE_MS / 60000} minutes. The runner that advanced it to ` +
            `"${zombie.current_step}" disappeared before executing that step. ` +
            'The job state is clean and the step can be safely retried: call ' +
            'reactivateJob() or POST /api/admin/production-jobs/run-next with this job ID.',
          detectedAt: nowIso(),
          lastUpdatedAt: zombie.updated_at,
        },
        locked_at: null,
        locked_by: null,
      })
      .eq('id', zombie.id)
      .eq('status', 'running') // only update if still running (prevents races)

    if (!updateError) markedIds.push(zombie.id as string)
  }

  return markedIds
}

async function selectCandidate(jobId: string) {
  let query = supabase
    .from('production_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: true })
    .limit(1)

  if (jobId) query = query.eq('id', jobId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Failed to select production job: ${error.message}`)
  return data as ProductionJob | null
}

async function lockJob(job: ProductionJob) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString()
  const baseUpdate = {
    status: 'running',
    locked_at: nowIso(),
    locked_by: WORKER_ID,
  }

  let query = supabase
    .from('production_jobs')
    .update(baseUpdate)
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  query = job.locked_at
    ? query.lt('locked_at', staleBefore)
    : query.is('locked_at', null)

  const { data, error } = await query
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to lock production job: ${error.message}`)
  return data as ProductionJob | null
}

async function clearLock(jobId: string) {
  await supabase
    .from('production_jobs')
    .update({ locked_at: null, locked_by: null })
    .eq('id', jobId)
    .eq('locked_by', WORKER_ID)
}

async function readJsonOrDiagnostic(response: Response, endpoint: string) {
  const contentType = response.headers.get('content-type') || ''
  const body = await response.text()
  const trimmed = body.trim()

  if (!trimmed) {
    return {
      success: false,
      error: `Empty response from ${endpoint}`,
      endpoint,
      status: response.status,
      contentType,
      responsePreview: '',
    }
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {
      success: false,
      error: `Non-JSON response from ${endpoint}`,
      endpoint,
      status: response.status,
      contentType,
      responsePreview: trimmed.slice(0, 500),
    }
  }

  try {
    return JSON.parse(trimmed)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `Invalid JSON from ${endpoint}`,
      endpoint,
      status: response.status,
      contentType,
      responsePreview: trimmed.slice(0, 500),
    }
  }
}

async function failJob(job: ProductionJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const logs = appendLog(job, 'Step failed', { error: message })
  await supabase
    .from('production_jobs')
    .update({
      status: 'failed',
      error_json: {
        step: normalizeStep(job.current_step),
        message,
        at: nowIso(),
      },
      logs,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', job.id)

  return { message, logs }
}

async function createStoryRow(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const input = job.input_json && typeof job.input_json === 'object' ? job.input_json : {}
  const queueItem = input.queueItem || {}
  const existingStoryId = job.story_id || state.storyId || queueValue(queueItem, 'storyId', 'story_id')

  if (existingStoryId) {
    return {
      storyId: String(existingStoryId),
      state: {
        ...state,
        storyId: String(existingStoryId),
        createStoryRowSkipped: true,
      },
      created: false,
    }
  }

  const genre = String(queueValue(queueItem, 'primaryGenre', 'primary_genre') || 'Mystery').trim()
  const premise = String(queueValue(queueItem, 'premise')).trim()
  const setting = String(queueValue(queueItem, 'setting')).trim()
  const runtime = String(queueValue(queueItem, 'duration') || '15 min').trim()
  const authorTarget = String(queueValue(queueItem, 'authorTarget', 'author_target')).trim()
  const type = storyTypeFor(job, queueItem)

  if (type !== 'standalone') {
    throw new Error('Series create_story_row is not implemented in this first run-next slice')
  }
  if (!premise) throw new Error('Queue item premise is required to create story row')
  if (!setting) throw new Error('Queue item setting is required to create story row')
  if (!runtime) throw new Error('Queue item duration is required to create story row')

  const author = await pickAuthor(genre, authorTarget)
  if (!author) throw new Error(`No approved author found for genre ${genre}`)

  const title = titleFromQueue(queueItem)
  const requirements = [
    'Server production job queue.',
    'Use canonical V2 script generation and ASC3 audio pipeline only.',
    'Do not publish automatically.',
    'Final review target after audio production is status=audio_ready, is_hidden=true, published_on=null.',
    String(queueValue(queueItem, 'notes')).trim(),
  ].filter(Boolean).join(' ')

  const briefJson = {
    title: title || null,
    type,
    series_name: null,
    series_episode_number: null,
    series_total_episodes: null,
    series_is_finale: null,
    series_arc_plan: null,
    author: author.name,
    author_style: author.style_reference || author.style_description || author.name,
    genre,
    narrative_voice: author.narrative_voice || null,
    premise,
    setting,
    runtime,
    characters: null,
    requirements,
    previous_episode: null,
    next_episode: null,
    music_energy: null,
    music_reference: null,
    music_moments: null,
    audio_notes: null,
    description: null,
  }

  const { data: story, error } = await supabase
    .from('stories')
    .insert({
      title: title || 'Untitled Draft',
      author: author.name,
      author_style: briefJson.author_style,
      genre,
      narrative_voice: briefJson.narrative_voice,
      description: null,
      brief_json: briefJson,
      is_v2: true,
      status: 'brief_complete',
      script_version: 1,
      story_type: type,
      series_name: null,
      series_episode_number: null,
      series_total_episodes: null,
      series_is_finale: null,
      duration_label: runtime,
      duration_mins: runtimeToMinutes(runtime),
    })
    .select('id,title,status')
    .single()

  if (error) throw new Error(`Failed to create story row: ${error.message}`)

  return {
    storyId: story.id as string,
    state: {
      ...state,
      storyId: story.id,
      storyTitle: story.title,
      author: author.name,
      genre,
      runtime,
      createStoryRowSkipped: false,
    },
    created: true,
  }
}

async function loadSeriesEpisodes(seriesId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('id,title,author,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type,validator_result,validator_report,validator_passed_at,narrator_voice_id,narrator_voice_name')
    .eq('series_id', seriesId)
    .order('episode_number', { ascending: true })

  if (error) throw new Error(`Failed to load series episodes: ${error.message}`)
  return data || []
}

function episodeNumber(episode: any, fallback: number) {
  return Number(episode.episode_number || episode.series_episode_number || fallback)
}

function buildContinuityBundle(prior: any[]) {
  return prior.map((episode: any, index: number) => {
    const brief = episode.brief_json || {}
    const generated = episode.script_json?.series_generation || {}
    const summary = generated?.summary || {}
    return {
      episode_number: episodeNumber(episode, index + 1),
      title: episode.title,
      generated_title: generated.generated_title || extractTitle(episode.script || '') || episode.title,
      description: extractHeader(episode.script || '', 'DESCRIPTION') || summary.description || brief.description || '',
      planned_continuity_notes: brief.continuity_notes || summary.planned_continuity_notes || '',
      planned_cliffhanger_or_resolution: brief.cliffhanger_or_resolution || summary.planned_cliffhanger_or_resolution || '',
      script_tail: summary.script_tail || scriptTail(episode.script || ''),
    }
  })
}

async function loadRecentStoryTexts(seriesId?: string) {
  let query = supabase
    .from('stories')
    .select('title,script,script_json,series_id')
    .not('script', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (seriesId) query = query.or(`series_id.is.null,series_id.neq.${seriesId}`)

  const { data, error } = await query
  if (error || !data) return []
  return data.map((story: any) => [
    story.title || '',
    story.script || '',
    story.script_json?.raw_script || '',
  ].join('\n'))
}

function buildStandaloneScriptPrompt(story: any, brief: any, namePaletteBlock: string) {
  const target = runtimeTarget(brief.runtime || '')

  return `You are the Endless Tales Stage 2 script writer.

🎯 ENTERTAINMENT FIRST RULE — NON-NEGOTIABLE

The primary purpose of every Endless Tales story is to entertain.
Listeners come for suspense, curiosity, emotion, mystery, wonder, humor, fear, connection, and the desire to know what happens next.

NEVER interrupt a story to teach a lesson.
NEVER have the narrator explain the meaning of the story.
NEVER include speeches whose primary purpose is to educate, persuade, moralize, lecture, or preach.
NEVER allow a character to become the author's mouthpiece.

If a story contains a lesson, theme, or insight — it must emerge naturally through character choices, consequences, conflict, sacrifice, failure, success, and events. The listener discovers meaning. You do not explain it.

Story first. Theme second. Lesson last.
The story is the meal. The lesson is seasoning.

⭐ MANDATORY FIRST STEP: STORY RESOLUTION MAP ⭐

Before you draft, build the story around the Difficult Solution Rule. Output a Story Resolution Map as a comment block at the top of the script. It will be removed before audio production.

The map must include:
1. CORE PROBLEM
   The central danger, mystery, desire, wound, or conflict.
2. WHY IT SEEMS DIFFICULT OR IMPOSSIBLE
   Why the solution initially feels hidden, dangerous, costly, morally difficult, emotionally painful, or unlikely.
3. WHAT CHANGES IN THE MIDDLE
   The discoveries, reversals, leverage, escalating consequences, or emotional shifts that gradually make the solution possible.
4. FINAL DECISIVE ACTION
   The concrete onstage action the protagonist takes to affect the outcome.
5. EMOTIONAL PAYOFF
   What the ending costs, heals, reveals, changes, or makes the listener feel.
6. VARIETY GUARDRAIL
   The solution engine for this story, chosen to avoid repeating the same ending pattern. Consider sacrifice, confrontation, revelation, escape, reversal, emotional confession, strategic trap, moral choice, rescue, justice, forgiveness, survival, transformation, or bittersweet acceptance.

Ending hard rules:
- The main problem must feel genuinely difficult at the beginning.
- The middle must progressively increase understanding, reveal leverage, and escalate consequences.
- The climax must happen onstage.
- The protagonist must affect the outcome through decisive action.
- The ending must resolve through dramatic action and consequence, not explanation alone.
- Avoid offscreen solutions, passive symbolic endings, abrupt explanation dumps, "villain already dead" anticlimax, and endings where the protagonist only watches or learns what happened.

Use the CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- No SFX in the published story body.
- The title may be blank in the brief; if blank, choose the best title from the story.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output ONLY the script, including the Story Resolution Map comment block. No commentary outside the script.

${namePaletteBlock}

Required script structure:
TITLE: [1 to 5 words, 28 characters or fewer]
SERIES:
EPISODE:
EPISODE_TITLE:
SERIES_TOTAL_EPISODES:
SERIES_IS_FINALE:
AUTHOR:
GENRE:
DESCRIPTION: [70 characters or fewer, present tense only]
NARRATOR: [assigned narrator name, not a story character unless NARRATOR_IS_CHARACTER is true]
ANNOUNCER: Belle B
NARRATIVE_VOICE:
NARRATOR_IS_CHARACTER: [true/false, must match NARRATOR]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally and not always at the start, reads gracefully if the name is omitted, includes the story title in quotes, references something specific from the story, no time-of-day reference, no author/narrator credit, no "Endless Tales original"]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: [one or two short sentences, reflective, no time-of-day reference, credits the author and says "an Endless Tales original"]

Production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Wrong: DEPUTY PIKE: Pike's jaw tightened.
- Right: NARRATOR: Pike's jaw tightened.

Additional rules:
- DESCRIPTION must be 70 characters or fewer and present tense only so it fits two lines on story cards. If the brief-provided description is longer than 70 characters or uses past-tense constructions, rewrite it to comply. Reject past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", or "hidden".
- If NARRATOR_IS_CHARACTER is false, NARRATOR must not be a story character name and must not include "(character)".
- If the narrator is a story character, NARRATOR_IS_CHARACTER must be true and the script must use consistent first-person narration.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Keep narrator voice consistent.
- Do not include markdown fences.

USER NOTES / CONSTRAINTS:
${String(brief.requirements || '').trim() || 'None'}

RUNTIME TARGET:
Requested runtime: ${target.runtime}
Target script length: ${target.range} words total.
Hard maximum: ${target.max.toLocaleString()} words total.
If needed, simplify plot, reduce scene count, and tighten dialogue before exceeding the hard maximum.

STORY BRIEF JSON:
${JSON.stringify(brief, null, 2)}

CURRENT STORY ROW:
${JSON.stringify({
    id: story.id,
    title: story.title,
    author: story.author,
    author_style: story.author_style,
    genre: story.genre,
    narrative_voice: story.narrative_voice,
  }, null, 2)}
`
}

async function generateStandaloneScript(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,author,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.brief_json) throw new Error('brief_json missing')

  const brief = story.brief_json as any

  if (story.script) {
    return {
      generated: false,
      storyId: String(story.id),
      story: {
        id: story.id,
        title: story.title,
        status: story.status,
        description: story.description,
      },
      state: {
        ...state,
        storyId: String(story.id),
        storyTitle: story.title,
        storyStatus: story.status,
        description: story.description,
        hasScript: true,
        generateScriptSkipped: true,
      },
    }
  }

  const recentStoryTexts = await loadRecentStoryTexts()
  const namePaletteBlock = buildNamePalettePromptBlock({
    genre: story.genre || brief.genre || '',
    setting: [brief.setting, brief.location, brief.region].filter(Boolean).join(' '),
    era: brief.era || brief.period || '',
    recentStoryTexts,
  })
  const prompt = buildStandaloneScriptPrompt(story, brief, namePaletteBlock)

  const response = await anthropic.messages.create({
    model,
    max_tokens: 12000,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  })

  const generatedScript = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  const normalized = normalizeStandaloneDescription(generatedScript, story.genre || brief.genre || '')
  const script = normalized.script
  const description = normalized.description
  const generatedTitle = extractTitle(script) || story.title || ''
  const generatedGenre = extractHeader(script, 'GENRE') || brief.genre || ''
  const wordCount = countWords(generatedTitle)

  if (!script) throw new Error('Claude returned an empty script')
  if (!generatedTitle || wordCount < 1 || wordCount > 5) {
    throw new Error(`Generated title must be 1 to 5 words. Got: "${generatedTitle}"`)
  }

  // ATL-PIPE-004: Validate script matches brief (title/genre/narrator)
  const briefMismatches: string[] = []
  if (brief.genre && generatedGenre && generatedGenre.toLowerCase() !== brief.genre.toLowerCase()) {
    briefMismatches.push(`Genre mismatch: brief="${brief.genre}" vs script="${generatedGenre}"`)
  }
  // Title check: if brief specifies a title, warn if generated title differs substantially
  const briefTitle = String(brief.title || '').trim()
  if (briefTitle && generatedTitle && generatedTitle.toLowerCase() !== briefTitle.toLowerCase()) {
    briefMismatches.push(`Title mismatch: brief="${briefTitle}" vs script="${generatedTitle}"`)
  }
  // Narrator check: brief may carry narrator via narrative_voice or explicit narrator field
  const briefNarrator = String(brief.narrator || brief.narrative_voice || story.narrative_voice || '').trim()
  const generatedNarrator = extractHeader(script, 'NARRATOR').trim()
  if (briefNarrator && generatedNarrator && generatedNarrator.toLowerCase() !== briefNarrator.toLowerCase()) {
    briefMismatches.push(`Narrator mismatch: brief="${briefNarrator}" vs script="${generatedNarrator}"`)
  }
  const briefWarnings = briefMismatches.length > 0 ? briefMismatches : []

  // ATL-PIPE-005: Extract Belle B intro line and populate intro_text field
  let introText: string | null = null
  try {
    const belleIntroSection = extractBelleSection(script, 'intro')
    if (belleIntroSection) {
      // Extract text after "BELLE B:" label
      const belleMatch = belleIntroSection.match(/BELLE\s+B:\s*(.+?)(?:\n|$)/i)
      if (belleMatch) {
        introText = belleMatch[1].trim()
        // Validate intro_text references listener name and has specific story details (not generic)
        const isGeneric = /^settle\s+in/i.test(introText) && introText.length < 100
        if (isGeneric) {
          briefWarnings.push(`Warning: Belle B intro appears generic; expected specific story references and [LISTENER_NAME] placeholder`)
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to extract Belle B intro: ${String(e).slice(0, 100)}`)
  }

  const scriptJson = {
    generated_title: generatedTitle,
    model,
    generated_at: nowIso(),
    raw_script: generatedScript,
    normalized_description: description,
    production_job_id: job.id,
    brief_mismatches: briefWarnings,
  }

  const updatePayload: any = {
    title: generatedTitle,
    description,
    script,
    script_json: scriptJson,
    status: 'script_drafted',
    script_version: (story.script_version || 1) + 1,
  }
  // Only update intro_text if extracted successfully and non-generic
  if (introText && introText.length > 20 && introText.includes('[LISTENER_NAME]')) {
    updatePayload.intro_text = introText
  }

  const { data: updated, error: updateError } = await supabase
    .from('stories')
    .update(updatePayload)
    .eq('id', storyId)
    .select('id,title,status,description,script,script_json')
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message || 'Failed to save standalone script')
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'story-script',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: String(storyId),
    storyTitle: generatedTitle,
    metadata: { is_v2: true, production_job_id: job.id },
  }).catch(() => {})

  if (briefWarnings.length > 0) {
    console.warn(`[ATL-PIPE-004/005] Script generation completed with warnings for ${storyId}:`, briefWarnings)
  }

  return {
    generated: true,
    storyId: String(updated.id),
    story: updated,
    briefWarnings,
    introTextExtracted: !!introText,
    state: {
      ...state,
      storyId: String(updated.id),
      storyTitle: updated.title,
      storyStatus: updated.status,
      description,
      hasScript: true,
      generateScriptSkipped: false,
      scriptGenerationWarnings: briefWarnings,
    },
  }
}

async function validateStandaloneScript(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,script,status,description,validator_result,validator_report,validator_passed_at')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')

  if (story.status === 'validator_passed' || story.validator_result === 'PASS') {
    return {
      passed: true,
      skipped: true,
      storyId: String(story.id),
      report: story.validator_report || '✓ Validator already passed.',
      story: {
        id: story.id,
        title: story.title,
        status: story.status,
        description: story.description,
        validator_result: story.validator_result || 'PASS',
        validator_report: story.validator_report || '',
        validator_passed_at: story.validator_passed_at || null,
      },
      state: {
        ...state,
        storyId: String(story.id),
        storyTitle: story.title,
        storyStatus: story.status,
        validatorResult: story.validator_result || 'PASS',
        validatorReport: story.validator_report || '',
        validatorPassedAt: story.validator_passed_at || null,
        validateScriptSkipped: true,
      },
    }
  }

  const cardCopyIssues = validateCardCopy(story.script)
  if (cardCopyIssues.length > 0) {
    const report = `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
${cardCopyIssues.map((issue) => `- ${issue}`).join('\n')}`

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        validator_result: 'FAIL',
        validator_report: report,
        validator_passed_at: null,
        status: 'validator_failed',
      })
      .eq('id', storyId)
      .select('id,title,status,description,validator_result,validator_report,validator_passed_at')
      .single()

    if (updateError || !updated) {
      throw new Error(updateError?.message || 'Failed to save validator failure')
    }

    return {
      passed: false,
      skipped: false,
      storyId: String(storyId),
      report,
      story: updated,
      state: {
        ...state,
        storyId: String(storyId),
        storyTitle: updated.title,
        storyStatus: updated.status,
        validatorResult: 'FAIL',
        validatorReport: report,
        validatorPassedAt: null,
        validateScriptSkipped: false,
      },
    }
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${VALIDATOR_PROMPT}\n\nSCRIPT:\n${story.script}`,
    }],
  })

  const report = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!report) throw new Error('Validator returned an empty report')

  const passed = /VALIDATOR RESULT:\s*PASS/i.test(report)
  const validatedDescription = passed ? normalizeHeaderValue(extractHeader(story.script, 'DESCRIPTION')) : ''
  const passedAt = passed ? nowIso() : null

  const { data: updated, error: updateError } = await supabase
    .from('stories')
    .update({
      validator_result: passed ? 'PASS' : 'FAIL',
      validator_report: report,
      validator_passed_at: passedAt,
      status: passed ? 'validator_passed' : 'validator_failed',
      ...(passed && validatedDescription ? { description: validatedDescription } : {}),
    })
    .eq('id', storyId)
    .select('id,title,status,description,validator_result,validator_report,validator_passed_at')
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message || 'Failed to save validator result')
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'script-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: String(storyId),
    storyTitle: story.title,
    metadata: { is_v2: true, production_job_id: job.id },
  }).catch(() => {})

  return {
    passed,
    skipped: false,
    storyId: String(storyId),
    report,
    story: updated,
    state: {
      ...state,
      storyId: String(storyId),
      storyTitle: updated.title,
      storyStatus: updated.status,
      description: updated.description,
      validatorResult: passed ? 'PASS' : 'FAIL',
      validatorReport: report,
      validatorPassedAt: passedAt,
      validateScriptSkipped: false,
    },
  }
}

async function validateStandaloneStoryResolution(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  if (state.storyResolutionPassed === true && state.storyResolutionStoryId === String(storyId)) {
    return {
      passed: true,
      skipped: true,
      storyId: String(storyId),
      report: state.storyResolutionReport || {
        pass: true,
        storyTypeDetected: 'standalone',
        endingTypeDetected: 'resolved',
        issues: [],
        confidence: 1,
        suggestedFixes: [],
      },
      state,
    }
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,script,status,story_type,series_id,series_name,episode_number,series_total_episodes,series_is_finale,validator_result')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')
  if (story.validator_result !== 'PASS' && story.status !== 'validator_passed') {
    throw new Error('Script must pass validate_script before story resolution validation')
  }

  const declaredStoryType = [
    story.story_type ? `story_type=${story.story_type}` : '',
    story.series_id ? `series_id=${story.series_id}` : '',
    story.series_name ? `series_name=${story.series_name}` : '',
    story.episode_number ? `episode_number=${story.episode_number}` : '',
    story.series_total_episodes ? `series_total_episodes=${story.series_total_episodes}` : '',
    story.series_is_finale ? `series_is_finale=${story.series_is_finale}` : '',
  ].filter(Boolean).join(', ') || 'standalone inferred from production job'

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${STORY_RESOLUTION_VALIDATOR_PROMPT}

DECLARED METADATA:
${declaredStoryType}

TITLE:
${story.title || 'Untitled'}

SCRIPT:
${story.script}`,
    }],
  })

  const rawReport = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!rawReport) throw new Error('Story resolution validator returned an empty report')

  const parsed = parseJsonObject(rawReport)
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : []
  const suggestedFixes = Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes.map(String).filter(Boolean) : []
  const report = {
    pass: parsed.pass === true,
    storyTypeDetected: String(parsed.storyTypeDetected || 'unclear'),
    endingTypeDetected: String(parsed.endingTypeDetected || 'unclear'),
    issues,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence || 0),
    suggestedFixes,
    rawReport,
  }

  const passed = report.pass === true

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'story-resolution-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: String(storyId),
    storyTitle: story.title,
    metadata: { is_v2: true, production_job_id: job.id },
  }).catch(() => {})

  return {
    passed,
    skipped: false,
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      storyTitle: story.title,
      storyStatus: story.status,
      storyResolutionPassed: passed,
      storyResolutionStoryId: String(storyId),
      storyResolutionReport: report,
      storyResolutionValidatedAt: nowIso(),
    },
  }
}

async function runStandaloneVoicePreflight(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  if (state.voicePreflightPassed === true && state.voicePreflightStoryId === String(storyId)) {
    return {
      passed: true,
      skipped: true,
      narratorIssues: [] as string[],
      storyId: String(storyId),
      report: state.voicePreflight || { success: true, preflightOnly: true, skipped: true },
      state,
    }
  }

  // ── Narrator validation — must pass before any ElevenLabs call ──────────────
  const { data: storyForNarrator, error: narratorFetchError } = await supabase
    .from('stories')
    .select('id,script,narrator_voice_id,narrator_voice_name')
    .eq('id', storyId)
    .single()
  if (narratorFetchError || !storyForNarrator) {
    throw new Error(narratorFetchError?.message || `Story not found for narrator validation: ${storyId}`)
  }

  const allVoices = await fetchAllNarratorVoices()
  const narratorResult = validateNarratorAssignmentSync(storyForNarrator, allVoices)

  if (!narratorResult.passed) {
    const failState = {
      ...state,
      storyId: String(storyId),
      voicePreflightPassed: false,
      voicePreflightStoryId: String(storyId),
      voicePreflight: null,
      voicePreflightAt: nowIso(),
      narratorValidation: {
        passed: false,
        issues: narratorResult.narratorIssues,
        checkedAt: nowIso(),
      },
    }
    return {
      passed: false,
      skipped: false,
      narratorIssues: narratorResult.narratorIssues,
      storyId: String(storyId),
      report: {
        success: false,
        preflightOnly: true,
        blockingReasons: narratorResult.narratorIssues,
        narratorIssues: narratorResult.narratorIssues,
      },
      state: failState,
    }
  }

  // ── Generate-voices preflight (ElevenLabs metadata check) ────────────────────
  const endpoint = `${origin}/api/admin/generate-voices`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, preflightOnly: true }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices') as VoicePreflightResult
  const passed = response.ok && report.success === true

  return {
    passed,
    skipped: false,
    narratorIssues: [] as string[],
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      voicePreflightPassed: passed,
      voicePreflightStoryId: String(storyId),
      voicePreflight: report,
      voicePreflightAt: nowIso(),
      narratorValidation: {
        passed: true,
        resolvedVoiceId: narratorResult.resolvedVoiceId,
        resolvedVoiceName: narratorResult.resolvedVoiceName,
        checkedAt: nowIso(),
      },
    },
  }
}

async function runStandaloneVoiceSegment(job: ProductionJob, origin: string): Promise<VoiceGenerationResult> {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')
  if (state.voicePreflightPassed !== true || state.voicePreflightStoryId !== String(storyId)) {
    throw new Error('Voice preflight must pass before generate_voices')
  }

  const previous = state.voiceGeneration && typeof state.voiceGeneration === 'object'
    ? state.voiceGeneration
    : {}
  const expectedSegmentCount = Number(
    previous.expectedSegmentCount
    ?? state.voicePreflight?.estimatedSegmentCount?.total
    ?? 0
  )
  const fallbackSegmentNumber = Number.isInteger(previous.nextSegmentNumber)
    ? Number(previous.nextSegmentNumber)
    : firstMissingSegmentNumber(previous.missingSegments, 0)
  const segmentNumber = Math.max(0, fallbackSegmentNumber)
  const endpoint = `${origin}/api/admin/generate-voices`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId,
      retryMissingOnly: true,
      segmentNumber,
    }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices')
  const errorText = String(report?.error || '')
  const skippedNonSegment = response.status === 404 && /No parsed script line found/i.test(errorText)
  const failures = Array.isArray(report?.failures) ? report.failures : []
  const missingSegments = Array.isArray(report?.missingSegments)
    ? report.missingSegments
    : Array.isArray(report?.inventory?.missingSegments)
      ? report.inventory.missingSegments
      : previous.missingSegments || []
  const generatedSegments = [
    ...(Array.isArray(previous.generatedSegments) ? previous.generatedSegments : []),
    ...(Array.isArray(report?.generatedSegments) ? report.generatedSegments : []),
  ]
  const nextSegmentNumber = skippedNonSegment
    ? segmentNumber + 1
    : missingSegments.length > 0
      ? firstMissingSegmentNumber(missingSegments, segmentNumber + 1)
      : segmentNumber + 1
  const complete = !skippedNonSegment && response.ok && failures.length === 0 && missingSegments.length === 0
  const hardFailure = !skippedNonSegment && (!response.ok || failures.length > 0)
  const nextVoiceGeneration = {
    expectedSegmentCount,
    nextSegmentNumber,
    presentCount: Number(report?.presentCount ?? previous.presentCount ?? 0),
    missingSegments,
    generatedSegments,
    failures,
    lastSegmentNumber: segmentNumber,
    lastUpdatedAt: nowIso(),
    lastReport: report,
    skippedNonSegmentCount: Number(previous.skippedNonSegmentCount || 0) + (skippedNonSegment ? 1 : 0),
  }

  return {
    complete,
    hardFailure,
    skippedNonSegment,
    storyId: String(storyId),
    segmentNumber,
    report,
    state: {
      ...state,
      storyId: String(storyId),
      voiceGeneration: nextVoiceGeneration,
    },
  }
}

async function runStandaloneBelleAssets(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const missingSegments = state.voiceGeneration?.missingSegments
  if (!Array.isArray(missingSegments) || missingSegments.length > 0) {
    throw new Error('Voice generation must be complete before generate_belle_assets')
  }

  const response = await fetch(`${origin}/api/admin/generate-voices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, generateBelleOnly: true }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices')
  const success = response.ok && report?.success === true && Boolean(report?.introUrl) && Boolean(report?.outroUrl)

  return {
    success,
    storyId: String(storyId),
    introUrl: String(report?.introUrl || ''),
    outroUrl: String(report?.outroUrl || ''),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      belleAssets: {
        status: success ? 'complete' : 'failed',
        introUrl: report?.introUrl || null,
        outroUrl: report?.outroUrl || null,
        introStatus: report?.introStatus || null,
        outroStatus: report?.outroStatus || null,
        routeResponse: report,
        [success ? 'generatedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

async function validateStandaloneBelleAssets(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,author,script,story_type,series_id,series_total_episodes')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')

  const { data: files, error: listError } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  if (listError) throw new Error(`Failed to list Belle assets: ${listError.message}`)

  const names = (files || []).map(file => file.name)
  const introAssets = names.filter(name => name === 'intro.mp3' || name.startsWith('intro_'))
  const outroAssets = names.filter(name => name === 'outro.mp3' || name.startsWith('outro_'))
  const introText = extractBelleSection(story.script, 'intro')
  const outroText = extractBelleSection(story.script, 'outro')
  const standalone = !story.series_id && Number(story.series_total_episodes || 1) <= 1 && String(story.story_type || '').toLowerCase() !== 'series'
  const issues = [
    ...(introAssets.length > 0 ? [] : ['intro asset is missing.']),
    ...(outroAssets.length > 0 ? [] : ['outro asset is missing.']),
    ...validateBelleText('intro', introText, { standalone, title: story.title, author: story.author }),
    ...validateBelleText('outro', outroText, { standalone, title: story.title, author: story.author }),
  ]
  const success = issues.length === 0
  const report = {
    success,
    introAssets,
    outroAssets,
    introText,
    outroText,
    standalone,
    issues,
  }

  return {
    success,
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      belleAssetValidation: {
        status: success ? 'passed' : 'failed',
        ...report,
        [success ? 'validatedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

async function validateStandaloneBelleQuality(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  if (state.belleQualityValidation?.status === 'passed' && state.belleQualityValidation?.storyId === String(storyId)) {
    return {
      success: true,
      skipped: true,
      storyId: String(storyId),
      report: state.belleQualityValidation,
      state,
    }
  }

  if (state.belleAssetValidation?.status !== 'passed') {
    throw new Error('Belle assets must pass deterministic validation before validate_belle_quality')
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,author,genre,script,story_type,series_id,series_name,episode_number,series_total_episodes,series_is_finale')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')

  const introText = extractBelleSection(story.script, 'intro')
  const outroText = extractBelleSection(story.script, 'outro')
  if (!introText || !outroText) throw new Error('Belle intro/outro text missing')

  const declaredStoryType = [
    story.story_type ? `story_type=${story.story_type}` : '',
    story.series_id ? `series_id=${story.series_id}` : '',
    story.series_name ? `series_name=${story.series_name}` : '',
    story.episode_number ? `episode_number=${story.episode_number}` : '',
    story.series_total_episodes ? `series_total_episodes=${story.series_total_episodes}` : '',
    story.series_is_finale ? `series_is_finale=${story.series_is_finale}` : '',
  ].filter(Boolean).join(', ') || 'standalone inferred from production job'

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${BELLE_QUALITY_VALIDATOR_PROMPT}

DECLARED METADATA:
${declaredStoryType}

TITLE:
${story.title || 'Untitled'}

GENRE:
${story.genre || 'Unknown'}

BELLE INTRO:
${introText}

BELLE OUTRO:
${outroText}

SCRIPT ENDING CONTEXT:
${scriptTail(story.script, 2200)}`,
    }],
  })

  const rawReport = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!rawReport) throw new Error('Belle quality validator returned an empty report')

  const parsed = parseJsonObject(rawReport)
  const introScore = typeof parsed.introScore === 'number' ? parsed.introScore : Number(parsed.introScore || 0)
  const outroScore = typeof parsed.outroScore === 'number' ? parsed.outroScore : Number(parsed.outroScore || 0)
  const modelIssues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : []
  const standalone = !story.series_id && Number(story.series_total_episodes || 1) <= 1 && String(story.story_type || '').toLowerCase() !== 'series'
  const deterministicIssues = [
    ...validateBelleText('intro', introText, { standalone, title: story.title, author: story.author }),
    ...validateBelleText('outro', outroText, { standalone, title: story.title, author: story.author }),
  ]
  const issues = Array.from(new Set([...deterministicIssues, ...modelIssues]))
  const suggestedFixes = Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes.map(String).filter(Boolean) : []
  const success = parsed.pass === true && introScore >= 7 && outroScore >= 7 && issues.length === 0
  const report = {
    success,
    pass: success,
    introScore,
    outroScore,
    issues,
    deterministicIssues,
    modelIssues,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence || 0),
    suggestedFixes,
    rawReport,
    introText,
    outroText,
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'belle-quality-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: String(storyId),
    storyTitle: story.title,
    metadata: { is_v2: true, production_job_id: job.id },
  }).catch(() => {})

  return {
    success,
    skipped: false,
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      belleQualityValidation: {
        status: success ? 'passed' : 'failed',
        storyId: String(storyId),
        ...report,
        [success ? 'validatedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

async function repairStandaloneBelleQuality(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const previousRepair = state.belleQualityRepair && typeof state.belleQualityRepair === 'object'
    ? state.belleQualityRepair
    : {}

  // Asset-validation failures (validate_belle_assets → repair) are a separate repair cycle.
  // They must NOT be blocked by a stale attempt counter from a prior quality-repair loop.
  const isAssetRepair = state.belleAssetValidationFailed === true
  if (!isAssetRepair) {
    const attempts = Number(previousRepair.attempts || 0)
    if (attempts >= 2) throw new Error('Belle quality repair attempt limit reached')
  }

  // Prefer the most relevant failure report for the current repair type.
  // Asset repairs use belleAssetFailedReport (current, has actual forbidden-word issue).
  // Quality repairs use the quality validator report.
  const failedReport = isAssetRepair
    ? (state.belleAssetFailedReport || state.belleQualityValidation || state.belleQualityFailedReport)
    : (state.belleQualityValidation?.status === 'failed'
        ? state.belleQualityValidation
        : state.belleQualityFailedReport || state.belleAssetFailedReport)
  if (!failedReport) throw new Error('Belle quality/asset repair requires a failed validation report')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,author,genre,script,story_type,series_id,series_name,episode_number,series_total_episodes,series_is_finale')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')

  const currentIntro = extractBelleSection(story.script, 'intro')
  const currentOutro = extractBelleSection(story.script, 'outro')
  if (!currentIntro || !currentOutro) throw new Error('Belle intro/outro text missing')

  const issueText = Array.isArray(failedReport.issues) ? failedReport.issues.join('\n') : ''
  const hasScores = typeof failedReport.introScore === 'number' || typeof failedReport.outroScore === 'number'
  const repairIntro = hasScores
    ? Number(failedReport.introScore || 0) < 7 || /\bintro\b/i.test(issueText)
    : /\bintro\b/i.test(issueText) || !failedReport.issues || failedReport.issues.length === 0 || /\bintro/.test(String(failedReport.introText || ''))
  const repairOutro = hasScores
    ? Number(failedReport.outroScore || 0) < 7 || /\boutro\b/i.test(issueText)
    : /\boutro\b/i.test(issueText) || !failedReport.issues || failedReport.issues.length === 0 || /\boutro/.test(String(failedReport.outroText || ''))
  const shouldRepairIntro = repairIntro || (!repairIntro && !repairOutro)
  const shouldRepairOutro = repairOutro || (!repairIntro && !repairOutro)
  // [LISTENER_NAME] is always required in intros — do not derive from the (possibly broken) current intro
  const usesName = true
  const declaredStoryType = [
    story.story_type ? `story_type=${story.story_type}` : '',
    story.series_id ? `series_id=${story.series_id}` : '',
    story.series_name ? `series_name=${story.series_name}` : '',
    story.episode_number ? `episode_number=${story.episode_number}` : '',
    story.series_total_episodes ? `series_total_episodes=${story.series_total_episodes}` : '',
    story.series_is_finale ? `series_is_finale=${story.series_is_finale}` : '',
  ].filter(Boolean).join(', ') || 'standalone inferred from production job'

  const response = await anthropic.messages.create({
    model,
    max_tokens: 900,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: `${BELLE_QUALITY_REPAIR_PROMPT}

REPAIR REQUEST:
Repair intro: ${shouldRepairIntro ? 'yes' : 'no'}
Repair outro: ${shouldRepairOutro ? 'yes' : 'no'}
Intro must include [LISTENER_NAME]: yes (always required)

DECLARED METADATA:
${declaredStoryType}

TITLE:
${story.title || 'Untitled'}

GENRE:
${story.genre || 'Unknown'}

CURRENT BELLE INTRO:
${currentIntro}

CURRENT BELLE OUTRO:
${currentOutro}

FAILED QUALITY REPORT:
${JSON.stringify({
  introScore: failedReport.introScore,
  outroScore: failedReport.outroScore,
  issues: failedReport.issues || [],
  suggestedFixes: failedReport.suggestedFixes || [],
}, null, 2)}

SCRIPT ENDING CONTEXT:
${scriptTail(story.script, 2200)}`,
    }],
  })

  const rawRepair = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!rawRepair) throw new Error('Belle quality repair returned an empty response')

  const parsed = parseJsonObject(rawRepair)
  const repairedIntro = shouldRepairIntro ? normalizeHeaderValue(String(parsed.introText || '')) : currentIntro
  const repairedOutro = shouldRepairOutro ? normalizeHeaderValue(String(parsed.outroText || '')) : currentOutro
  if (shouldRepairIntro && !repairedIntro) throw new Error('Belle quality repair did not return introText')
  if (shouldRepairOutro && !repairedOutro) throw new Error('Belle quality repair did not return outroText')

  const deterministicIssues = [
    ...(shouldRepairIntro ? validateBelleText('intro', repairedIntro, { standalone: true, title: story.title, author: story.author }) : []),
    ...(shouldRepairOutro ? validateBelleText('outro', repairedOutro, { standalone: true, title: story.title, author: story.author }) : []),
  ]
  if (deterministicIssues.length > 0) {
    throw new Error(`Repaired Belle text failed deterministic checks: ${deterministicIssues.join('; ')}`)
  }

  let nextScript = story.script
  if (shouldRepairIntro) nextScript = replaceBelleSection(nextScript, 'intro', repairedIntro)
  if (shouldRepairOutro) nextScript = replaceBelleSection(nextScript, 'outro', repairedOutro)

  const { error: updateError } = await supabase
    .from('stories')
    .update({
      script: nextScript,
      ...(shouldRepairIntro ? { intro_audio_url: null, intro_before_url: null, intro_after_url: null } : {}),
      ...(shouldRepairOutro ? { outro_audio_url: null } : {}),
    })
    .eq('id', storyId)

  if (updateError) throw new Error(`Failed to save repaired Belle text: ${updateError.message}`)

  const { data: files, error: listError } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  if (listError) throw new Error(`Failed to list Belle audio assets for repair: ${listError.message}`)

  const removedAssets = (files || [])
    .map(file => file.name)
    .filter(name => (shouldRepairIntro && (name === 'intro.mp3' || name.startsWith('intro_'))) || (shouldRepairOutro && (name === 'outro.mp3' || name.startsWith('outro_'))))
  if (removedAssets.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('audio')
      .remove(removedAssets.map(name => `asc3/${storyId}/${name}`))
    if (removeError) throw new Error(`Failed to delete stale Belle audio assets: ${removeError.message}`)
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'belle-quality-repair',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: String(storyId),
    storyTitle: story.title,
    metadata: { is_v2: true, production_job_id: job.id },
  }).catch(() => {})

  const repairReport = {
    success: true,
    storyId: String(storyId),
    repairedIntro: shouldRepairIntro,
    repairedOutro: shouldRepairOutro,
    previousIntro: currentIntro,
    previousOutro: currentOutro,
    introText: repairedIntro,
    outroText: repairedOutro,
    removedAssets,
    rawRepair,
  }

  const nextState = { ...state }
  delete nextState.belleAssets
  delete nextState.belleAssetValidation
  delete nextState.belleQualityValidation

  return {
    success: true,
    storyId: String(storyId),
    report: repairReport,
    state: {
      ...nextState,
      storyId: String(storyId),
      belleQualityFailedReport: failedReport,
      belleQualityRepair: {
        ...previousRepair,
        attempts: attempts + 1,
        lastReport: repairReport,
        repairedAt: nowIso(),
      },
    },
  }
}

async function runStandaloneMusicGeneration(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const missingSegments = state.voiceGeneration?.missingSegments
  if (!Array.isArray(missingSegments) || missingSegments.length > 0) {
    throw new Error('Voice generation must be complete before generate_music')
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,genre,script,background_music_url')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')
  if (!story.script) throw new Error('script missing')

  const prompt = musicPromptFor(story.script, story.title || '', story.genre || '')
  const existingUrl = String(story.background_music_url || '').trim()
  if (existingUrl && !existingUrl.startsWith('pending:')) {
    // HAL-PIPE-002 fix: verify background_music.mp3 actually exists in storage before reusing.
    // Same class of bug as render_final_mix — DB URL can be set even if file was not persisted.
    const { data: musicFiles } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
    const musicFileNames = (musicFiles || []).map((f: any) => f.name)
    const musicExists = musicFileNames.includes('background_music.mp3')
    if (musicExists) {
      return {
        success: true,
        skippedExisting: true,
        storyId: String(storyId),
        backgroundMusicUrl: existingUrl,
        prompt,
        report: {
          success: true,
          skippedExisting: true,
          url: existingUrl,
        },
        state: {
          ...state,
          storyId: String(storyId),
          musicGeneration: {
            prompt,
            status: 'complete',
            backgroundMusicUrl: existingUrl,
            routeResponse: { success: true, skippedExisting: true, url: existingUrl },
            skippedExisting: true,
            generatedAt: nowIso(),
          },
        },
      }
    }
    // File missing from storage despite DB URL — fall through to regenerate
    console.warn(`[generate_music] background_music.mp3 missing from storage despite DB url — regenerating`)
  }

  const response = await fetch(`${origin}/api/asc3/generate-music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, prompt }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/asc3/generate-music')
  const backgroundMusicUrl = String(report?.url || report?.musicUrl || '').trim()
  const success = response.ok && report?.success === true && Boolean(backgroundMusicUrl)

  return {
    success,
    skippedExisting: false,
    storyId: String(storyId),
    backgroundMusicUrl,
    prompt,
    report,
    state: {
      ...state,
      storyId: String(storyId),
      musicGeneration: {
        prompt,
        status: success ? 'complete' : 'failed',
        backgroundMusicUrl: backgroundMusicUrl || null,
        routeResponse: report,
        skippedExisting: false,
        [success ? 'generatedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

async function runStandaloneRenderFinalMix(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const missingSegments = state.voiceGeneration?.missingSegments
  if (!Array.isArray(missingSegments) || missingSegments.length > 0) {
    throw new Error('Voice generation must be complete before render_final_mix')
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,audio_url,story_audio_url,background_music_url')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')

  const backgroundMusicUrl = String(story.background_music_url || '').trim()
  const musicStatus = String(state.musicGeneration?.status || '').trim()
  if ((!backgroundMusicUrl || backgroundMusicUrl.startsWith('pending:')) && musicStatus !== 'complete') {
    throw new Error('Story-specific music must be complete before render_final_mix')
  }

  const existingFinalAudioUrl = String(story.audio_url || '').trim()
  const existingStoryBodyUrl = String(story.story_audio_url || '').trim()
  if (
    existingFinalAudioUrl &&
    existingStoryBodyUrl &&
    !existingFinalAudioUrl.startsWith('pending:') &&
    !existingStoryBodyUrl.startsWith('pending:')
  ) {
    return {
      success: true,
      skippedExisting: true,
      storyId: String(storyId),
      finalAudioUrl: existingFinalAudioUrl,
      storyBodyUrl: existingStoryBodyUrl,
      durationSecs: null,
      report: {
        success: true,
        skippedExisting: true,
        finalAudioUrl: existingFinalAudioUrl,
        storyBodyUrl: existingStoryBodyUrl,
      },
      state: {
        ...state,
        storyId: String(storyId),
        renderFinalMix: {
          status: 'complete',
          skippedExisting: true,
          finalAudioUrl: existingFinalAudioUrl,
          storyBodyUrl: existingStoryBodyUrl,
          durationSecs: null,
          routeResponse: {
            success: true,
            skippedExisting: true,
            finalAudioUrl: existingFinalAudioUrl,
            storyBodyUrl: existingStoryBodyUrl,
          },
          renderedAt: nowIso(),
        },
      },
    }
  }

  // ATL-PIPE-003: NULL-LUFS Pre-Assembly Gate — validate all segments before render_final_mix
  const renderAttempts = (state.renderFinalMix?.attempts ?? 0) + 1
  const storyAudioFolder = `asc3/${storyId}`
  try {
    const { data: audioFiles, error: listError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
    if (listError) throw new Error(`Failed to list story segments: ${listError.message}`)
    
    // Check all segment_XXXX.mp3 files for silence (file size ≤ 20KB indicates null/invalid LUFS)
    const segmentPattern = /^segment_\d{4}\.mp3$/
    const audioSegments = (audioFiles || []).filter(f => segmentPattern.test(f.name))
    const nullLufsSegments: string[] = []
    const SILENCE_SIZE_THRESHOLD = 20 * 1024  // 20KB threshold matching generate-voices
    
    for (const file of audioSegments) {
      if ((file.metadata?.size ?? 0) <= SILENCE_SIZE_THRESHOLD) {
        nullLufsSegments.push(file.name)
      }
    }
    
    if (nullLufsSegments.length > 0) {
      const errorReport = {
        success: false,
        kind: 'null_lufs_segments',
        error: 'NULL_LUFS_PRE_ASSEMBLY_GATE_FAILED',
        affectedSegments: nullLufsSegments,
        message: 'Pre-assembly gate: segments have null LUFS. Delete affected segments and reset job to generate_voices.',
        remediation: 'Delete affected segments and reset job to generate_voices step for regeneration',
      }
      // Allow max 2 render attempts before marking as terminal failure
      if (renderAttempts >= 2) {
        return {
          success: false,
          skippedExisting: false,
          storyId: String(storyId),
          finalAudioUrl: null,
          storyBodyUrl: null,
          durationSecs: null,
          report: errorReport,
          state: {
            ...state,
            storyId: String(storyId),
            renderFinalMix: {
              status: 'failed',
              skippedExisting: false,
              finalAudioUrl: null,
              storyBodyUrl: null,
              durationSecs: null,
              attempts: renderAttempts,
              routeResponse: errorReport,
              failedAt: nowIso(),
              terminalFailure: true,
            },
          },
        }
      }
      // Under retry limit — fail this attempt but allow orchestrator to retry
      return {
        success: false,
        skippedExisting: false,
        storyId: String(storyId),
        finalAudioUrl: null,
        storyBodyUrl: null,
        durationSecs: null,
        report: errorReport,
        state: {
          ...state,
          storyId: String(storyId),
          renderFinalMix: {
            status: 'failed',
            skippedExisting: false,
            finalAudioUrl: null,
            storyBodyUrl: null,
            durationSecs: null,
            attempts: renderAttempts,
            routeResponse: errorReport,
            failedAt: nowIso(),
            terminalFailure: false,
          },
        },
      }
    }
  } catch (e) {
    // If segment validation itself fails, log warning but continue to render attempt
    console.warn(`[ATL-PIPE-003] Segment pre-flight validation error: ${String(e).slice(0, 200)}`)
  }

  // Direct module call — eliminates HTTP hop and Vercel edge network timeout risk (ATL P1-B)
  console.log(`[runStandaloneRenderFinalMix] Calling runRenderFinalMix directly for ${storyId}`)
  const report = await runRenderFinalMix(String(storyId))
  const finalAudioUrl = String(report?.finalAudioUrl || '').trim()
  const storyBodyUrl = String(report?.storyBodyUrl || '').trim()
  const durationSecs = Number(report?.durationSecs || 0)

  // Fix C: Confirm final_mix.mp3 actually exists in storage before claiming success
  let storageConfirmed = false
  if (report?.success === true && Boolean(finalAudioUrl) && Boolean(storyBodyUrl)) {
    const storyAudioFolderForCheck = `asc3/${storyId}`
    const { data: storageFiles, error: storageCheckErr } = await supabase.storage
      .from('audio')
      .list(storyAudioFolderForCheck, { limit: 500 })
    if (storageCheckErr) {
      console.error(`[runStandaloneRenderFinalMix] Storage check failed: ${storageCheckErr.message}`)
    } else {
      storageConfirmed = (storageFiles || []).some(f => f.name === 'final_mix.mp3')
      if (!storageConfirmed) {
        console.error(`[runStandaloneRenderFinalMix] render reported success but final_mix.mp3 not found in storage at ${storyAudioFolderForCheck}`)
      }
    }
  }

  const success = report?.success === true && Boolean(finalAudioUrl) && Boolean(storyBodyUrl) && storageConfirmed

  return {
    success,
    skippedExisting: false,
    storyId: String(storyId),
    finalAudioUrl,
    storyBodyUrl,
    durationSecs: Number.isFinite(durationSecs) && durationSecs > 0 ? durationSecs : null,
    report,
    state: {
      ...state,
      storyId: String(storyId),
      renderFinalMix: {
        status: success ? 'complete' : 'failed',
        skippedExisting: false,
        finalAudioUrl: finalAudioUrl || null,
        storyBodyUrl: storyBodyUrl || null,
        durationSecs: Number.isFinite(durationSecs) && durationSecs > 0 ? durationSecs : null,
        attempts: renderAttempts,
        routeResponse: report,
        [success ? 'renderedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

async function runStandalonePackageCompletion(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,audio_url,story_audio_url')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')

  const audioUrl = String(story.audio_url || '').trim()
  const storyAudioUrl = String(story.story_audio_url || '').trim()
  // HAL-PIPE-002 fix: always require audio_url to be set, even when renderFinalMix.status=complete.
  // The previous bypass allowed complete_story_package to run when audio_url was null (if render
  // state said complete but the DB update silently failed), causing the story to reach RFR without audio.
  if (!audioUrl || audioUrl.startsWith('pending:') || !storyAudioUrl || storyAudioUrl.startsWith('pending:')) {
    throw new Error('Final mix outputs must exist before complete_story_package (audio_url and story_audio_url must be set in stories table)')
  }

  const response = await fetch(`${origin}/api/admin/complete-story-package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/complete-story-package')
  const success = response.ok && report?.success === true

  return {
    success,
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      packageCompletion: {
        status: success ? 'complete' : 'failed',
        routeResponse: report,
        [success ? 'completedAt' : 'failedAt']: nowIso(),
      },
    },
  }
}

function stateEpisodeStoryIds(state: any) {
  const candidates = [
    state?.episodes,
    state?.seriesValidation?.validatedEpisodes,
    state?.seriesVoicePreflight?.checkedEpisodes,
    Object.values(state?.seriesVoiceGeneration?.progressByEpisode || {}),
  ]

  const seen = new Set<string>()
  const episodes: Array<{ storyId: string; episodeNumber: number | null; title: string }> = []

  for (const candidateList of candidates) {
    if (!Array.isArray(candidateList)) continue
    for (const item of candidateList) {
      const storyId = String(item?.storyId || item?.story_id || item?.id || '').trim()
      if (!storyId || seen.has(storyId)) continue
      seen.add(storyId)
      const episodeNum = Number(item?.episodeNumber || item?.episode_number || item?.series_episode_number || 0)
      episodes.push({
        storyId,
        episodeNumber: Number.isFinite(episodeNum) && episodeNum > 0 ? episodeNum : null,
        title: String(item?.title || '').trim(),
      })
    }
  }

  return episodes
}

async function resolveSeriesPackageEpisodes(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = String(job.series_id || state.seriesId || '').trim()
  const fromState = stateEpisodeStoryIds(state)
  const byId = new Map<string, { storyId: string; episodeNumber: number | null; title: string }>()

  for (const episode of fromState) byId.set(episode.storyId, episode)

  if (seriesId) {
    const dbEpisodes = await loadSeriesEpisodes(seriesId)
    for (const episode of dbEpisodes) {
      byId.set(String(episode.id), {
        storyId: String(episode.id),
        episodeNumber: episodeNumber(episode, byId.size + 1),
        title: String(episode.title || '').trim(),
      })
    }
  }

  const episodes = Array.from(byId.values())
    .sort((a, b) => (a.episodeNumber || 999) - (b.episodeNumber || 999))

  const expectedCount = Number(state.totalEpisodes || state.seriesValidation?.episodeCount || 0)
  if (!episodes.length) throw new Error('Series package completion could not resolve episode story IDs')
  if (expectedCount > 0 && episodes.length < expectedCount) {
    throw new Error(`Series package completion resolved ${episodes.length}/${expectedCount} episode story IDs`)
  }

  return { seriesId, episodes }
}

function missingSeriesPackageReviewFields(story: any) {
  const missing: string[] = []
  if (story?.status !== 'audio_ready') missing.push('status=audio_ready')
  if (!String(story?.story_audio_url || '').trim()) missing.push('story_audio_url')
  if (!String(story?.cover_url || '').trim()) missing.push('cover_url')
  if (story?.published_on !== null) missing.push('published_on=null')
  if (story?.review_status !== 'pending') missing.push('review_status=pending')
  return missing
}

async function verifySeriesPackageEpisode(storyId: string) {
  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,episode_number,status,story_audio_url,cover_url,published_on,review_status')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || `Story not found after package completion: ${storyId}`)

  const missingFields = missingSeriesPackageReviewFields(story)
  return {
    success: missingFields.length === 0,
    missingFields,
    story: {
      id: story.id,
      title: story.title,
      episodeNumber: story.episode_number,
      status: story.status,
      storyAudioUrlPresent: Boolean(String(story.story_audio_url || '').trim()),
      coverUrlPresent: Boolean(String(story.cover_url || '').trim()),
      published_on: story.published_on,
      review_status: story.review_status,
    },
  }
}

async function runSeriesPackageCompletion(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const { seriesId, episodes } = await resolveSeriesPackageEpisodes(job)
  const prev = state.seriesCompleteStoryPackage && typeof state.seriesCompleteStoryPackage === 'object'
    ? state.seriesCompleteStoryPackage
    : {}
  const doneByEp: Record<string, boolean> = prev.doneByEp || {}
  const reportsByEp: Record<string, unknown> = prev.reportsByEp || {}
  const verifiedByEp: Record<string, unknown> = prev.verifiedByEp || {}
  const processedEpisodes: Array<{ episodeNumber: number | null; storyId: string; title: string }> = []

  for (const episode of episodes) {
    const key = String(episode.episodeNumber || episode.storyId)
    if (doneByEp[key]) continue

    const response = await fetch(`${origin}/api/admin/complete-story-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: episode.storyId }),
    })
    const report = await readJsonOrDiagnostic(response, '/api/admin/complete-story-package')
    reportsByEp[key] = report

    if (!response.ok || report?.success !== true) {
      const reason = String(report?.error || report?.blockingReason || `HTTP ${response.status}`)
      return {
        success: false,
        seriesId,
        episode,
        reason,
        report,
        processedEpisodes,
        state: {
          ...state,
          seriesId: seriesId || state.seriesId,
          seriesCompleteStoryPackage: {
            episodeCount: episodes.length,
            doneByEp,
            reportsByEp,
            verifiedByEp,
            failedEpisode: episode,
            failureReason: reason,
            allDone: false,
            lastUpdatedAt: nowIso(),
          },
        },
      }
    }

    const verification = await verifySeriesPackageEpisode(episode.storyId)
    verifiedByEp[key] = verification
    if (!verification.success) {
      const reason = `Package verification failed: missing ${verification.missingFields.join(', ')}`
      return {
        success: false,
        seriesId,
        episode,
        reason,
        report,
        verification,
        processedEpisodes,
        state: {
          ...state,
          seriesId: seriesId || state.seriesId,
          seriesCompleteStoryPackage: {
            episodeCount: episodes.length,
            doneByEp,
            reportsByEp,
            verifiedByEp,
            failedEpisode: episode,
            failureReason: reason,
            allDone: false,
            lastUpdatedAt: nowIso(),
          },
        },
      }
    }

    // ── Intro/outro position validation per episode ───────────────────────
    // Fetch script + series metadata (kept separate from verifiedByEp to avoid
    // storing full script text in state_json).
    const { data: epStory } = await supabase
      .from('stories')
      .select('id,title,author,script,series_id,series_name,episode_number,series_total_episodes,series_is_finale')
      .eq('id', episode.storyId)
      .maybeSingle()

    if (epStory?.script) {
      const introText = extractBelleSection(epStory.script, 'intro')
      const outroText = extractBelleSection(epStory.script, 'outro')
      const positionResult = validateIntroOutroPositionRules(epStory, introText, outroText)
      if (!positionResult.passed) {
        const epLabel = `EP${episode.episodeNumber ?? episode.storyId}`
        const prefixedIssues = positionResult.issues.map(i => `${epLabel}: ${i}`)
        const reason = prefixedIssues.join('; ')
        return {
          success: false,
          seriesId,
          episode,
          reason,
          contentIssues: prefixedIssues,
          report,
          processedEpisodes,
          state: {
            ...state,
            seriesId: seriesId || state.seriesId,
            seriesCompleteStoryPackage: {
              episodeCount: episodes.length,
              doneByEp,
              reportsByEp,
              verifiedByEp,
              failedEpisode: episode,
              failureReason: reason,
              contentIssues: prefixedIssues,
              allDone: false,
              lastUpdatedAt: nowIso(),
            },
          },
        }
      }
    }

    doneByEp[key] = true
    processedEpisodes.push(episode)
  }

  const allDone = episodes.every((episode) => doneByEp[String(episode.episodeNumber || episode.storyId)])
  return {
    success: allDone,
    seriesId,
    episodes,
    processedEpisodes,
    state: {
      ...state,
      seriesId: seriesId || state.seriesId,
      seriesCompleteStoryPackage: {
        episodeCount: episodes.length,
        doneByEp,
        reportsByEp,
        verifiedByEp,
        allDone,
        completedAt: allDone ? nowIso() : null,
        lastUpdatedAt: nowIso(),
      },
    },
  }
}

function missingReadyForReviewFields(story: any) {
  const missing: string[] = []
  if (story?.status !== 'audio_ready') missing.push('status=audio_ready')
  if (story?.is_hidden !== true) missing.push('is_hidden=true')
  if (story?.published_on !== null) missing.push('published_on=null')
  if (!String(story?.audio_url || '').trim()) missing.push('audio_url')
  if (!String(story?.story_audio_url || '').trim()) missing.push('story_audio_url')
  if (!String(story?.cover_url || '').trim()) missing.push('cover_url')
  if (!String(story?.prose_text || '').trim()) missing.push('prose_text')
  return missing
}

async function verifyStandaloneReadyForReview(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  const { data: story, error } = await supabase
    .from('stories')
    .select('id,title,author,script,status,is_hidden,published_on,audio_url,story_audio_url,cover_url,prose_text,series_id,series_name,episode_number,series_total_episodes,series_is_finale')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')

  const missingFields = missingReadyForReviewFields(story)
  const structuralOk = missingFields.length === 0

  // ── HAL-PIPE-002: Hard Audio Gate — final_mix.mp3 must exist in storage ──
  // The DB audio_url field can be set even if the file was never actually uploaded.
  // Verify the file physically exists in storage before allowing RFR promotion.
  const audioGateIssues: string[] = []
  if (structuralOk) {
    const { data: storageFiles } = await supabase.storage
      .from('audio')
      .list(`asc3/${storyId}`, { limit: 500 })
    const storageNames = (storageFiles || []).map((f: any) => f.name)
    if (!storageNames.includes('final_mix.mp3')) {
      audioGateIssues.push('Audio Gate failed: final_mix.mp3 not found in storage. Render step must be re-run.')
    }
  }
  // ── END AUDIO GATE ────────────────────────────────────────────────────────

  // ── Intro/outro position validation ───────────────────────────────────────
  // Runs only when structural fields are present (avoids false positives on
  // audio-not-ready stories) and script is available.
  const contentIssues: string[] = [...audioGateIssues]
  if (structuralOk && audioGateIssues.length === 0 && story.script) {
    const introText = extractBelleSection(story.script, 'intro')
    const outroText = extractBelleSection(story.script, 'outro')
    const positionResult = validateIntroOutroPositionRules(story, introText, outroText)
    if (!positionResult.passed) contentIssues.push(...positionResult.issues)
  }

  const success = structuralOk && contentIssues.length === 0

  return {
    success,
    storyId: String(storyId),
    missingFields,
    contentIssues: contentIssues.length > 0 ? contentIssues : undefined,
    story,
    state: {
      ...state,
      storyId: String(storyId),
      readyForReview: {
        status: success ? 'complete' : 'failed',
        missingFields,
        contentIssues: contentIssues.length > 0 ? contentIssues : undefined,
        verifiedAt: nowIso(),
      },
    },
  }
}

function buildSeriesEpisodePrompt(series: any, episode: any, allEpisodes: any[], continuityBundle: any[], namePaletteBlock: string) {
  const brief = episode.brief_json || {}
  const target = runtimeTarget(brief.runtime || '')
  const currentEpisodeNumber = episodeNumber(episode, 1)
  const totalEpisodes = Number(episode.series_total_episodes || brief.series_total_episodes || allEpisodes.length)
  const isFinale = Boolean(episode.series_is_finale ?? brief.series_is_finale ?? currentEpisodeNumber === totalEpisodes)
  const belleOutroRule = isFinale
    ? 'Belle B outro must resolve/close the series, must not encourage the next episode, and may include the author/narrator credit and "an Endless Tales original".'
    : 'Belle B outro must restate the episode cliffhanger, invite the listener to continue to the next episode, must not say "an Endless Tales original", and must not sound like a full-series ending.'
  const belleOutroTemplate = isFinale
    ? '[one or two short sentences, reflective series closure, no time-of-day reference, no next-episode invitation, may credit the author/narrator and say "an Endless Tales original"]'
    : '[one or two short sentences, reflective cliffhanger tease, no time-of-day reference, invites the next episode, no author/narrator credit, no "Endless Tales original", not a full-series ending]'

  return `You are the Endless Tales Stage 2 series script writer.

Write exactly one production-ready audio drama script for Episode ${currentEpisodeNumber} of ${totalEpisodes}.
Use the saved series package as the source of truth. Do not invent a new series premise.
Output ONLY the script. No commentary.

🎯 ENTERTAINMENT FIRST RULE — NON-NEGOTIABLE

The primary purpose of every Endless Tales story is to entertain.
Listeners come for suspense, curiosity, emotion, mystery, wonder, humor, fear, connection, and the desire to know what happens next.

NEVER interrupt a story to teach a lesson.
NEVER have the narrator explain the meaning of the story.
NEVER include speeches whose primary purpose is to educate, persuade, moralize, lecture, or preach.
NEVER allow a character to become the author's mouthpiece.

If a story contains a lesson, theme, or insight — it must emerge naturally through character choices, consequences, conflict, sacrifice, failure, success, and events. The listener discovers meaning. You do not explain it.

Story first. Theme second. Lesson last.
The story is the meal. The lesson is seasoning.

⭐ MANDATORY FIRST STEP: STORY RESOLUTION MAP ⭐

Before drafting, build this episode around the Difficult Solution Rule. Output a Story Resolution Map as a comment block at the top of the script. It will be removed before audio production.

The map must include:
1. CORE EPISODE PROBLEM
   The immediate episode-level danger, mystery, desire, wound, or conflict.
2. WHY IT SEEMS DIFFICULT OR IMPOSSIBLE
   Why the solution initially feels hidden, dangerous, costly, morally difficult, emotionally painful, or unlikely.
3. WHAT CHANGES IN THE MIDDLE
   The discoveries, reversals, leverage, escalating consequences, or emotional shifts that gradually make the episode solution possible.
4. FINAL DECISIVE ACTION
   The concrete onstage action the protagonist takes to affect the episode outcome.
   ${isFinale ? 'Because this is the finale, this action must also resolve the series-level problem.' : 'Because this is not the finale, this action must resolve the episode problem while strengthening the larger series hook.'}
5. EMOTIONAL PAYOFF
   What the ending costs, heals, reveals, changes, or makes the listener feel.
6. VARIETY GUARDRAIL
   How this episode's solution engine differs from other episodes. Consider sacrifice, confrontation, revelation, escape, reversal, emotional confession, strategic trap, moral choice, rescue, justice, forgiveness, survival, transformation, or bittersweet acceptance.

Ending hard rules:
- The problem must feel genuinely difficult at the beginning.
- The middle must progressively increase understanding, reveal leverage, and escalate consequences.
- The climax must happen onstage.
- The protagonist must affect the outcome through decisive action.
- The ending must resolve through dramatic action and consequence, not explanation alone.
- Avoid offscreen solutions, passive symbolic endings, abrupt explanation dumps, "villain already dead" anticlimax, and endings where the protagonist only watches or learns what happened.

CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- ${belleOutroRule}
- No SFX in the published story body.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.

${namePaletteBlock}

Required script structure:
TITLE: [${brief.episode_title || episode.title}; 1 to 5 words, 28 characters or fewer]
SERIES: ${series.title || brief.series_name || ''}
EPISODE: ${currentEpisodeNumber}
EPISODE_TITLE: ${brief.episode_title || episode.title}
SERIES_TOTAL_EPISODES: ${totalEpisodes}
SERIES_IS_FINALE: ${isFinale ? 'true' : 'false'}
AUTHOR: ${episode.author || brief.author || ''}
GENRE: ${episode.genre || brief.genre || ''}
DESCRIPTION: [70 characters or fewer, present tense only]
NARRATOR: [assigned narrator name, not a story character unless NARRATOR_IS_CHARACTER is true]
ANNOUNCER: Belle B
NARRATIVE_VOICE: ${episode.narrative_voice || brief.narrative_voice || ''}
NARRATOR_IS_CHARACTER: [true/false, must match NARRATOR]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B INTRO
---
BELLE B: [one or two short sentences, warm, specific, sensory, includes exactly one [LISTENER_NAME] placeholder placed naturally, includes the episode title in quotes, references something specific from the episode, no time-of-day reference, no author/narrator credit, no "Endless Tales original"]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: ${belleOutroTemplate}

Production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Every narration/dialogue paragraph after [START AUDIO DRAMA SCRIPT] must begin with a speaker label.
- Do not write unlabeled continuation paragraphs.
- If narration continues, start a new NARRATOR: line.
- Every spoken line sent to audio must begin with NARRATOR: or CHARACTER NAME:.

Series rules:
- Episode ${currentEpisodeNumber} must match the current episode brief.
- Carry forward consequences from prior episodes.
- Do not repeat prior episode scenes except as brief context.
- ${isFinale ? 'This is the finale. Resolve the season arc completely.' : 'This is not the finale. End on a specific cliffhanger with forward momentum. Do not use "to be continued" phrasing.'}

Additional rules:
- DESCRIPTION must be 70 characters or fewer and present tense only.
- If NARRATOR_IS_CHARACTER is false, NARRATOR must not be a story character name and must not include "(character)".
- If the narrator is a story character, NARRATOR_IS_CHARACTER must be true and the script must use consistent first-person narration.
- Keep narrator voice consistent.
- Do not include markdown fences.

RUNTIME TARGET:
Requested runtime: ${target.runtime}
Target script length: ${target.range} words total.
Hard maximum: ${target.max.toLocaleString()} words total.

USER NOTES / CONSTRAINTS:
${String(brief.requirements || '').trim() || 'None'}

SERIES PACKAGE:
${JSON.stringify({
    series_id: series.id,
    series_title: series.title,
    series_bible: series.description || brief.series_bible || '',
    full_episode_plan: brief.full_episode_plan || allEpisodes.map((ep: any) => ep.brief_json).filter(Boolean),
  }, null, 2)}

CURRENT EPISODE BRIEF:
${JSON.stringify(brief, null, 2)}

PRIOR EPISODE CONTINUITY BUNDLE:
${JSON.stringify(continuityBundle, null, 2)}
`
}

async function createSeriesPackage(job: ProductionJob) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const input = job.input_json && typeof job.input_json === 'object' ? job.input_json : {}
  const queueItem = input.queueItem || {}
  const existingSeriesId = job.series_id || state.seriesId || queueValue(queueItem, 'seriesId', 'series_id')

  if (existingSeriesId) {
    const episodes = await loadSeriesEpisodes(String(existingSeriesId))
    if (episodes.length > 0) {
      return {
        seriesId: String(existingSeriesId),
        episodes,
        state: {
          ...state,
          seriesId: String(existingSeriesId),
          episodes: episodes.map((episode: any) => ({
            storyId: episode.id,
            title: episode.title,
            status: episode.status,
            episodeNumber: episode.episode_number || episode.series_episode_number,
          })),
          createSeriesPackageSkipped: true,
        },
        created: false,
      }
    }
  }

  const genre = String(queueValue(queueItem, 'primaryGenre', 'primary_genre') || 'Mystery').trim()
  const premise = String(queueValue(queueItem, 'premise')).trim()
  const setting = String(queueValue(queueItem, 'setting')).trim()
  const runtime = String(queueValue(queueItem, 'duration') || '15 min').trim()
  const authorTarget = String(queueValue(queueItem, 'authorTarget', 'author_target')).trim()
  const stateEpisodesCount = Array.isArray(state.episodes) ? state.episodes.length : 0
  const totalEpisodes = Math.max(totalEpisodesFor(queueItem), stateEpisodesCount)

  if (totalEpisodes < 2) throw new Error(
    `Series jobs require at least 2 episodes ` +
    `(resolved ${totalEpisodes}: queueItem.totalEpisodes=${queueItem.totalEpisodes ?? 'missing'}, ` +
    `total_episodes=${queueItem.total_episodes ?? 'missing'}, state.episodes.length=${stateEpisodesCount})`
  )
  if (!premise) throw new Error('Queue item premise is required to create series package')
  if (!setting) throw new Error('Queue item setting is required to create series package')
  if (!runtime) throw new Error('Queue item duration is required to create series package')

  const author = await pickAuthor(genre, authorTarget)
  if (!author) throw new Error(`No approved author found for genre ${genre}`)

  const title = sanitizeSeriesTitle(titleFromQueue(queueItem) || queuePlanValue(queueItem, 'Series title') || 'Untitled Series Package') || 'Untitled Series Package'
  const requirements = [
    'Server production job queue.',
    'Use canonical V2 script generation and ASC3 audio pipeline only.',
    'Do not publish automatically.',
    'Generate this entire series sequentially.',
    'Final review target after audio production is status=audio_ready, is_hidden=true, published_on=null.',
    String(queueValue(queueItem, 'notes')).trim(),
  ].filter(Boolean).join(' ')

  const parentResult = await saveSeriesParent({
    title,
    description: [
      `Series production package for ${title}.`,
      `Premise: ${premise}`,
      `Setting: ${setting}`,
      `Runtime: ${runtime} per episode.`,
      requirements,
    ].filter(Boolean).join('\n'),
    author: author.name,
    genre,
    total_episodes: totalEpisodes,
    is_complete: false,
  })

  if (parentResult.error || !parentResult.data) {
    throw new Error(parentResult.error?.message || 'Failed to save series package')
  }

  const series = parentResult.data
  const seriesId = series.id as string
  const existingEpisodes = await loadSeriesEpisodes(seriesId)
  const existingByEpisode = new Map(
    existingEpisodes.map((episode: any) => [Number(episode.episode_number || episode.series_episode_number || 0), episode])
  )
  const savedEpisodes = []

  for (let episodeNumber = 1; episodeNumber <= totalEpisodes; episodeNumber += 1) {
    const existing = existingByEpisode.get(episodeNumber)
    if (existing) {
      savedEpisodes.push(existing)
      continue
    }

    const isFinale = episodeNumber === totalEpisodes
    const episodeTitle = `Episode ${episodeNumber}`
    const briefJson = {
      type: 'series',
      package_phase: 'production_job_series_package',
      series_id: seriesId,
      series_name: title,
      series_title: title,
      series_bible: series.description || '',
      full_episode_plan: null,
      title: episodeTitle,
      episode_title: episodeTitle,
      series_episode_number: episodeNumber,
      series_total_episodes: totalEpisodes,
      series_is_finale: isFinale,
      author: author.name,
      author_style: author.style_reference || author.style_description || author.name,
      genre,
      narrative_voice: author.narrative_voice || null,
      premise,
      requirements,
      setting,
      runtime,
      description: null,
      continuity_notes: null,
      cliffhanger_or_resolution: null,
    }

    const { data: story, error } = await supabase
      .from('stories')
      .insert({
        title: episodeTitle,
        author: author.name,
        author_style: briefJson.author_style,
        genre,
        narrative_voice: briefJson.narrative_voice,
        description: null,
        brief_json: briefJson,
        is_v2: true,
        status: 'brief_complete',
        script_version: 1,
        story_type: 'series_episode',
        series_id: seriesId,
        series_name: sanitizeSeriesTitle(title),
        episode_number: episodeNumber,
        series_episode_number: episodeNumber,
        series_total_episodes: totalEpisodes,
        series_is_finale: isFinale,
        duration_label: runtime,
        duration_mins: runtimeToMinutes(runtime),
        is_hidden: true,
        published_on: null,
      })
      .select('id,title,status,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
      .single()

    if (error || !story) {
      throw new Error(error?.message || `Failed to save series episode ${episodeNumber}`)
    }

    savedEpisodes.push(story)
  }

  const episodes = await loadSeriesEpisodes(seriesId)

  return {
    seriesId,
    episodes,
    state: {
      ...state,
      seriesId,
      seriesTitle: title,
      author: author.name,
      genre,
      runtime,
      totalEpisodes,
      episodes: episodes.map((episode: any) => ({
        storyId: episode.id,
        title: episode.title,
        status: episode.status,
        episodeNumber: episode.episode_number || episode.series_episode_number,
      })),
      createSeriesPackageSkipped: false,
    },
    created: savedEpisodes.length > existingEpisodes.length,
  }
}

async function generateOneSeriesEpisodeScript(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job is missing series_id')

  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) throw new Error(seriesError?.message || 'Series package not found')

  const episodes = await loadSeriesEpisodes(String(seriesId))
  if (!episodes.length) throw new Error('No child episodes found for series package')

  const targetEpisode = episodes.find((episode: any) => !episode.script)
  if (!targetEpisode) {
    return {
      generated: false,
      seriesId: String(seriesId),
      episode: null,
      episodes,
      nextStep: NEXT_STEP_AFTER_SERIES_SCRIPTS,
      state: {
        ...state,
        seriesId: String(seriesId),
        episodes: episodes.map((episode: any) => ({
          storyId: episode.id,
          title: episode.title,
          status: episode.status,
          episodeNumber: episodeNumber(episode, 0),
          hasScript: Boolean(episode.script),
        })),
      },
    }
  }

  const targetEpisodeNumber = episodeNumber(targetEpisode, episodes.indexOf(targetEpisode) + 1)
  const priorEpisodes = episodes
    .filter((episode: any) => episodeNumber(episode, 0) < targetEpisodeNumber && episode.script)
  const continuityBundle = buildContinuityBundle(priorEpisodes)
  const brief = targetEpisode.brief_json || {}
  const recentStoryTexts = await loadRecentStoryTexts(String(seriesId))
  const namePaletteBlock = buildNamePalettePromptBlock({
    genre: targetEpisode.genre || brief.genre || '',
    setting: [brief.setting, brief.location, brief.region, series.setting].filter(Boolean).join(' '),
    era: brief.era || brief.period || '',
    seriesContinuityText: continuityBundle.map((item: any) => JSON.stringify(item)).join('\n'),
    recentStoryTexts,
  })
  const prompt = buildSeriesEpisodePrompt(series, targetEpisode, episodes, continuityBundle, namePaletteBlock)

  const response = await anthropic.messages.create({
    model,
    max_tokens: 12000,
    temperature: 0.65,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawScript = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  const normalized = normalizeScriptDescription(rawScript, brief.description || targetEpisode.description || '')
  const script = normalized.script
  const description = normalized.description
  const generatedTitle = extractTitle(script) || targetEpisode.title || ''
  const wordCount = countWords(generatedTitle)

  if (!script) throw new Error(`Episode ${targetEpisodeNumber} returned an empty script`)
  if (!generatedTitle || wordCount < 1 || wordCount > 5) {
    throw new Error(`Episode ${targetEpisodeNumber} generated title must be 1 to 5 words. Got: "${generatedTitle}"`)
  }

  const existingJson = targetEpisode.script_json && typeof targetEpisode.script_json === 'object'
    ? targetEpisode.script_json
    : {}
  const nextBrief = { ...brief, description }
  const scriptJson = {
    ...existingJson,
    series_generation: {
      generated_title: generatedTitle,
      generated_at: nowIso(),
      model,
      episode_number: targetEpisodeNumber,
      series_id: String(seriesId),
      continuity_bundle_used: continuityBundle,
      summary: {
        title: generatedTitle,
        description,
        planned_continuity_notes: brief.continuity_notes || '',
        planned_cliffhanger_or_resolution: brief.cliffhanger_or_resolution || '',
        script_tail: scriptTail(script),
      },
    },
    raw_script: script,
  }

  const { data: updated, error: updateError } = await supabase
    .from('stories')
    .update({
      title: generatedTitle,
      description,
      script,
      script_json: scriptJson,
      brief_json: nextBrief,
      status: 'script_drafted',
      script_version: (targetEpisode.script_version || 1) + 1,
    })
    .eq('id', targetEpisode.id)
    .select('id,title,status,script,series_id,episode_number,series_episode_number')
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message || `Episode ${targetEpisodeNumber} update failed`)
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'series-episode-script',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: targetEpisode.id,
    storyTitle: generatedTitle,
    metadata: { is_v2: true, series_id: String(seriesId), episode_number: targetEpisodeNumber },
  }).catch(() => {})

  const refreshedEpisodes = await loadSeriesEpisodes(String(seriesId))
  const allScriptsGenerated = refreshedEpisodes.every((episode: any) => Boolean(episode.script))
  const nextStep = allScriptsGenerated ? NEXT_STEP_AFTER_SERIES_SCRIPTS : NEXT_STEP_AFTER_SERIES_CREATE

  return {
    generated: true,
    seriesId: String(seriesId),
    episode: {
      storyId: updated.id,
      title: updated.title,
      status: updated.status,
      episodeNumber: targetEpisodeNumber,
    },
    episodes: refreshedEpisodes,
    nextStep,
    state: {
      ...state,
      seriesId: String(seriesId),
      episodes: refreshedEpisodes.map((episode: any) => ({
        storyId: episode.id,
        title: episode.title,
        status: episode.status,
        episodeNumber: episodeNumber(episode, 0),
        hasScript: Boolean(episode.script),
      })),
      lastGeneratedEpisodeNumber: targetEpisodeNumber,
      lastGeneratedEpisodeStoryId: updated.id,
    },
  }
}

function validateSeriesMetadata(episodes: any[], seriesId: string) {
  const issues: string[] = []
  const total = episodes.length
  const seen = new Set<number>()

  if (total < 2) issues.push('Series package must contain at least two episodes.')

  episodes.forEach((episode: any, index: number) => {
    const expectedEpisodeNumber = index + 1
    const number = episodeNumber(episode, expectedEpisodeNumber)
    seen.add(number)

    if (String(episode.series_id || '') !== String(seriesId)) {
      issues.push(`Episode ${expectedEpisodeNumber} has mismatched series_id.`)
    }
    if (String(episode.story_type || '') !== 'series_episode') {
      issues.push(`Episode ${expectedEpisodeNumber} is not marked story_type=series_episode.`)
    }
    if (number !== expectedEpisodeNumber) {
      issues.push(`Episode ${expectedEpisodeNumber} has episode number ${number}.`)
    }
    if (Number(episode.series_total_episodes || 0) !== total) {
      issues.push(`Episode ${expectedEpisodeNumber} has series_total_episodes=${episode.series_total_episodes}, expected ${total}.`)
    }
    const shouldBeFinale = expectedEpisodeNumber === total
    if (Boolean(episode.series_is_finale) !== shouldBeFinale) {
      issues.push(`Episode ${expectedEpisodeNumber} has series_is_finale=${Boolean(episode.series_is_finale)}, expected ${shouldBeFinale}.`)
    }
    if (!episode.script) {
      issues.push(`Episode ${expectedEpisodeNumber} is missing script.`)
    }
  })

  for (let expected = 1; expected <= total; expected += 1) {
    if (!seen.has(expected)) issues.push(`Series is missing episode number ${expected}.`)
  }

  return issues
}

async function validateSeriesEpisodeScript(episode: any, model: string, job: ProductionJob) {
  const storyId = String(episode.id)
  const number = episodeNumber(episode, 0)
  const script = String(episode.script || '')
  if (!script) {
    return {
      passed: false,
      skipped: false,
      storyId,
      episodeNumber: number,
      report: `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
- Episode ${number} script is missing.`,
      story: episode,
    }
  }

  if (episode.status === 'validator_passed' || episode.validator_result === 'PASS') {
    return {
      passed: true,
      skipped: true,
      storyId,
      episodeNumber: number,
      report: episode.validator_report || '✓ Validator already passed.',
      story: episode,
    }
  }

  const cardCopyIssues = validateCardCopy(script)
  if (cardCopyIssues.length > 0) {
    const report = `❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
${cardCopyIssues.map((issue) => `- ${issue}`).join('\n')}`

    const { data: updated, error: updateError } = await supabase
      .from('stories')
      .update({
        validator_result: 'FAIL',
        validator_report: report,
        validator_passed_at: null,
        status: 'validator_failed',
      })
      .eq('id', storyId)
      .select('id,title,status,description,validator_result,validator_report,validator_passed_at')
      .single()

    if (updateError || !updated) {
      throw new Error(updateError?.message || `Failed to save episode ${number} validator failure`)
    }

    return {
      passed: false,
      skipped: false,
      storyId,
      episodeNumber: number,
      report,
      story: updated,
    }
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${VALIDATOR_PROMPT}

Series-specific validation:
- This is Episode ${number} of ${episode.series_total_episodes}.
- Non-final series episodes must end on a specific continuation hook.
- Final series episodes must close the series arc and must not tease a next episode.

SCRIPT:
${script}`,
    }],
  })

  const report = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!report) throw new Error(`Episode ${number} validator returned an empty report`)

  const passed = /VALIDATOR RESULT:\s*PASS/i.test(report)
  const validatedDescription = passed ? normalizeHeaderValue(extractHeader(script, 'DESCRIPTION')) : ''
  const passedAt = passed ? nowIso() : null

  const { data: updated, error: updateError } = await supabase
    .from('stories')
    .update({
      validator_result: passed ? 'PASS' : 'FAIL',
      validator_report: report,
      validator_passed_at: passedAt,
      status: passed ? 'validator_passed' : 'validator_failed',
      ...(passed && validatedDescription ? { description: validatedDescription } : {}),
    })
    .eq('id', storyId)
    .select('id,title,status,description,validator_result,validator_report,validator_passed_at')
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message || `Failed to save episode ${number} validator result`)
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'series-episode-script-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId,
    storyTitle: episode.title,
    metadata: { is_v2: true, production_job_id: job.id, series_id: episode.series_id, episode_number: number },
  }).catch(() => {})

  return {
    passed,
    skipped: false,
    storyId,
    episodeNumber: number,
    report,
    story: updated,
  }
}

async function validateSeriesPackageWithAi(episodes: any[], metadataIssues: string[], model: string, job: ProductionJob) {
  if (metadataIssues.length > 0) {
    return {
      pass: false,
      issues: metadataIssues,
      confidence: 1,
      summary: 'Series metadata failed deterministic validation.',
      rawReport: null,
    }
  }

  const packageBrief = episodes.map((episode: any, index: number) => {
    const script = String(episode.script || '')
    return {
      episodeNumber: episodeNumber(episode, index + 1),
      title: episode.title,
      seriesIsFinale: Boolean(episode.series_is_finale),
      description: extractHeader(script, 'DESCRIPTION') || episode.description || '',
      belleIntro: extractBelleSection(script, 'intro'),
      belleOutro: extractBelleSection(script, 'outro'),
      scriptTail: scriptTail(script, 1800),
    }
  })

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1600,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `You are validating an Endless Tales 3-episode series package before audio production.

Return JSON only. Do not include markdown.

Required JSON shape:
{
  "pass": true | false,
  "issues": ["specific issue"],
  "confidence": 0.0,
  "summary": "brief package assessment"
}

Validation rules:
- All episodes must clearly belong to one continuous series arc.
- Episode 1 and Episode 2 must end with intentional continuation hooks, not standalone closure.
- Episode 3 must close the series arc and must not tease Episode 4.
- No episode should be treated as a standalone story.
- Metadata must be consistent with episode order and finale status.
- Fail if the finale leaves the main series question unresolved.

SERIES PACKAGE:
${JSON.stringify(packageBrief, null, 2)}`,
    }],
  })

  const rawReport = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  if (!rawReport) throw new Error('Series package validator returned an empty report')

  const parsed = parseJsonObject(rawReport)
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : []
  const report = {
    pass: parsed.pass === true,
    issues,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence || 0),
    summary: String(parsed.summary || ''),
    rawReport,
  }

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'series-package-validator',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: episodes[0]?.id || undefined,
    storyTitle: episodes[0]?.series_name || episodes[0]?.title || 'Series package',
    metadata: { is_v2: true, production_job_id: job.id, series_id: episodes[0]?.series_id },
  }).catch(() => {})

  return report
}

async function scoreValidateSeriesPackage(job: ProductionJob, model: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job is missing series_id')

  const episodes = await loadSeriesEpisodes(String(seriesId))
  if (!episodes.length) throw new Error('No child episodes found for series package')

  const metadataIssues = validateSeriesMetadata(episodes, String(seriesId))
  const existingValidation = state.seriesValidation && typeof state.seriesValidation === 'object'
    ? state.seriesValidation
    : {}
  const validatedEpisodes = Array.isArray(existingValidation.validatedEpisodes)
    ? [...existingValidation.validatedEpisodes]
    : []
  const failedEpisodes = Array.isArray(existingValidation.failedEpisodes)
    ? [...existingValidation.failedEpisodes]
    : []

  const nextEpisode = episodes.find((episode: any) =>
    !(episode.status === 'validator_passed' || episode.validator_result === 'PASS')
      && !failedEpisodes.some((failed: any) => String(failed.storyId) === String(episode.id))
  )

  if (nextEpisode) {
    const result = await validateSeriesEpisodeScript(nextEpisode, model, job)
    const episodeSummary = {
      storyId: result.storyId,
      title: result.story.title,
      episodeNumber: result.episodeNumber,
      validatorResult: result.passed ? 'PASS' : 'FAIL',
      skipped: result.skipped,
      report: result.report,
      validatedAt: nowIso(),
    }

    const nextValidatedEpisodes = result.passed
      ? [
          ...validatedEpisodes.filter((episode: any) => String(episode.storyId) !== result.storyId),
          episodeSummary,
        ]
      : validatedEpisodes
    const nextFailedEpisodes = result.passed
      ? failedEpisodes
      : [
          ...failedEpisodes.filter((episode: any) => String(episode.storyId) !== result.storyId),
          episodeSummary,
        ]

    const nextUnvalidated = episodes.find((episode: any) =>
      String(episode.id) !== result.storyId
        && !(episode.status === 'validator_passed' || episode.validator_result === 'PASS')
        && !nextValidatedEpisodes.some((validated: any) => String(validated.storyId) === String(episode.id))
    )

    return {
      passed: false,
      failed: !result.passed,
      complete: false,
      episodeResult: episodeSummary,
      seriesId: String(seriesId),
      episodes,
      nextStep: NEXT_STEP_AFTER_SERIES_SCRIPTS,
      state: {
        ...state,
        seriesId: String(seriesId),
        seriesValidation: {
          episodeCount: episodes.length,
          validatedEpisodes: nextValidatedEpisodes,
          failedEpisodes: nextFailedEpisodes,
          nextEpisodeNumber: nextUnvalidated ? episodeNumber(nextUnvalidated, 0) : null,
          metadataIssues,
          packageReport: existingValidation.packageReport || null,
        },
      },
    }
  }

  const refreshedEpisodes = await loadSeriesEpisodes(String(seriesId))
  const allEpisodesPassed = refreshedEpisodes.every((episode: any) =>
    episode.status === 'validator_passed' || episode.validator_result === 'PASS'
  )
  if (!allEpisodesPassed) {
    throw new Error('Series validation state is inconsistent: no next episode found, but not all episodes passed')
  }

  const packageReport = existingValidation.packageReport?.pass === true
    ? existingValidation.packageReport
    : await validateSeriesPackageWithAi(refreshedEpisodes, metadataIssues, model, job)

  const failed = packageReport.pass !== true
  return {
    passed: !failed,
    failed,
    complete: !failed,
    episodeResult: null,
    seriesId: String(seriesId),
    episodes: refreshedEpisodes,
    nextStep: failed ? NEXT_STEP_AFTER_SERIES_SCRIPTS : NEXT_STEP_AFTER_SERIES_VALIDATION,
    packageReport,
    state: {
      ...state,
      seriesId: String(seriesId),
      seriesValidation: {
        episodeCount: refreshedEpisodes.length,
        validatedEpisodes: refreshedEpisodes.map((episode: any) => ({
          storyId: episode.id,
          title: episode.title,
          episodeNumber: episodeNumber(episode, 0),
          validatorResult: 'PASS',
          skipped: true,
          report: episode.validator_report || '',
        })),
        failedEpisodes,
        nextEpisodeNumber: null,
        metadataIssues,
        packageReport,
      },
    },
  }
}

async function runSeriesVoicePreflight(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job is missing series_id')
  if (state.seriesValidation?.packageReport?.pass !== true) {
    throw new Error('Series package validation must pass before series_voice_preflight')
  }

  const episodes = await loadSeriesEpisodes(String(seriesId))
  if (!episodes.length) throw new Error('No child episodes found for series package')

  const previous = state.seriesVoicePreflight && typeof state.seriesVoicePreflight === 'object'
    ? state.seriesVoicePreflight
    : {}
  const checkedEpisodes = Array.isArray(previous.checkedEpisodes)
    ? [...previous.checkedEpisodes]
    : []
  const failedEpisodes = Array.isArray(previous.failedEpisodes)
    ? [...previous.failedEpisodes]
    : []
  const reportsByEpisode = previous.reportsByEpisode && typeof previous.reportsByEpisode === 'object'
    ? { ...previous.reportsByEpisode }
    : {}
  const narratorsByEpisode = previous.narratorsByEpisode && typeof previous.narratorsByEpisode === 'object'
    ? { ...previous.narratorsByEpisode }
    : {}

  const nextEpisode = episodes.find((episode: any) =>
    !checkedEpisodes.some((checked: any) => String(checked.storyId) === String(episode.id))
      && !failedEpisodes.some((failed: any) => String(failed.storyId) === String(episode.id))
  )

  // All episodes checked — validate cross-episode narrator consistency before returning success
  if (!nextEpisode) {
    const narratorIssues: string[] = []
    // Only look at numeric episode-number keys (not the "_name" sibling keys)
    const allResolvedIds = Object.entries(narratorsByEpisode)
      .filter(([key]) => !key.endsWith('_name'))
      .map(([, v]) => v)
      .filter((v: any) => typeof v === 'string' && (v as string).length > 0) as string[]
    if (allResolvedIds.length > 0) {
      const uniqueIds = new Set(allResolvedIds)
      if (uniqueIds.size > 1) {
        const issuesByEp: Record<string, string> = {}
        for (const [epKey, voiceId] of Object.entries(narratorsByEpisode)) {
          if (epKey.endsWith('_name')) continue   // skip companion name entries
          const ep = episodes.find((e: any) => String(episodeNumber(e, 0)) === epKey || String(e.id) === epKey)
          if (ep && voiceId) {
            const voiceName = (narratorsByEpisode as any)[`${epKey}_name`] || String(voiceId).substring(0, 8)
            issuesByEp[epKey] = voiceName
          }
        }
        const epList = Object.entries(issuesByEp)
          .map(([ep, name]) => `EP${ep}: ${name}`)
          .join(', ')
        narratorIssues.push(`Series episodes use different narrators: ${epList}`)
      }
    }

    const hasFailed = narratorIssues.length > 0
    return {
      passed: !hasFailed,
      failed: hasFailed,
      complete: true,
      seriesId: String(seriesId),
      episodeResult: null,
      report: hasFailed
        ? { success: false, preflightOnly: true, blockingReasons: narratorIssues, narratorIssues }
        : null,
      narratorIssues,
      nextStep: hasFailed ? NEXT_STEP_AFTER_SERIES_VALIDATION : NEXT_STEP_AFTER_SERIES_PREFLIGHT,
      state: {
        ...state,
        seriesId: String(seriesId),
        seriesVoicePreflight: {
          episodeCount: episodes.length,
          checkedEpisodes,
          failedEpisodes,
          nextEpisodeNumber: null,
          reportsByEpisode,
          narratorsByEpisode,
          narratorIssues: hasFailed ? narratorIssues : [],
        },
      },
    }
  }

  const storyId = String(nextEpisode.id)
  const number = episodeNumber(nextEpisode, 0)
  const epLabel = `EP${number}`

  // ── Narrator validation — before generate-voices call ─────────────────────
  const allVoices = await fetchAllNarratorVoices()
  const narratorResult = validateNarratorAssignmentSync(nextEpisode, allVoices, epLabel)

  if (!narratorResult.passed) {
    const failedEpisodeEntry = {
      storyId,
      title: nextEpisode.title,
      episodeNumber: number,
      passed: false,
      narratorIssues: narratorResult.narratorIssues,
      checkedAt: nowIso(),
      report: {
        success: false,
        preflightOnly: true,
        blockingReasons: narratorResult.narratorIssues,
        narratorIssues: narratorResult.narratorIssues,
      },
    }
    const nextFailedEpisodes = [
      ...failedEpisodes.filter((episode: any) => String(episode.storyId) !== storyId),
      failedEpisodeEntry,
    ]
    return {
      passed: false,
      failed: true,
      complete: false,
      seriesId: String(seriesId),
      episodeResult: failedEpisodeEntry as any,
      report: failedEpisodeEntry.report,
      narratorIssues: narratorResult.narratorIssues,
      nextStep: NEXT_STEP_AFTER_SERIES_VALIDATION,
      state: {
        ...state,
        seriesId: String(seriesId),
        seriesVoicePreflight: {
          episodeCount: episodes.length,
          checkedEpisodes,
          failedEpisodes: nextFailedEpisodes,
          nextEpisodeNumber: number,
          reportsByEpisode,
          narratorsByEpisode,
          narratorIssues: narratorResult.narratorIssues,
        },
      },
    }
  }

  // ── Generate-voices preflight ──────────────────────────────────────────────
  const endpoint = `${origin}/api/admin/generate-voices`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, preflightOnly: true }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices') as VoicePreflightResult
  const passed = response.ok && report.success === true

  const episodeSummary: any = {
    storyId,
    title: nextEpisode.title,
    episodeNumber: number,
    passed,
    narratorVoiceId: narratorResult.resolvedVoiceId,
    narratorVoiceName: narratorResult.resolvedVoiceName,
    checkedAt: nowIso(),
  }
  const nextReportsByEpisode = {
    ...reportsByEpisode,
    [number || storyId]: report,
  }
  const nextNarratorsByEpisode = {
    ...narratorsByEpisode,
    [number]: narratorResult.resolvedVoiceId,
    [`${number}_name`]: narratorResult.resolvedVoiceName,
  }
  const nextCheckedEpisodes = passed
    ? [
        ...checkedEpisodes.filter((episode: any) => String(episode.storyId) !== storyId),
        episodeSummary,
      ]
    : checkedEpisodes
  const nextFailedEpisodes = passed
    ? failedEpisodes
    : [
        ...failedEpisodes.filter((episode: any) => String(episode.storyId) !== storyId),
        {
          ...episodeSummary,
          report,
        },
      ]
  const nextUnchecked = episodes.find((episode: any) =>
    String(episode.id) !== storyId
      && !nextCheckedEpisodes.some((checked: any) => String(checked.storyId) === String(episode.id))
      && !nextFailedEpisodes.some((failed: any) => String(failed.storyId) === String(episode.id))
  )
  const complete = passed && nextCheckedEpisodes.length >= episodes.length

  return {
    passed,
    failed: !passed,
    complete,
    seriesId: String(seriesId),
    episodeResult: episodeSummary,
    report,
    narratorIssues: [] as string[],
    nextStep: complete ? NEXT_STEP_AFTER_SERIES_PREFLIGHT : NEXT_STEP_AFTER_SERIES_VALIDATION,
    state: {
      ...state,
      seriesId: String(seriesId),
      seriesVoicePreflight: {
        episodeCount: episodes.length,
        checkedEpisodes: nextCheckedEpisodes,
        failedEpisodes: nextFailedEpisodes,
        nextEpisodeNumber: nextUnchecked ? episodeNumber(nextUnchecked, 0) : null,
        reportsByEpisode: nextReportsByEpisode,
        narratorsByEpisode: nextNarratorsByEpisode,
        narratorIssues: [],
      },
    },
  }
}

async function runSeriesVoiceSegment(job: ProductionJob, origin: string): Promise<SeriesVoiceGenerationResult> {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job is missing series_id')
  if (state.seriesVoicePreflight?.failedEpisodes?.length > 0) {
    throw new Error('Series voice preflight has failed episodes')
  }

  const episodes = await loadSeriesEpisodes(String(seriesId))
  if (!episodes.length) throw new Error('No child episodes found for series voice generation')

  const preflight = state.seriesVoicePreflight && typeof state.seriesVoicePreflight === 'object'
    ? state.seriesVoicePreflight
    : {}
  const checkedEpisodes = Array.isArray(preflight.checkedEpisodes) ? preflight.checkedEpisodes : []
  if (checkedEpisodes.length < episodes.length) {
    throw new Error('Series voice preflight must pass for every episode before series_generate_voices')
  }

  const previous = state.seriesVoiceGeneration && typeof state.seriesVoiceGeneration === 'object'
    ? state.seriesVoiceGeneration
    : {}
  const progressByEpisode = previous.progressByEpisode && typeof previous.progressByEpisode === 'object'
    ? { ...previous.progressByEpisode }
    : {}

  const currentNumber = Number(previous.currentEpisodeNumber || 0)
  const currentEpisode = episodes.find((episode: any) => {
    const number = episodeNumber(episode, 0)
    const progress = progressByEpisode[number]
    return number === currentNumber && progress?.complete !== true
  }) || episodes.find((episode: any) => {
    const number = episodeNumber(episode, 0)
    const progress = progressByEpisode[number]
    return progress?.complete !== true
  })

  if (!currentEpisode) {
    return {
      complete: true,
      hardFailure: false,
      skippedNonSegment: false,
      storyId: '',
      seriesId: String(seriesId),
      episodeNumber: 0,
      segmentNumber: 0,
      episodeComplete: true,
      allComplete: true,
      report: previous.lastReport || { success: true, skipped: true },
      state: {
        ...state,
        seriesId: String(seriesId),
        seriesVoiceGeneration: {
          ...previous,
          episodeCount: episodes.length,
          currentEpisodeNumber: null,
          progressByEpisode,
          lastUpdatedAt: nowIso(),
        },
      },
    }
  }

  const storyId = String(currentEpisode.id)
  const number = episodeNumber(currentEpisode, 0)
  const episodeKey = String(number)
  const episodeProgress = progressByEpisode[episodeKey] && typeof progressByEpisode[episodeKey] === 'object'
    ? progressByEpisode[episodeKey]
    : {}
  const preflightReport = preflight.reportsByEpisode && typeof preflight.reportsByEpisode === 'object'
    ? preflight.reportsByEpisode[number] || preflight.reportsByEpisode[episodeKey] || null
    : null
  const expectedSegmentCount = Number(
    episodeProgress.expectedSegmentCount
    ?? preflightReport?.estimatedSegmentCount?.total
    ?? 0
  )
  const fallbackSegmentNumber = Number.isInteger(episodeProgress.nextSegmentNumber)
    ? Number(episodeProgress.nextSegmentNumber)
    : firstMissingSegmentNumber(episodeProgress.missingSegments, 0)
  const segmentNumber = Math.max(0, fallbackSegmentNumber)

  const response = await fetch(`${origin}/api/admin/generate-voices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId,
      retryMissingOnly: true,
      segmentNumber,
    }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices')
  const errorText = String(report?.error || '')
  const skippedNonSegment = response.status === 404 && /No parsed script line found/i.test(errorText)
  const previousPresentCount = Number(episodeProgress.presentCount ?? 0)
  const reportPresentCount = Number(report?.presentCount ?? previousPresentCount)
  const skipMadeNoProgress = skippedNonSegment && reportPresentCount <= previousPresentCount
  const previousSkippedNonSegmentCount = Number(episodeProgress.skippedNonSegmentCount || 0)
  const skippedNonSegmentStreak = skipMadeNoProgress
    ? Number(episodeProgress.skippedNonSegmentStreak || 0) + 1
    : 0
  const lastTargetableSegmentNumber = Number(report?.lastTargetableSegmentNumber)
  const requestedPastParsedRange = skippedNonSegment
    && Number.isFinite(lastTargetableSegmentNumber)
    && segmentNumber > lastTargetableSegmentNumber
  const staleSegmentRecognitionFailure = skippedNonSegment
    && (
      (skipMadeNoProgress && previousSkippedNonSegmentCount >= 3)
      || skippedNonSegmentStreak >= 3
      || (requestedPastParsedRange && previousPresentCount === 0)
      || (expectedSegmentCount > 0 && segmentNumber >= expectedSegmentCount && previousPresentCount === 0)
    )
  const segmentRecognitionFailure = staleSegmentRecognitionFailure
    ? [{
        segment: `segment_${segmentNumber.toString().padStart(4, '0')}.mp3`,
        error: 'Series voice generation made repeated no-progress non-story skips. This usually indicates stale progressByEpisode state, a wrong episode segment map, or an out-of-range episode-local segment number.',
        requestedSegmentNumber: segmentNumber,
        episodeNumber: number,
        storyId,
        expectedSegmentCount,
        previousPresentCount,
        reportPresentCount,
        skippedNonSegmentStreak,
        targetableSegmentCount: report?.targetableSegmentCount ?? null,
        firstTargetableSegmentNumber: report?.firstTargetableSegmentNumber ?? null,
        lastTargetableSegmentNumber: report?.lastTargetableSegmentNumber ?? null,
      }]
    : []
  const failures = Array.isArray(report?.failures) ? report.failures : []
  const missingSegments = Array.isArray(report?.missingSegments)
    ? report.missingSegments
    : Array.isArray(report?.inventory?.missingSegments)
      ? report.inventory.missingSegments
      : episodeProgress.missingSegments || []
  const generatedSegments = [
    ...(Array.isArray(episodeProgress.generatedSegments) ? episodeProgress.generatedSegments : []),
    ...(Array.isArray(report?.generatedSegments) ? report.generatedSegments : []),
  ]
  const nextSegmentNumber = skippedNonSegment
    ? segmentNumber + 1
    : missingSegments.length > 0
      ? firstMissingSegmentNumber(missingSegments, segmentNumber + 1)
      : segmentNumber + 1
  const effectiveFailures = [...failures, ...segmentRecognitionFailure]
  const episodeComplete = !skippedNonSegment && response.ok && effectiveFailures.length === 0 && missingSegments.length === 0
  const hardFailure = staleSegmentRecognitionFailure || (!skippedNonSegment && (!response.ok || failures.length > 0))
  const nextEpisodeProgress = {
    storyId,
    title: currentEpisode.title || null,
    episodeNumber: number,
    expectedSegmentCount,
    nextSegmentNumber,
    presentCount: reportPresentCount,
    missingSegments,
    generatedSegments,
    failures: effectiveFailures,
    lastSegmentNumber: segmentNumber,
    lastUpdatedAt: nowIso(),
    lastReport: report,
    skippedNonSegmentCount: Number(episodeProgress.skippedNonSegmentCount || 0) + (skippedNonSegment ? 1 : 0),
    skippedNonSegmentStreak,
    staleSegmentRecognitionFailure,
    complete: episodeComplete || episodeProgress.complete === true,
  }
  const nextProgressByEpisode = {
    ...progressByEpisode,
    [episodeKey]: nextEpisodeProgress,
  }
  const nextEpisode = episodeComplete
    ? episodes.find((episode: any) => {
        const nextNumber = episodeNumber(episode, 0)
        const progress = nextProgressByEpisode[String(nextNumber)]
        return nextNumber !== number && progress?.complete !== true
      })
    : currentEpisode
  const allComplete = episodes.every((episode: any) => {
    const nextNumber = episodeNumber(episode, 0)
    return nextProgressByEpisode[String(nextNumber)]?.complete === true
  })
  const aggregatePresentCount = Object.values(nextProgressByEpisode)
    .reduce((total: number, progress: any) => total + Number(progress?.presentCount || 0), 0)
  const aggregateExpectedSegmentCount = Object.values(nextProgressByEpisode)
    .reduce((total: number, progress: any) => total + Number(progress?.expectedSegmentCount || 0), 0)
  const aggregateFailures = Object.values(nextProgressByEpisode)
    .flatMap((progress: any) => Array.isArray(progress?.failures) ? progress.failures : [])

  return {
    complete: allComplete,
    hardFailure,
    skippedNonSegment,
    storyId,
    seriesId: String(seriesId),
    episodeNumber: number,
    segmentNumber,
    episodeComplete,
    allComplete,
    report,
    state: {
      ...state,
      seriesId: String(seriesId),
      seriesVoiceGeneration: {
        episodeCount: episodes.length,
        currentEpisodeNumber: allComplete ? null : episodeNumber(nextEpisode, number),
        progressByEpisode: nextProgressByEpisode,
        expectedSegmentCount: aggregateExpectedSegmentCount || expectedSegmentCount,
        presentCount: aggregatePresentCount,
        missingSegments,
        nextSegmentNumber,
        failures: aggregateFailures,
        lastEpisodeNumber: number,
        lastStoryId: storyId,
        lastSegmentNumber: segmentNumber,
        lastUpdatedAt: nowIso(),
        lastReport: report,
      },
    },
  }
}

// ── Series post-voice pipeline helpers ─────────────────────────────────────
// Handles: Belle generation → Music → Render for each series episode.
// Each function iterates episodes, skips already-complete ones, and advances
// the state so run-next can be called repeatedly until all episodes are done.

async function runSeriesBelleAssets(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job missing series_id')

  const episodes = await loadSeriesEpisodes(String(seriesId))
  const prev = state.seriesBelleGeneration && typeof state.seriesBelleGeneration === 'object'
    ? state.seriesBelleGeneration : {}
  const doneByEp: Record<string, boolean> = prev.doneByEp || {}

  let processedEp: number | null = null
  let introUrl: string | null = null
  let outroUrl: string | null = null
  let lastError: string | null = null

  for (const ep of episodes) {
    const num = episodeNumber(ep, 0)
    const key = String(num)
    if (doneByEp[key]) continue

    const storyId = String(ep.id)
    const r = await fetch(`${origin}/api/admin/generate-voices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, generateBelleOnly: true }),
    })
    const report = await readJsonOrDiagnostic(r, '/api/admin/generate-voices (Belle)')
    const ok = r.ok && report?.success === true
    doneByEp[key] = ok
    processedEp = num
    introUrl = report?.introUrl || null
    outroUrl = report?.outroUrl || null
    if (!ok) lastError = String(report?.error || `HTTP ${r.status}`)
    break // one episode per call
  }

  const allDone = episodes.every(ep => doneByEp[String(episodeNumber(ep, 0))])
  return {
    allDone,
    processedEp,
    introUrl,
    outroUrl,
    lastError,
    state: { ...state, seriesId: String(seriesId), seriesBelleGeneration: { doneByEp, allDone, lastUpdatedAt: nowIso() } },
  }
}

async function runSeriesMusicGeneration(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job missing series_id')

  const episodes = await loadSeriesEpisodes(String(seriesId))
  const prev = state.seriesMusicGeneration && typeof state.seriesMusicGeneration === 'object'
    ? state.seriesMusicGeneration : {}
  const doneByEp: Record<string, boolean> = prev.doneByEp || {}

  let processedEp: number | null = null
  let musicUrl: string | null = null
  let lastError: string | null = null

  for (const ep of episodes) {
    const num = episodeNumber(ep, 0)
    const key = String(num)
    if (doneByEp[key]) continue

    const storyId = String(ep.id)
    // Fetch story to build music prompt
    const { data: story } = await supabase.from('stories').select('id,title,genre,script,background_music_url').eq('id', storyId).single()
    // Skip if music already generated
    const existingUrl = String(story?.background_music_url || '').trim()
    if (existingUrl && !existingUrl.startsWith('pending:')) {
      doneByEp[key] = true
      processedEp = num
      musicUrl = existingUrl
      break
    }
    const prompt = story?.script ? musicPromptFor(story.script, story.title || '', story.genre || '') : ''
    const r = await fetch(`${origin}/api/asc3/generate-music`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, prompt }),
    })
    const report = await readJsonOrDiagnostic(r, '/api/asc3/generate-music')
    const ok = r.ok && report?.success === true
    doneByEp[key] = ok
    processedEp = num
    musicUrl = report?.url || report?.musicUrl || null
    if (!ok) lastError = String(report?.error || `HTTP ${r.status}`)
    break // one episode per call
  }

  const allDone = episodes.every(ep => doneByEp[String(episodeNumber(ep, 0))])
  return {
    allDone,
    processedEp,
    musicUrl,
    lastError,
    state: { ...state, seriesId: String(seriesId), seriesMusicGeneration: { doneByEp, allDone, lastUpdatedAt: nowIso() } },
  }
}

async function runSeriesRenderFinalMix(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesId = job.series_id || state.seriesId
  if (!seriesId) throw new Error('Series job missing series_id')

  const episodes = await loadSeriesEpisodes(String(seriesId))
  const prev = state.seriesRenderFinalMix && typeof state.seriesRenderFinalMix === 'object'
    ? state.seriesRenderFinalMix : {}
  const doneByEp: Record<string, boolean> = prev.doneByEp || {}

  let processedEp: number | null = null
  let finalMixUrl: string | null = null
  let duration: number | null = null
  let lastError: string | null = null

  for (const ep of episodes) {
    const num = episodeNumber(ep, 0)
    const key = String(num)
    if (doneByEp[key]) continue

    const storyId = String(ep.id)
    // Direct module call — eliminates HTTP hop and Vercel edge network timeout risk (ATL P1-B)
    const report = await runRenderFinalMix(storyId)
    const ok = report?.success === true
    doneByEp[key] = ok
    processedEp = num
    finalMixUrl = String(report?.finalMixUrl || report?.audioUrl || '') || null
    duration = Number(report?.durationMins || 0) || null
    if (!ok) lastError = String(report?.error || 'render failed')
    break // one episode per call
  }

  const allDone = episodes.every(ep => doneByEp[String(episodeNumber(ep, 0))])
  return {
    allDone,
    processedEp,
    finalMixUrl,
    duration,
    lastError,
    state: { ...state, seriesId: String(seriesId), seriesRenderFinalMix: { doneByEp, allDone, lastUpdatedAt: nowIso() } },
  }
}

export async function POST(req: NextRequest) {
  let lockedJob: ProductionJob | null = null
  let activeStage: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    const requestedJobId = String(body.jobId || '').trim()
    const model = String(body.model || 'claude-opus-4-6')

    // Scan for zombie jobs before selecting the next candidate.
    // Zombies are jobs that are status=running, unlocked, and untouched for
    // more than ZOMBIE_STALE_MS.  We mark them failed so they surface in the
    // admin UI and autopilot reports instead of silently blocking the queue.
    // Marked jobs are still resumable via reactivateJob() + run-next.
    const markedZombies = await detectAndMarkZombieJobs(requestedJobId || undefined).catch(() => [])
    if (markedZombies.length > 0) {
      console.warn('[run-next] Zombie guard: marked %d job(s) as failed/zombie_stalled: %s', markedZombies.length, markedZombies.join(', '))
    }

    const candidate = await selectCandidate(requestedJobId)
    if (!candidate) {
      return NextResponse.json({ success: true, message: 'No queued or running production job found', job: null, markedZombies })
    }

    lockedJob = await lockJob(candidate)
    if (!lockedJob) {
      return bad('Production job is already locked', 409, { jobId: candidate.id })
    }

    const step = normalizeStep(lockedJob.current_step)
    activeStage = step
    await recordStageStarted(lockedJob, step)

    if (step === NEXT_STEP_AFTER_SERIES_CREATE) {
      const result = await generateOneSeriesEpisodeScript(lockedJob, model)
      const logs = appendLog(lockedJob, result.generated ? 'Generated one series episode script' : 'All series episode scripts already exist', {
        seriesId: result.seriesId,
        episode: result.episode,
        nextStep: result.nextStep,
      })

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          series_id: result.seriesId,
          status: 'running',
          current_step: result.nextStep,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + (result.generated ? 1 : 0),
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance series episode script job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        seriesId: result.seriesId,
        generatedEpisode: result.episode,
        episodes: result.episodes.map((episode: any) => ({
          storyId: episode.id,
          title: episode.title,
          status: episode.status,
          episodeNumber: episodeNumber(episode, 0),
          hasScript: Boolean(episode.script),
        })),
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_SERIES_SCRIPTS) {
      const result = await scoreValidateSeriesPackage(lockedJob, model)
      const logs = appendLog(lockedJob, result.failed
        ? 'Series package validation failed'
        : result.complete
          ? 'Series package validation passed'
          : 'Validated one series episode script', {
        seriesId: result.seriesId,
        nextStep: result.nextStep,
        episodeResult: result.episodeResult,
        packageReport: result.packageReport || null,
        metadataIssues: result.state.seriesValidation?.metadataIssues || [],
      })

      if (result.failed) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'failed',
            current_step: NEXT_STEP_AFTER_SERIES_SCRIPTS,
            state_json: result.state,
            error_json: {
              step,
              seriesId: result.seriesId,
              episodeResult: result.episodeResult,
              failedEpisodes: result.state.seriesValidation?.failedEpisodes || [],
              metadataIssues: result.state.seriesValidation?.metadataIssues || [],
              packageReport: result.packageReport || null,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save series validation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          seriesId: result.seriesId,
          episodeResult: result.episodeResult,
          failedEpisodes: result.state.seriesValidation?.failedEpisodes || [],
          metadataIssues: result.state.seriesValidation?.metadataIssues || [],
          packageReport: result.packageReport || null,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          series_id: result.seriesId,
          status: 'running',
          current_step: result.nextStep,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance series validation job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        seriesId: result.seriesId,
        episodeResult: result.episodeResult,
        packageReport: result.packageReport || null,
        seriesValidation: result.state.seriesValidation,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_SERIES_VALIDATION) {
      const origin = new URL(req.url).origin
      const result = await runSeriesVoicePreflight(lockedJob, origin)
      const logs = appendLog(lockedJob, result.failed
        ? 'Series voice preflight failed'
        : result.complete
          ? 'Series voice preflight complete'
          : 'Checked one series episode voice preflight', {
        seriesId: result.seriesId,
        nextStep: result.nextStep,
        episodeResult: result.episodeResult,
      })

      if (result.failed) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'failed',
            current_step: NEXT_STEP_AFTER_SERIES_VALIDATION,
            state_json: result.state,
            error_json: {
              step,
              seriesId: result.seriesId,
              episodeResult: result.episodeResult,
              narratorIssues: result.narratorIssues && result.narratorIssues.length > 0 ? result.narratorIssues : undefined,
              preflightReport: result.report,
              failedEpisodes: result.state.seriesVoicePreflight?.failedEpisodes || [],
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save series voice preflight failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          seriesId: result.seriesId,
          episodeResult: result.episodeResult,
          narratorIssues: result.narratorIssues,
          preflightReport: result.report,
          failedEpisodes: result.state.seriesVoicePreflight?.failedEpisodes || [],
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          series_id: result.seriesId,
          status: 'running',
          current_step: result.nextStep,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance series voice preflight job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        seriesId: result.seriesId,
        episodeResult: result.episodeResult,
        seriesVoicePreflight: result.state.seriesVoicePreflight,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_CREATE) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series jobs must use generate_episode_script, not generate_script', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await generateStandaloneScript(lockedJob, model)
      const logs = appendLog(lockedJob, result.generated ? 'Generated standalone script' : 'Reused existing standalone script', {
        storyId: result.storyId,
        storyTitle: result.story.title,
        nextStep: NEXT_STEP_AFTER_STANDALONE_SCRIPT,
      })

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_SCRIPT,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone script job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        story: {
          id: result.story.id,
          title: result.story.title,
          status: result.story.status,
          description: result.story.description,
        },
        generatedScript: result.generated,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_SCRIPT) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series validation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await validateStandaloneScript(lockedJob, model)
      const logs = appendLog(lockedJob, result.passed
        ? (result.skipped ? 'Reused existing standalone validation pass' : 'Validated standalone script')
        : 'Standalone script validation failed', {
        storyId: result.storyId,
        storyTitle: result.story.title,
        validatorResult: result.passed ? 'PASS' : 'FAIL',
        nextStep: result.passed ? NEXT_STEP_AFTER_STANDALONE_VALIDATION : null,
      })

      if (!result.passed) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_SCRIPT,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              validatorResult: 'FAIL',
              validatorReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone validation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          validatorResult: 'FAIL',
          validatorReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_VALIDATION,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone validation job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        validatorResult: 'PASS',
        validatorReport: result.report,
        validationSkipped: result.skipped,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_VALIDATION) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series story resolution validation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await validateStandaloneStoryResolution(lockedJob, model)
      const logs = appendLog(lockedJob, result.passed
        ? (result.skipped ? 'Reused existing standalone story resolution pass' : 'Validated standalone story resolution')
        : 'Standalone story resolution validation failed', {
        storyId: result.storyId,
        nextStep: result.passed ? NEXT_STEP_AFTER_STANDALONE_RESOLUTION : null,
        endingTypeDetected: result.report.endingTypeDetected,
        storyTypeDetected: result.report.storyTypeDetected,
        issueCount: Array.isArray(result.report.issues) ? result.report.issues.length : 0,
      })

      if (!result.passed) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_VALIDATION,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              storyResolutionReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone story resolution failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          storyResolutionReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_RESOLUTION,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone story resolution job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        storyResolutionReport: result.report,
        resolutionSkipped: result.skipped,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_RESOLUTION) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series voice preflight is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandaloneVoicePreflight(lockedJob, origin)
      const blockingReasons = Array.isArray(result.report?.blockingReasons)
        ? result.report.blockingReasons
        : result.report?.error
          ? [String(result.report.error)]
          : []
      const logs = appendLog(lockedJob, result.passed
        ? (result.skipped ? 'Reused existing voice preflight pass' : 'Voice preflight passed')
        : 'Voice preflight failed', {
        storyId: result.storyId,
        nextStep: result.passed ? NEXT_STEP_AFTER_STANDALONE_PREFLIGHT : null,
        blockingReasons,
        estimatedSegmentCount: result.report?.estimatedSegmentCount || null,
      })

      if (!result.passed) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_RESOLUTION,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              narratorIssues: result.narratorIssues && result.narratorIssues.length > 0 ? result.narratorIssues : undefined,
              preflightReport: result.report,
              blockingReasons,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone voice preflight failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          narratorIssues: result.narratorIssues,
          preflightReport: result.report,
          blockingReasons,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_PREFLIGHT,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone voice preflight job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        preflightSkipped: result.skipped,
        preflightReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_PREFLIGHT) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series voice generation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandaloneVoiceSegment(lockedJob, origin)
      const voiceGeneration = result.state.voiceGeneration || {}
      const logs = appendLog(lockedJob, result.complete
        ? 'All standalone voice segments are present'
        : result.skippedNonSegment
          ? 'Skipped non-story segment index'
          : 'Processed one standalone voice segment', {
        storyId: result.storyId,
        segmentNumber: result.segmentNumber,
        nextStep: result.complete ? NEXT_STEP_AFTER_STANDALONE_VOICES : NEXT_STEP_AFTER_STANDALONE_PREFLIGHT,
        nextSegmentNumber: voiceGeneration.nextSegmentNumber,
        presentCount: voiceGeneration.presentCount,
        missingCount: Array.isArray(voiceGeneration.missingSegments) ? voiceGeneration.missingSegments.length : null,
      })

      if (result.hardFailure) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_PREFLIGHT,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              segmentNumber: result.segmentNumber,
              voiceGenerationReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone voice generation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          segmentNumber: result.segmentNumber,
          voiceGenerationReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: result.complete ? NEXT_STEP_AFTER_STANDALONE_VOICES : NEXT_STEP_AFTER_STANDALONE_PREFLIGHT,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + (result.complete ? 1 : 0),
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to save standalone voice generation progress: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        complete: result.complete,
        skippedNonSegment: result.skippedNonSegment,
        segmentNumber: result.segmentNumber,
        voiceGeneration,
        voiceGenerationReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_SERIES_PREFLIGHT) {
      const origin = new URL(req.url).origin
      const result = await runSeriesVoiceSegment(lockedJob, origin)
      const voiceGeneration = result.state.seriesVoiceGeneration || {}
      const logs = appendLog(lockedJob, result.complete
        ? 'All series voice segments are present'
        : result.episodeComplete
          ? 'Completed voice generation for one series episode'
          : result.skippedNonSegment
            ? 'Skipped non-story series segment index'
            : 'Processed one series voice segment', {
        seriesId: result.seriesId,
        storyId: result.storyId || null,
        episodeNumber: result.episodeNumber || null,
        segmentNumber: result.segmentNumber,
        nextStep: result.complete ? NEXT_STEP_AFTER_SERIES_VOICES : NEXT_STEP_AFTER_SERIES_PREFLIGHT,
        currentEpisodeNumber: voiceGeneration.currentEpisodeNumber,
        nextSegmentNumber: voiceGeneration.nextSegmentNumber,
        presentCount: voiceGeneration.presentCount,
        missingCount: Array.isArray(voiceGeneration.missingSegments) ? voiceGeneration.missingSegments.length : null,
      })

      if (result.hardFailure) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            series_id: result.seriesId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_SERIES_PREFLIGHT,
            state_json: result.state,
            error_json: {
              step,
              seriesId: result.seriesId,
              episodeNumber: result.episodeNumber,
              storyId: result.storyId,
              segmentNumber: result.segmentNumber,
              voiceGenerationReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save series voice generation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          seriesId: result.seriesId,
          episodeNumber: result.episodeNumber,
          storyId: result.storyId,
          segmentNumber: result.segmentNumber,
          voiceGenerationReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          series_id: result.seriesId,
          status: 'running',
          current_step: result.complete ? NEXT_STEP_AFTER_SERIES_VOICES : NEXT_STEP_AFTER_SERIES_PREFLIGHT,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + (result.complete ? 1 : 0),
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to save series voice generation progress: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        seriesId: result.seriesId,
        episodeNumber: result.episodeNumber,
        storyId: result.storyId,
        complete: result.complete,
        episodeComplete: result.episodeComplete,
        skippedNonSegment: result.skippedNonSegment,
        segmentNumber: result.segmentNumber,
        voiceGeneration,
        voiceGenerationReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_VOICES) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series Belle asset generation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandaloneBelleAssets(lockedJob, origin)
      const logs = appendLog(lockedJob, result.success
        ? 'Generated standalone Belle intro/outro assets'
        : 'Standalone Belle asset generation failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_BELLE : null,
        introUrl: result.introUrl || null,
        outroUrl: result.outroUrl || null,
      })

      if (!result.success) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              belleAssetsReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone Belle asset generation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          belleAssetsReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_BELLE,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone Belle asset job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        introUrl: result.introUrl,
        outroUrl: result.outroUrl,
        belleAssetsReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_BELLE) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series Belle asset validation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await validateStandaloneBelleAssets(lockedJob)
      const logs = appendLog(lockedJob, result.success
        ? 'Validated standalone Belle intro/outro assets'
        : 'Standalone Belle asset validation failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION : null,
        issueCount: result.report.issues.length,
      })

      if (!result.success) {
        // Check if this is a text-only issue that can be repaired (vs. audio/transcript QC failures)
        const issues = Array.isArray(result.report.issues) ? result.report.issues : []
        const isTextOnlyFailure = issues.length > 0 && issues.every(issue =>
          /forbidden|promotional|must include|must say|must be|incomplete|appear|missing|too|weak|atmospheric/i.test(issue)
        )

        if (isTextOnlyFailure) {
          // Route to repair instead of failing
          const repairState = {
            ...result.state,
            belleAssetValidationFailed: true,
            belleAssetFailedReport: result.report,
          }
          const repairLogs = appendLog({ ...lockedJob, logs, current_step: step }, 'Queued automatic Belle asset text repair', {
            storyId: result.storyId,
            nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
            issueCount: issues.length,
          })
          const { data: repairJob, error: repairUpdateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'running',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
              state_json: repairState,
              error_json: null,
              logs: repairLogs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (repairUpdateError) throw new Error(`Failed to queue standalone Belle asset repair: ${repairUpdateError.message}`)

          return NextResponse.json({
            success: true,
            jobId: repairJob.id,
            currentStep: step,
            nextStep: repairJob.current_step,
            storyId: result.storyId,
            belleAssetValidationReport: result.report,
            repairQueued: true,
            logs: repairLogs,
          })
        }

        // Audio/transcript QC failures cannot be automatically repaired
        const storyAudioBase = `asc3/${result.storyId}`
        const introAssetPaths = (result.report.introAssets || []).map((f: string) => `${storyAudioBase}/${f}`)
        const outroAssetPaths = (result.report.outroAssets || []).map((f: string) => `${storyAudioBase}/${f}`)
        const issuesByField = {
          intro: (result.report.issues || []).filter((i: string) => /\bintro\b/i.test(i)),
          outro: (result.report.issues || []).filter((i: string) => /\boutro\b/i.test(i)),
          asset: (result.report.issues || []).filter((i: string) => /asset|missing|file/i.test(i)),
        }
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              belleAssetValidationReport: result.report,
              // Actionable context for diagnosis
              assetPaths: { intro: introAssetPaths, outro: outroAssetPaths },
              expectedIntroText: result.report.introText ?? null,
              expectedOutroText: result.report.outroText ?? null,
              actualTranscript: null,  // transcript QC not run at this step; null = not applicable
              diffSummary: result.report.issues?.join('; ') ?? null,
              issuesByField,
              recommendedAction: issuesByField.intro.length > 0 || issuesByField.outro.length > 0
                ? 'Text-rule violation: route to repair_belle_quality to rewrite the offending Belle line(s).'
                : 'Asset missing or unknown issue: regenerate Belle assets via generate_belle_assets.',
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone Belle asset validation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          belleAssetValidationReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone Belle validation job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        belleAssetValidationReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series Belle quality validation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await validateStandaloneBelleQuality(lockedJob, model)
      const logs = appendLog(lockedJob, result.success
        ? (result.skipped ? 'Reused existing standalone Belle quality pass' : 'Validated standalone Belle intro/outro quality')
        : 'Standalone Belle quality validation failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY : null,
        introScore: result.report.introScore,
        outroScore: result.report.outroScore,
        issueCount: Array.isArray(result.report.issues) ? result.report.issues.length : 0,
      })

      if (!result.success) {
        const repairAttempts = Number(result.state?.belleQualityRepair?.attempts || 0)
        if (repairAttempts < 1) {
          const repairState = {
            ...result.state,
            belleQualityFailedReport: result.report,
          }
          const repairLogs = appendLog({ ...lockedJob, logs, current_step: step }, 'Queued automatic Belle quality repair', {
            storyId: result.storyId,
            nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
            introScore: result.report.introScore,
            outroScore: result.report.outroScore,
            issueCount: Array.isArray(result.report.issues) ? result.report.issues.length : 0,
          })
          const { data: repairJob, error: repairUpdateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'running',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
              state_json: repairState,
              error_json: null,
              logs: repairLogs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (repairUpdateError) throw new Error(`Failed to queue standalone Belle quality repair: ${repairUpdateError.message}`)

          return NextResponse.json({
            success: true,
            jobId: repairJob.id,
            currentStep: step,
            nextStep: repairJob.current_step,
            storyId: result.storyId,
            belleQualityValidationReport: result.report,
            repairQueued: true,
            logs: repairLogs,
          })
        }

        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              belleQualityValidationReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone Belle quality validation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          belleQualityValidationReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone Belle quality job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        belleQualityValidationReport: result.report,
        qualitySkipped: result.skipped,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series Belle quality repair is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      try {
        const result = await repairStandaloneBelleQuality(lockedJob, model)
        await recordProductionLearningEvent(supabase, {
          job_id: lockedJob.id,
          story_id: result.storyId,
          series_id: lockedJob.series_id,
          series_title: lockedJob.state_json?.seriesTitle || null,
          episode_title: lockedJob.state_json?.episodeTitle || null,
          stage: step,
          failure_type: 'belle_quality',
          root_cause: 'Belle intro/outro quality validation failed but the bounded repair path produced compliant replacement copy.',
          fix_applied: [
            result.report.repairedIntro ? 'Repaired Belle intro' : '',
            result.report.repairedOutro ? 'Repaired Belle outro' : '',
          ].filter(Boolean).join('; '),
          fix_type: 'belle_copy_repair',
          prevention_rule: 'review:belle_intro_outro_quality',
          reusable: true,
          confidence: 0.8,
        })
        const logs = appendLog(lockedJob, 'Repaired standalone Belle quality text', {
          storyId: result.storyId,
          nextStep: NEXT_STEP_AFTER_STANDALONE_VOICES,
          repairedIntro: result.report.repairedIntro,
          repairedOutro: result.report.repairedOutro,
          removedAssetCount: result.report.removedAssets.length,
        })

        const { data: updatedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'running',
            current_step: NEXT_STEP_AFTER_STANDALONE_VOICES,
            step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
            state_json: result.state,
            error_json: null,
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to advance standalone Belle repair job: ${updateError.message}`)

        return NextResponse.json({
          success: true,
          jobId: updatedJob.id,
          currentStep: step,
          nextStep: updatedJob.current_step,
          storyId: result.storyId,
          belleQualityRepairReport: result.report,
          logs,
        })
      } catch (err) {
        const state = lockedJob.state_json && typeof lockedJob.state_json === 'object' ? lockedJob.state_json : {}
        const storyId = lockedJob.story_id || state.storyId
        const repairAttempts = Number((state.belleQualityRepair as Record<string, unknown>)?.attempts ?? 0)
        const isAssetRepair = state.belleAssetValidationFailed === true
        const relevantReport = isAssetRepair
          ? (state.belleAssetFailedReport || state.belleQualityFailedReport || null)
          : (state.belleQualityFailedReport || state.belleQualityValidation || null)
        const storyAudioBase = storyId ? `asc3/${storyId}` : null
        const introAssets = (relevantReport as Record<string, unknown>)?.introAssets
        const outroAssets = (relevantReport as Record<string, unknown>)?.outroAssets
        const logs = appendLog(lockedJob, 'Standalone Belle quality repair failed', {
          storyId: storyId ? String(storyId) : null,
          nextStep: null,
          error: err instanceof Error ? err.message : String(err),
        })
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
            error_json: {
              step,
              jobId: lockedJob.id,
              storyId: storyId ? String(storyId) : null,
              episodeId: lockedJob.series_id ? `${lockedJob.series_id}:ep${lockedJob.state_json?.episodeNumber ?? '?'}` : null,
              error: err instanceof Error ? err.message : String(err),
              repairType: isAssetRepair ? 'asset_text_rule' : 'quality_validation',
              repairAttemptCount: repairAttempts,
              // Asset context for debugging
              assetPaths: {
                intro: Array.isArray(introAssets) ? (introAssets as string[]).map(f => `${storyAudioBase}/${f}`) : [],
                outro: Array.isArray(outroAssets) ? (outroAssets as string[]).map(f => `${storyAudioBase}/${f}`) : [],
              },
              expectedIntroText: (relevantReport as Record<string, unknown>)?.introText ?? null,
              expectedOutroText: (relevantReport as Record<string, unknown>)?.outroText ?? null,
              // Note: transcript QC not run at this step; actual transcripts require manual audio inspection
              actualTranscript: null,
              diffSummary: Array.isArray((relevantReport as Record<string, unknown>)?.issues)
                ? ((relevantReport as Record<string, unknown>).issues as string[]).join('; ')
                : (err instanceof Error ? err.message : String(err)),
              nextRecommendedAction: repairAttempts >= 2
                ? 'Repair limit reached. Manually fix the Belle intro text in the script, delete stale intro audio, and reset job to generate_belle_assets.'
                : 'Increase repair attempt budget or manually write correct intro text and reset to generate_belle_assets.',
              belleQualityFailedReport: relevantReport,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone Belle repair failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: storyId ? String(storyId) : null,
          error: err instanceof Error ? err.message : String(err),
          logs,
        }, { status: 422 })
      }
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series music generation is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandaloneMusicGeneration(lockedJob, origin)
      const logs = appendLog(lockedJob, result.success
        ? (result.skippedExisting ? 'Reused existing story-specific music' : 'Generated story-specific music')
        : 'Story-specific music generation failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_MUSIC : null,
        backgroundMusicUrl: result.backgroundMusicUrl || null,
        skippedExisting: result.skippedExisting,
      })

      if (!result.success) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              musicPrompt: result.prompt,
              musicGenerationReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone music generation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          musicPrompt: result.prompt,
          musicGenerationReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_MUSIC,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone music generation job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        backgroundMusicUrl: result.backgroundMusicUrl,
        skippedExisting: result.skippedExisting,
        musicPrompt: result.prompt,
        musicGenerationReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_MUSIC) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series final mix rendering is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandaloneRenderFinalMix(lockedJob, origin)
      const logs = appendLog(lockedJob, result.success
        ? (result.skippedExisting ? 'Reused existing final mix outputs' : 'Rendered final mix')
        : 'Final mix render failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_RENDER : null,
        finalAudioUrl: result.finalAudioUrl || null,
        storyBodyUrl: result.storyBodyUrl || null,
        durationSecs: result.durationSecs,
        skippedExisting: result.skippedExisting,
      })

      if (!result.success) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_MUSIC,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              renderFinalMixReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone render failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          renderFinalMixReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_RENDER,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone render job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        finalAudioUrl: result.finalAudioUrl,
        storyBodyUrl: result.storyBodyUrl,
        durationSecs: result.durationSecs,
        skippedExisting: result.skippedExisting,
        renderFinalMixReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_RENDER) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type === 'series') {
        const origin = new URL(req.url).origin
        const result = await runSeriesPackageCompletion(lockedJob, origin)
        const logs = appendLog(lockedJob, result.success ? 'Completed series story packages' : 'Series story package completion failed', {
          seriesId: result.seriesId || lockedJob.series_id,
          processedEpisodes: result.processedEpisodes,
          failedEpisode: result.success ? undefined : result.episode,
          reason: result.success ? undefined : result.reason,
          nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_PACKAGE : null,
        })

        if (!result.success) {
          const { data: failedJob, error: updateError } = await supabase
            .from('production_jobs')
            .update({
              status: 'failed',
              current_step: NEXT_STEP_AFTER_STANDALONE_RENDER,
              state_json: result.state,
              error_json: {
                step,
                seriesId: result.seriesId || lockedJob.series_id,
                episode: result.episode,
                storyId: result.episode?.storyId,
                reason: result.reason,
                contentIssues: result.contentIssues,
                packageCompletionReport: result.report,
                verification: result.verification,
                at: nowIso(),
              },
              logs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (updateError) throw new Error(`Failed to save series package completion failure: ${updateError.message}`)

          if (lockedJob.queue_item_id) {
            await supabase
              .from('story_queue_items')
              .update({ status: 'failed' })
              .eq('id', lockedJob.queue_item_id)
          }

          return NextResponse.json({
            success: false,
            jobId: failedJob.id,
            currentStep: step,
            status: failedJob.status,
            seriesId: result.seriesId || lockedJob.series_id,
            episode: result.episode,
            storyId: result.episode?.storyId,
            reason: result.reason,
            packageCompletionReport: result.report,
            verification: result.verification,
            logs,
          }, { status: 422 })
        }

        const { data: updatedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'running',
            current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
            step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
            state_json: result.state,
            error_json: null,
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to advance series package completion job: ${updateError.message}`)

        return NextResponse.json({
          success: true,
          jobId: updatedJob.id,
          currentStep: step,
          nextStep: updatedJob.current_step,
          seriesId: result.seriesId || lockedJob.series_id,
          processedEpisodes: result.processedEpisodes,
          seriesCompleteStoryPackage: result.state.seriesCompleteStoryPackage,
          logs,
        })
      }

      if (type !== 'standalone') {
        return bad(`Unsupported story type for complete_story_package: ${type}`, 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const origin = new URL(req.url).origin
      const result = await runStandalonePackageCompletion(lockedJob, origin)
      const logs = appendLog(lockedJob, result.success ? 'Completed story package' : 'Story package completion failed', {
        storyId: result.storyId,
        nextStep: result.success ? NEXT_STEP_AFTER_STANDALONE_PACKAGE : null,
      })

      if (!result.success) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_RENDER,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              packageCompletionReport: result.report,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone package completion failure: ${updateError.message}`)

        if (lockedJob.queue_item_id) {
          await supabase
            .from('story_queue_items')
            .update({ status: 'failed' })
            .eq('id', lockedJob.queue_item_id)
        }

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          packageCompletionReport: result.report,
          logs,
        }, { status: 422 })
      }

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
          step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance standalone package completion job: ${updateError.message}`)

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        storyId: result.storyId,
        packageCompletionReport: result.report,
        logs,
      })
    }

    if (step === NEXT_STEP_AFTER_STANDALONE_PACKAGE) {
      const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
      const queueItem = input.queueItem || {}
      const type = storyTypeFor(lockedJob, queueItem)

      if (type !== 'standalone') {
        return bad('Series ready-for-review finalization is not implemented in this run-next slice', 422, {
          jobId: lockedJob.id,
          currentStep: lockedJob.current_step,
        })
      }

      const result = await verifyStandaloneReadyForReview(lockedJob)
      const logs = appendLog(lockedJob, result.success ? 'Story is ready for review' : 'Ready-for-review verification failed', {
        storyId: result.storyId,
        missingFields: result.missingFields,
      })

      if (!result.success) {
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
              missingFields: result.missingFields,
              contentIssues: result.contentIssues,
              at: nowIso(),
            },
            logs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save ready-for-review verification failure: ${updateError.message}`)

        if (lockedJob.queue_item_id) {
          await supabase
            .from('story_queue_items')
            .update({ status: 'failed' })
            .eq('id', lockedJob.queue_item_id)
        }

        return NextResponse.json({
          success: false,
          jobId: failedJob.id,
          currentStep: step,
          status: failedJob.status,
          storyId: result.storyId,
          missingFields: result.missingFields,
          logs,
        }, { status: 422 })
      }

      const completedAt = nowIso()
      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          story_id: result.storyId,
          status: 'complete',
          current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
          state_json: result.state,
          error_json: null,
          logs,
          completed_at: completedAt,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
          .select('*')
          .single()

      if (updateError) throw new Error(`Failed to complete production job: ${updateError.message}`)

      if (lockedJob.queue_item_id) {
        await supabase
          .from('story_queue_items')
          .update({ status: 'complete' })
          .eq('id', lockedJob.queue_item_id)
      }

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        status: updatedJob.status,
        storyId: result.storyId,
        completedAt,
        readyForReview: result.state.readyForReview,
        logs,
      })
    }

    // ── Series Belle → Music → Render steps ────────────────────────────────
    if (step === NEXT_STEP_AFTER_SERIES_VOICES) {
      const origin = new URL(req.url).origin
      const result = await runSeriesBelleAssets(lockedJob, origin)
      const nextStep = result.allDone ? NEXT_STEP_AFTER_SERIES_BELLE : NEXT_STEP_AFTER_SERIES_VOICES
      const logs = appendLog(lockedJob,
        result.allDone ? 'Series Belle assets complete for all episodes' : `Belle generated for Ep${result.processedEp}`,
        { processedEp: result.processedEp, introUrl: result.introUrl, outroUrl: result.outroUrl, allDone: result.allDone, error: result.lastError || undefined })
      const { data: updatedJob, error: updateError } = await supabase.from('production_jobs')
        .update({ status: 'running', current_step: nextStep, state_json: result.state, error_json: null, logs, locked_at: null, locked_by: null })
        .eq('id', lockedJob.id).select('*').single()
      if (updateError) throw new Error(`Failed to save series Belle state: ${updateError.message}`)
      return NextResponse.json({ success: !result.lastError, jobId: updatedJob.id, currentStep: step, nextStep: updatedJob.current_step, processedEp: result.processedEp, allDone: result.allDone, introUrl: result.introUrl, outroUrl: result.outroUrl, error: result.lastError || undefined, logs })
    }

    if (step === NEXT_STEP_AFTER_SERIES_BELLE) {
      const origin = new URL(req.url).origin
      const result = await runSeriesMusicGeneration(lockedJob, origin)
      const nextStep = result.allDone ? NEXT_STEP_AFTER_SERIES_MUSIC : NEXT_STEP_AFTER_SERIES_BELLE
      const logs = appendLog(lockedJob,
        result.allDone ? 'Series music complete for all episodes' : `Music generated for Ep${result.processedEp}`,
        { processedEp: result.processedEp, musicUrl: result.musicUrl, allDone: result.allDone, error: result.lastError || undefined })
      const { data: updatedJob, error: updateError } = await supabase.from('production_jobs')
        .update({ status: 'running', current_step: nextStep, state_json: result.state, error_json: null, logs, locked_at: null, locked_by: null })
        .eq('id', lockedJob.id).select('*').single()
      if (updateError) throw new Error(`Failed to save series music state: ${updateError.message}`)
      return NextResponse.json({ success: !result.lastError, jobId: updatedJob.id, currentStep: step, nextStep: updatedJob.current_step, processedEp: result.processedEp, allDone: result.allDone, musicUrl: result.musicUrl, error: result.lastError || undefined, logs })
    }

    if (step === NEXT_STEP_AFTER_SERIES_MUSIC) {
      const origin = new URL(req.url).origin
      const result = await runSeriesRenderFinalMix(lockedJob, origin)
      const nextStep = result.allDone ? NEXT_STEP_AFTER_SERIES_RENDER : NEXT_STEP_AFTER_SERIES_MUSIC
      const logs = appendLog(lockedJob,
        result.allDone ? 'Series final render complete for all episodes' : `Final render done for Ep${result.processedEp}`,
        { processedEp: result.processedEp, finalMixUrl: result.finalMixUrl, durationMins: result.duration, allDone: result.allDone, error: result.lastError || undefined })
      const { data: updatedJob, error: updateError } = await supabase.from('production_jobs')
        .update({ status: result.allDone ? 'running' : 'running', current_step: nextStep, state_json: result.state, error_json: null, logs, locked_at: null, locked_by: null })
        .eq('id', lockedJob.id).select('*').single()
      if (updateError) throw new Error(`Failed to save series render state: ${updateError.message}`)
      return NextResponse.json({ success: !result.lastError, jobId: updatedJob.id, currentStep: step, nextStep: updatedJob.current_step, processedEp: result.processedEp, allDone: result.allDone, finalMixUrl: result.finalMixUrl, durationMins: result.duration, error: result.lastError || undefined, logs })
    }

    if (step !== 'create_story_row') {
      return bad('Only create_story_row, generate_script, validate_script, validate_story_resolution, voice_preflight, generate_voices, generate_belle_assets, validate_belle_assets, validate_belle_quality, repair_belle_quality, generate_music, render_final_mix, complete_story_package, ready_for_review, generate_episode_script, score_validate_package, series_voice_preflight, series_generate_voices, series_generate_belle_assets, series_generate_music, and series_render_final_mix are implemented in this run-next slice', 422, {
        jobId: lockedJob.id,
        currentStep: lockedJob.current_step,
      })
    }

    const input = lockedJob.input_json && typeof lockedJob.input_json === 'object' ? lockedJob.input_json : {}
    const queueItem = input.queueItem || {}
    const type = storyTypeFor(lockedJob, queueItem)

    if (type === 'series') {
      const result = await createSeriesPackage(lockedJob)
      const logs = appendLog(lockedJob, result.created ? 'Created V2 series package' : 'Reused existing V2 series package', {
        seriesId: result.seriesId,
        episodeCount: result.episodes.length,
      })

      const { data: updatedJob, error: updateError } = await supabase
        .from('production_jobs')
        .update({
          series_id: result.seriesId,
          status: 'running',
          current_step: NEXT_STEP_AFTER_SERIES_CREATE,
          step_index: 1,
          total_steps: 9,
          state_json: result.state,
          error_json: null,
          logs,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', lockedJob.id)
        .select('*')
        .single()

      if (updateError) throw new Error(`Failed to advance series production job: ${updateError.message}`)

      if (lockedJob.queue_item_id) {
        await supabase
          .from('story_queue_items')
          .update({
            status: 'in_v2',
          })
          .eq('id', lockedJob.queue_item_id)
      }

      return NextResponse.json({
        success: true,
        jobId: updatedJob.id,
        currentStep: step,
        nextStep: updatedJob.current_step,
        seriesId: result.seriesId,
        episodes: result.episodes.map((episode: any) => ({
          storyId: episode.id,
          title: episode.title,
          status: episode.status,
          episodeNumber: episode.episode_number || episode.series_episode_number,
        })),
        logs,
      })
    }

    const result = await createStoryRow(lockedJob)
    const logs = appendLog(lockedJob, result.created ? 'Created V2 story row' : 'Reused existing story row', {
      storyId: result.storyId,
    })

    const { data: updatedJob, error: updateError } = await supabase
      .from('production_jobs')
      .update({
        story_id: result.storyId,
        status: 'running',
        current_step: NEXT_STEP_AFTER_CREATE,
        step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
        total_steps: 9,
        state_json: result.state,
        error_json: null,
        logs,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', lockedJob.id)
      .select('*')
      .single()

    if (updateError) throw new Error(`Failed to advance production job: ${updateError.message}`)

    if (lockedJob.queue_item_id) {
      await supabase
        .from('story_queue_items')
        .update({
          status: 'in_v2',
          story_id: result.storyId,
        })
        .eq('id', lockedJob.queue_item_id)
    }

    return NextResponse.json({
      success: true,
      jobId: updatedJob.id,
      currentStep: step,
      nextStep: updatedJob.current_step,
      storyId: result.storyId,
      logs,
    })
  } catch (error) {
    if (lockedJob) {
      const failed = await failJob(lockedJob, error)
      return bad(failed.message, 500, {
        jobId: lockedJob.id,
        currentStep: normalizeStep(lockedJob.current_step),
        logs: failed.logs,
      })
    }

    return bad(error instanceof Error ? error.message : 'Failed to run production job step', 500)
  } finally {
    if (lockedJob) {
      if (activeStage) {
        const latestJob = await loadProductionJobForTiming(lockedJob.id)
        if (latestJob?.status === 'failed') {
          await recordStageFailed(latestJob, activeStage, productionErrorMessage(latestJob))
        } else if (latestJob) {
          await recordStageCompleted(latestJob, activeStage)
        }
      }

      await clearLock(lockedJob.id)
    }
  }
}
