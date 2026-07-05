import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { sanitizeSeriesTitle } from '@/lib/seriesTitle'
import { buildNamePalettePromptBlock } from '@/lib/story/namePalette'
import { recordProductionLearningEvent } from '@/lib/productionLearning'
import { isBelleBVoiceId } from '@/lib/voiceConstants'
import { runRenderFinalMix } from '../../../asc3/render-final-mix/core'
import { buildStructuredError, type StructuredErrorJsonKind } from '@/lib/pipeline-runner/types'
import { classifyTrueState } from '@/lib/pipelineTruth'
import { getPlaybookByKind } from '@/lib/repairPlaybooks'
import { loadActiveMission } from '@/lib/missionContext'

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
const MAX_SERIES_DESCRIPTION_RETRIES = 2
const MAX_SERIES_BELLE_RETRIES = 3
const NARRATIVE_HOOK_FALLBACK_MODEL = 'claude-haiku-4-5'
const NARRATIVE_HOOK_FALLBACK_TIMEOUT_MS = 8000
const VOICE_PREFLIGHT_TIMEOUT_MS = 120_000
const TITLE_MAX_CHARS = 28
const DESCRIPTION_MAX_CHARS = 70
const DESCRIPTION_PAST_TENSE_RE = /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden|lost)\b/i

// ATL-PIPE-008: Classify validate_script failure into canonical kinds.
// isCardCopy=true means the failure came from validateCardCopy() (deterministic).
// isCardCopy=false means the failure came from the AI validator.
// ATL-PIPE-020: Pre-generation segment length validation.
// Finds dialogue lines shorter than SHORT_LINE_MIN_WORDS words.
// Short dialogue lines are prone to Whisper beginning-truncation ("It's open." → "Open.")
// because ElevenLabs produces short audio clips where Whisper's VAD drops opening words.
// This check runs AFTER validate_script passes, preventing short lines from reaching
// generate_voices where they would waste 64 ElevenLabs API calls before failing.
// HAL-SCRIPT-007 is the source-level prevention rule.
const SHORT_LINE_MIN_WORDS = 5

function findShortDialogueLines(script: string): Array<{speaker: string, text: string, wordCount: number}> {
  if (!script) return []
  const results: Array<{speaker: string, text: string, wordCount: number}> = []
  const lines = script.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Match SPEAKER_NAME: dialogue text (speaker is ALL-CAPS with optional spaces/digits)
    const match = trimmed.match(/^([A-Z][A-Z0-9 _]{0,30}):\s*(.+)$/)
    if (!match) continue
    const speaker = match[1].trim()
    // Skip narrators and Belle B — they have different length expectations
    if (/^NARRATOR$|^BELLE\s*B?$|^BELLE$/i.test(speaker)) continue
    const text = match[2].trim()
    // Skip stage directions in parentheses
    if (text.startsWith('(') && text.endsWith(')')) continue
    const wordCount = text.split(/\s+/).filter(Boolean).length
    if (wordCount < SHORT_LINE_MIN_WORDS) {
      results.push({ speaker, text, wordCount })
    }
  }
  return results
}

function classifyValidateScriptFailure(
  report: string,
  isCardCopy = false
): {
  kind: StructuredErrorJsonKind
  isAutonomousRetryable: boolean
  marcRequired: boolean
  recommendedAction: string
} {
  // Card-copy path (deterministic, always retryable)
  if (isCardCopy) {
    const hasBlockedWord = /blocked word|DESCRIPTION_PAST_TENSE|forbidden|past.tense|\blost\b/i.test(report)
    const kind: StructuredErrorJsonKind = hasBlockedWord
      ? 'script_description_blocked_word'
      : 'script_card_copy_format'
    return {
      kind,
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: hasBlockedWord
        ? 'DESCRIPTION uses a forbidden past-tense word. Re-generate with explicit rule: DESCRIPTION must be ≤70 chars, present-tense, active-voice. Blocked words: vanished, was, were, had, found, discovered, left, moved, sealed, signed, forged, buried, hidden.'
        : 'TITLE or DESCRIPTION format violation. Re-generate with card-copy constraints (TITLE ≤5 words / 28 chars; DESCRIPTION ≤70 chars, present tense).',
    }
  }

  // AI validator path: classify from report text
  if (/offscreen|protagonist.*passive|passive.*protagonist|climax.*off.?screen|villain.*already.*dead|solution.*easy|passive.*ending|ending.*offscreen/i.test(report)) {
    return {
      kind: 'script_story_resolution',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'Story resolution failure: climax happens offscreen or protagonist is passive. Re-generate with Difficult Solution Rule reinforced: protagonist must take an active, consequential action at the climax.',
    }
  }

  if (/description.*says|description.*mentions|description.*states|protagonist.*different|description.*mismatch|mismatch.*description|role.*mismatch|character.*role|protagonist.*is a|protagonist.*was a/i.test(report)) {
    return {
      kind: 'script_quality_editorial',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'Editorial mismatch: DESCRIPTION does not match the actual protagonist role or story facts. Re-generate with instruction that DESCRIPTION must accurately reflect who the protagonist is and what they are trying to do.',
    }
  }

  if (/hook|cliffhanger|ending|resolution|narrative|editorial|VALIDATOR RESULT.*FAIL/i.test(report)) {
    return {
      kind: 'script_quality_editorial',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'AI editorial failure. Re-generate with emphasis on: strong hook, accurate DESCRIPTION, active protagonist at climax, satisfying resolution.',
    }
  }

  // Unknown — cannot auto-retry safely
  return {
    kind: 'script_validator_unknown',
    isAutonomousRetryable: false,
    marcRequired: true,
    recommendedAction: 'Validation failed with unrecognised pattern. Marc must inspect the validator report before re-queuing.',
  }
}

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
  locked_by: string | null
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
  tone?: string | null
  pacing?: string | null
  signature?: string | null
  example_line?: string | null
  style_signature_trait?: string | null
  narrator_id?: string | null
  narrator_voice_id?: string | null
  last_used_at?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

type ResolvedNarratorVoice = {
  id: string
  elevenlabsVoiceId: string
  name: string
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

async function markStoryNeedsAttention(storyId: string | null | undefined, reason: string) {
  if (!storyId) return
  const { error } = await supabase
    .from('stories')
    .update({
      needs_attention: true,
      needs_attention_reason: String(reason || 'Production pipeline needs attention.').slice(0, 1000),
      needs_attention_at: nowIso(),
    })
    .eq('id', storyId)

  if (error) console.warn(`Failed to mark story needs_attention ${storyId}: ${error.message}`)
}

async function markStoriesNeedAttention(storyIds: Array<string | null | undefined>, reason: string) {
  const uniqueStoryIds = Array.from(new Set(storyIds.filter(Boolean).map(String)))
  for (const storyId of uniqueStoryIds) {
    await markStoryNeedsAttention(storyId, reason)
  }
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
  next = next.replace(/[,\-:;.!?]+$/g, '').trim()
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

function belleSectionMarkers(kind: 'intro' | 'outro') {
  return kind === 'intro' ? ['BELLE B ANNOUNCEMENT', 'BELLE B INTRO'] : ['BELLE B OUTRO']
}

function extractBelleSection(script: string, kind: 'intro' | 'outro') {
  const markers = belleSectionMarkers(kind)
  const markerIndex = markers
    .map(marker => script.search(new RegExp(`^${marker}\\s*$`, 'im')))
    .find(index => index >= 0) ?? -1
  if (markerIndex < 0) return ''
  const afterMarker = script.slice(markerIndex)
  const match = afterMarker.match(/^BELLE B:\s*(.+)$/im)
  return normalizeHeaderValue(match?.[1] || '')
}

function replaceBelleSection(script: string, kind: 'intro' | 'outro', text: string) {
  for (const marker of belleSectionMarkers(kind)) {
    const pattern = new RegExp(`(^${marker}\\s*\\n(?:---\\s*\\n)?)(BELLE B:\\s*).*$`, 'im')
    if (pattern.test(script)) return script.replace(pattern, `$1$2${normalizeHeaderValue(text)}`)
  }
  throw new Error(`${belleSectionMarkers(kind)[0]} block is missing or malformed`)
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

// ATL-PIPE-020: Narrative Hook Detection Immunity.
// Replaces keyword-matching with category-based narrative hook detection.
// Rationale: the validator should recognise hook classes, not specific words.
// Writing to satisfy a keyword list is a validator defect, not a story defect.
//
// The nine categories (per Marc's classification):
//   1. suspicious_discrepancy — numbers/data/records that tell an unintended story
//   2. unexplained_event      — something happened without explanation
//   3. hidden_evidence        — something concealed or suppressed
//   4. secret                 — information deliberately withheld
//   5. fraud_wrongdoing       — explicit criminal or deceptive action
//   6. betrayal               — breach of trust
//   7. conspiracy             — organised deception or plot
//   8. impossible_fact        — something that should not be possible
//   9. missing_person         — someone absent, disappeared, or unaccounted for
//   10. concrete_threat       — a specific danger, warning, or lurking presence
//
// Ledger intro: "numbers tell a story they were never meant to tell"
//   → matches suspicious_discrepancy (pattern: numbers.{0,50}story.{0,30}meant)
//   → PASS — intro unchanged, validator updated.
//
// LEARN-001 classification: Validation-Model Defect (not story defect, not validator bug).
// Root cause: keyword matching approximates hook detection but cannot recognise
// inferential or structural forms of narrative tension.

export type NarrativeHookCategory =
  | 'suspicious_discrepancy'
  | 'unexplained_event'
  | 'hidden_evidence'
  | 'secret'
  | 'fraud_wrongdoing'
  | 'betrayal'
  | 'conspiracy'
  | 'impossible_fact'
  | 'missing_person'
  | 'concrete_threat'

function normalizeNarrativeHookText(text: string) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectNarrativeHookCategory(text: string): NarrativeHookCategory | null {
  const raw = normalizeNarrativeHookText(text).toLowerCase()
  const normalized = raw
    .replace(/\bshouldn.?t\b/g, 'should not')
    .replace(/\bcan.?t\b/g, 'cannot')
    .replace(/\bcan not\b/g, 'cannot')
    .replace(/\bdoesn.?t\b/g, 'does not')
    .replace(/\bisn.?t\b/g, 'is not')
    .replace(/\bwasn.?t\b/g, 'was not')
    .replace(/\bwon.?t\b/g, 'will not')
  const contracted = normalized
    .replace(/\bshould (not|never)\b/g, "shouldn't")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bdoes not\b/g, "doesn't")
    .replace(/\bis not\b/g, "isn't")
    .replace(/\bwas not\b/g, "wasn't")
    .replace(/\bwill not\b/g, "won't")
  const t = `${raw}\n${normalized}\n${contracted}`

  // 1. Suspicious discrepancy — numbers/data/records that don't add up,
  //    things that communicate an unintended truth, anomalies in records.
  //    Covers: "numbers tell a story they were never meant to tell",
  //    "the entry doesn't reconcile", "entries refuse to match",
  //    "four payments to a vendor that may not exist".
  if (
    /\b(discrepancy|doesn.t add up|doesn.t match|anomal|irregularit|reconciliation|reconciling|reconcile|off the books|never meant to tell|weren.t meant|wasn.t meant|not meant to|never supposed to|shouldn.t exist|can.t exist|numbers.*wrong|wrong.*numbers)\b/i.test(t) ||
    /numbers.{0,60}story.{0,40}meant/i.test(t) ||
    /story.{0,40}(never|not|wasn.t|weren.t).{0,20}meant/i.test(t) ||
    /\b(entries|entry|payments?|invoices?|transaction|figure|amount|sum).{0,40}(refuse|fail|don.t|doesn.t|won.t|can.t).{0,20}(match|reconcile|add up|balance|align)\b/i.test(t) ||
    /\b(vendor|account|entity|company|supplier|payee).{0,40}(may not|might not|doesn.t|don.t|can.t|cannot|never|shouldn.t).{0,20}(exist|be real|be found|have existed)\b/i.test(t) ||
    /\b(ledger|account|entry|invoice|payment|transaction|column|figure|balance|books?).{0,40}(wrong|off|false|missing|extra|unexplained|shouldn.t|didn.t|doesn.t|not right|bad|error|mistake)\b/i.test(t) ||
    /\b(wrong|off|false|missing|extra|unexplained).{0,40}(ledger|account|entry|invoice|payment|transaction|column|figure|balance|books?)\b/i.test(t)
  ) return 'suspicious_discrepancy'

  // 2. Unexplained event — something happened with no apparent reason.
  if (
    /\b(unexplained|no explanation|no one knows why|never explained|without warning|out of nowhere|for no reason|reasons? unclear|nobody.?s sure|mysterious circumstances|can.?t explain|nobody can explain)\b/i.test(t)
  ) return 'unexplained_event'

  // 3. Hidden evidence — something concealed, suppressed, or not meant to surface.
  if (
    /\b(hidden|concealed|buried|covered up|cover.?up|suppressed|sealed|locked away|kept secret|kept quiet|wasn.t meant to be found|never meant to be found|shouldn.t have surfaced|didn.t want found|didn.t want anyone to find)\b/i.test(t)
  ) return 'hidden_evidence'

  // 4. Secret — information deliberately withheld from someone.
  if (
    /\b(secret|no one knew|nobody knew|didn.t tell|never told|withheld|confidential|classified|kept from|wasn.t supposed to know|not supposed to know)\b/i.test(t)
  ) return 'secret'

  // 5. Fraud / wrongdoing — explicit criminal or deceptive act.
  if (
    /\b(fraud|fraudulent|scheme|scam|theft|stolen|embezzl|forgery|falsif|tamper|manipulat|corrupt|brib|crime|criminal|illegal|illicit|wrongdoing|cover.?up|decei|on purpose|paper trail)\b/i.test(t)
  ) return 'fraud_wrongdoing'

  // 6. Betrayal — breach of trust between people.
  if (
    /\b(betrayal|betrayed|betrays|trust.{0,20}broken|broken.{0,20}trust|backstab|double.?cross|sold.{0,10}out|turned.{0,10}against|let.{0,10}down by someone)\b/i.test(t)
  ) return 'betrayal'

  // 7. Conspiracy — organised deception, plot, or coordinated wrongdoing.
  if (
    /\b(conspiracy|conspired|conspiring|plot|orchestrated|coordinated|web of|network of|scheme involving|working together to|they planned|planned together)\b/i.test(t)
  ) return 'conspiracy'

  // 8. Impossible fact — something that defies logic or should not exist.
  if (
    /\b(impossible|can.?t be right|can.?t be true|makes no sense|doesn.?t make sense|defies|against all (odds|logic|reason)|shouldn.?t (exist|be possible|have happened)|never should have|no way that|how is it possible)\b/i.test(t)
  ) return 'impossible_fact'

  // 9. Missing person — someone absent, disappeared, or unaccounted for.
  if (
    /\b(missing|disappeared|vanished|gone without|unaccounted|never came back|never returned|last seen|never found|no trace)\b/i.test(t)
  ) return 'missing_person'

  // 10. Concrete threat / danger / menace — a specific danger, warning, or
  //     lurking presence tied to a subject/place/action, not just mood.
  if (
    /\b(something|someone|somebody|a man|a woman|a figure|a shadow|a voice|footsteps?|a presence).{0,50}(moving|watching|following|waiting|hiding|lurking|standing|breathing|scratching|knocking|whispering|coming|approaching)\b/i.test(t) ||
    /\b(moving|watching|following|waiting|hiding|lurking|standing|breathing|scratching|knocking|whispering|coming|approaching).{0,50}\b(behind|inside|under|above|outside|across|beneath|within)\b/i.test(t) ||
    /\b(danger|threat|warning|warned|trap|ambush|menace|stalked|stalker|predator|hunted|hunter).{0,60}\b(door|hallway|room|house|road|car|truck|phone|note|wall|walls|window|basement|attic|neighbor|family|home|town|station|route)\b/i.test(t) ||
    /\b(door|hallway|room|house|road|car|truck|phone|note|wall|walls|window|basement|attic|neighbor|family|home|town|station|route).{0,60}\b(danger|threat|warning|trap|ambush|menace|stalked|hunted|not safe|unsafe)\b/i.test(t)
  ) return 'concrete_threat'

  return null
}

async function hasConcreteNarrativeHook(text: string): Promise<boolean> {
  // ATL-PIPE-020: category-based detection remains the cheap fast path.
  const normalizedText = normalizeNarrativeHookText(text)
  const regexCategory = detectNarrativeHookCategory(normalizedText)
  if (regexCategory) return true
  if (!normalizedText) return false

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    const response: any = await Promise.race([
      anthropic.messages.create({
        model: NARRATIVE_HOOK_FALLBACK_MODEL,
        max_tokens: 4,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Given this intro line, does it contain a concrete narrative hook — a specific event, danger, secret, conflict, mystery, threat, or story mechanism that creates a reason to keep listening?

Answer strictly "YES" or "NO" and nothing else.

INTRO:
${normalizedText}`,
        }],
      }),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Narrative hook LLM fallback timed out after ${NARRATIVE_HOOK_FALLBACK_TIMEOUT_MS}ms`)), NARRATIVE_HOOK_FALLBACK_TIMEOUT_MS)
      }),
    ])
    if (timeoutHandle) clearTimeout(timeoutHandle)
    const raw = response.content
      .map((c: any) => ('text' in c ? c.text : ''))
      .join('')
      .trim()
    const llmSaysYes = /^yes\b/i.test(raw)

    logAnthropicCall({
      route: '/api/admin/production-jobs/run-next',
      purpose: 'narrative-hook-llm-fallback',
      model: NARRATIVE_HOOK_FALLBACK_MODEL,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      metadata: {
        regexCategory,
        verdict: raw,
        normalizedText,
      },
    }).catch(() => {})

    return llmSaysYes
  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    console.warn('[run-next] narrative hook LLM fallback failed; using regex result', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Boolean(regexCategory)
  }
}

// ATL-PIPE-010: classify Belle issues into canonical StructuredErrorJsonKind.
function classifyBelleIssues(issues: string[]): StructuredErrorJsonKind {
  const text = issues.join(' ').toLowerCase()
  if (/hook|concrete narrative|atmospheric|story mechanism/.test(text)) return 'belle_quality_hook_missing'
  if (/story title|must include the story title|must name the story title|\bstandalone.*title\b/.test(text)) return 'belle_quality_title_missing'
  if (/\[listener_name\]|listener_name|placeholder|personali/.test(text)) return 'belle_quality_listener_missing'
  return 'belle_quality_unknown'
}

// ATL-PIPE-010: classify Belle repair error message into canonical kind.
function classifyBelleRepairError(message: string): StructuredErrorJsonKind {
  const msg = message.toLowerCase()
  if (/hook|concrete narrative|atmospheric/.test(msg)) return 'belle_quality_hook_missing'
  if (/story title|must include the story title|must name the story title|\bstandalone.*title\b/.test(msg)) return 'belle_quality_title_missing'
  if (/\[listener_name\]|listener_name|placeholder|personali/.test(msg)) return 'belle_quality_listener_missing'
  if (/repair.*fail|fail.*repair|deterministic|attempt limit/.test(msg)) return 'belle_quality_repair_failed'
  return 'belle_quality_unknown'
}

// RFR Reliability Sprint — advisory vs severe defect classification.
// Marc's rule: LLM quality validators are advisory unless they detect a severe defect.
// Severe defects block the pipeline. Advisory defects are logged but do not block.
//
// SEVERE (blocks pipeline):
//   missing intro/outro, missing title, broken sentence, wrong story,
//   placeholder text, canon/legal violation, corrupt or incomplete audio
//
// ADVISORY (log and continue):
//   hook quality, low specificity, interchangeability concern, atmospheric-only hook,
//   intro scoring below threshold when audio is intact and text is coherent
function isBelleSevereDefect(kind: string, issues: string[]): boolean {
  // Severe by kind
  if (kind === 'belle_quality_title_missing') return true      // Missing story title — listener won't know what they heard
  if (kind === 'belle_quality_listener_missing') return true   // Missing [LISTENER_NAME] — personalization broken
  // Hook quality is not severe — advisory only
  if (kind === 'belle_quality_hook_missing') return false
  // Unknown kinds: check issues text for severe signals
  const text = issues.join(' ').toLowerCase()
  if (/missing intro|missing outro|no intro|no outro/.test(text)) return true
  if (/placeholder|lorem ipsum|insert here|\[title\]|\[story\]|\[name\]/.test(text)) return true
  if (/broken sentence|incomplete sentence|truncated|cut off mid/.test(text)) return true
  if (/wrong story|different story|wrong title|doesn.t match the story/.test(text)) return true
  if (/canon.*violation|legal.*violation|compliance.*issue/.test(text)) return true
  if (/corrupt|unplayable|zero bytes|silent audio|no audio/.test(text)) return true
  return false
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
 * @param introText  Text extracted from BELLE B ANNOUNCEMENT / legacy BELLE B INTRO block
 * @param outroText  Text extracted from BELLE B OUTRO block
 */
async function validateIntroOutroPositionRules(
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
    // [LISTENER_NAME] is a valid split-point placeholder in the script — do NOT reject it.
    // generate_belle_assets splits around it; we strip it here for quality checks only.
    const introForChecks = intro.replace(/\[LISTENER_NAME\]/g, '').replace(/\s{2,}/g, ' ').trim()
    // Concrete narrative hook (event, danger, secret, conflict, mystery, mechanism)
    if (!(await hasConcreteNarrativeHook(introForChecks))) {
      issues.push('intro must include a concrete narrative hook (event, danger, secret, conflict, mystery, or story mechanism)')
      requireLlmJudgment = true
    }
    // Standalone: must name the story title
    if (episodeType === 'standalone' && title && !belleTextIncludes(introForChecks, title)) {
      issues.push(`standalone intro must name the story title "${title}"`)
    }
    // Series: must name series title, episode number, and episode title
    if (isSeries) {
      if (seriesName && !belleTextIncludes(introForChecks, seriesName)) {
        issues.push(`series intro must name the series title "${seriesName}"`)
      }
      if (episodeNum !== null && !introNamesEpisodeNumber(introForChecks, episodeNum)) {
        issues.push(`series intro must name the episode number (episode ${episodeNum})`)
      }
      if (title && !belleTextIncludes(introForChecks, title)) {
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

function stripEpisodeIssuePrefix(issue: string) {
  return String(issue || '').replace(/^EP\d+:\s*/i, '').trim()
}

function isBellePositionIssue(issue: string) {
  const text = stripEpisodeIssuePrefix(issue).toLowerCase()
  return (
    /^intro text is missing/.test(text) ||
    /^outro text is missing/.test(text) ||
    /^intro must /.test(text) ||
    /^standalone intro /.test(text) ||
    /^series intro /.test(text) ||
    /^standalone outro /.test(text) ||
    /^non-finale outro /.test(text) ||
    /^finale outro /.test(text)
  )
}

function belleIssuesNeedIntroRepair(issues: string[]) {
  return issues.some(issue => /\bintro\b/i.test(stripEpisodeIssuePrefix(issue)))
}

function belleIssuesNeedOutroRepair(issues: string[]) {
  return issues.some(issue => /\boutro\b/i.test(stripEpisodeIssuePrefix(issue)))
}

function seriesBelleRetryTarget(result: any) {
  const issues = Array.isArray(result?.contentIssues) ? result.contentIssues.map(String) : []
  const storyId = String(result?.episode?.storyId || '').trim()
  if (!storyId || issues.length === 0) return null
  if (!issues.every(isBellePositionIssue)) return null
  return {
    storyId,
    episodeNumber: result.episode?.episodeNumber ?? null,
    title: String(result.episode?.title || '').trim(),
    issues,
    repairIntro: belleIssuesNeedIntroRepair(issues),
    repairOutro: belleIssuesNeedOutroRepair(issues),
  }
}

function normalizeBellePhysicalLine(text: string) {
  return normalizeHeaderValue(String(text || '').replace(/[\r\n]+/g, ' '))
}

async function regenerateSeriesBelleFromFeedback(
  story: any,
  target: { issues: string[]; repairIntro: boolean; repairOutro: boolean },
  nextEpisode: any | null,
  model: string
) {
  const currentIntro = extractBelleSection(String(story.script || ''), 'intro')
  const currentOutro = extractBelleSection(String(story.script || ''), 'outro')
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Repair only the Belle intro/outro copy for this already-produced series episode.

Return JSON only:
{
  "introText": "replacement intro if requested",
  "outroText": "replacement outro if requested"
}

Only repair requested fields. If a field is not requested, omit it.

Hard rules:
- Belle is warm, direct, and specific. No host/DJ/trailer voice.
- No time-of-day reference.
- No speaker labels.
- Announcement must not include [LISTENER_NAME] or any listener name; the shared name opener handles greeting/personalization.
- Announcement must not include a greeting/opener such as "welcome" or "settle in".
- Announcement must name the exact series title, episode number, and episode title.
- Announcement must include a concrete narrative hook: event, danger, secret, conflict, mystery, or story mechanism.
- Outro must never include [LISTENER_NAME].
- Non-finale outro must tease or point toward the next episode.
- Non-finale outro must not include author/narrator credits or "Endless Tales original".
- Finale outro may close the series and include credits.
- Keep each line one or two short sentences.

VALIDATION ISSUES TO FIX:
${target.issues.map(issue => `- ${stripEpisodeIssuePrefix(issue)}`).join('\n')}

EPISODE CONTEXT:
${JSON.stringify({
  title: story.title,
  seriesName: story.series_name,
  episodeNumber: story.episode_number,
  seriesTotalEpisodes: story.series_total_episodes,
  isFinale: story.series_is_finale,
  description: story.description,
  currentIntro,
  currentOutro,
  nextEpisodeTitle: nextEpisode?.title || null,
}, null, 2)}`,
    }],
  })

  const raw = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  const parsed = parseJsonObject(raw)
  const introText = target.repairIntro ? normalizeBellePhysicalLine(String(parsed.introText || '')) : currentIntro
  const outroText = target.repairOutro ? normalizeBellePhysicalLine(String(parsed.outroText || '')) : currentOutro
  if (target.repairIntro && !introText) throw new Error('Belle repair did not return introText')
  if (target.repairOutro && !outroText) throw new Error('Belle repair did not return outroText')

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'series-belle-position-repair',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: story.id,
    seriesId: story.series_id,
  })

  return { introText, outroText }
}

async function deleteBelleAudioFiles(storyId: string, repairIntro: boolean, repairOutro: boolean) {
  const { data: files, error } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  if (error) throw new Error(`Failed to list Belle audio files for invalidation: ${error.message}`)

  const stalePaths = (files || [])
    .map((file: any) => String(file.name || ''))
    .filter(name =>
      (repairIntro && (name === 'announcement.mp3' || name.startsWith('announcement_') || name === 'intro.mp3' || name.startsWith('intro_') || name.startsWith('intro_before_') || name.startsWith('intro_after_'))) ||
      (repairOutro && (name === 'outro.mp3' || name.startsWith('outro_')))
    )
    .map(name => `asc3/${storyId}/${name}`)

  if (stalePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('audio').remove(stalePaths)
    if (removeError) throw new Error(`Failed to delete stale Belle audio files: ${removeError.message}`)
  }

  return stalePaths
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

type PlatformNarratorVoice = {
  name: string
  gender?: string | null
  accent?: string | null
}

type StandaloneNarratorPromptContext =
  | {
      mode: 'assigned'
      narratorName: string
      source: 'brief_json.narrator' | 'author_narrator_id'
    }
  | {
      mode: 'auto_pick'
      platformNarrators: PlatformNarratorVoice[]
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
    const dbVoiceNameForMsg = String(story.narrator_voice_name || '').trim()
    const narratorIsCharacter = extractHeader(script, 'NARRATOR_IS_CHARACTER').trim()
    const sortedVoiceNames = [...voices].map(v => v.name).filter(Boolean).sort()
    issues.push(`${px}NARRATOR "${scriptNarratorName}" not found in narrator_voices`)
    issues.push(`  Script NARRATOR header: "${scriptNarratorName}"`)
    issues.push(`  DB narrator_voice_name: "${dbVoiceNameForMsg || '(not set)'}"`)
    issues.push(`  NARRATOR_IS_CHARACTER: ${narratorIsCharacter || '(not set)'} — if true, the script uses a character as narrator; the NARRATOR header must still be a valid narrator voice name`)
    issues.push(`  Valid narrator voice names: ${sortedVoiceNames.join(', ')}`)
    issues.push(`  Fix: Update NARRATOR header to a valid narrator voice name, e.g. '${voices[0]?.name}'`)
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
      `${px}Narrator name mismatch: script NARRATOR header says "${scriptNarratorName}" but DB narrator_voice_name is "${story.narrator_voice_name}"`
    )
    issues.push(
      `  To fix: either update the script NARRATOR header to "${story.narrator_voice_name}" (trust the DB), or update DB narrator_voice_name to "${scriptNarratorName}" (trust the script). The script header is the source of truth for new scripts.`
    )
    return { passed: false, narratorIssues: issues, resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
  }

  // Rule 6: If narrator_voice_id is already set on the story row, it must agree
  const dbVoiceId = String(story.narrator_voice_id || '').trim()
  if (dbVoiceId && dbVoiceId !== resolvedVoiceId) {
    issues.push(
      `${px}Narrator voice ID mismatch: DB narrator_voice_id="${dbVoiceId}" does not match narrator_voices row ID "${resolvedVoiceId}" for script narrator "${scriptNarratorName}"`
    )
    issues.push(
      `  To fix: update the DB narrator_voice_id to "${resolvedVoiceId}" to match the narrator_voices table entry for "${scriptNarratorName}".`
    )
    return { passed: false, narratorIssues: issues, resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
  }

  return { passed: true, narratorIssues: [], resolvedVoiceId, resolvedVoiceName: matchedVoice.name }
}

function cleanNarratorName(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function formatPlatformNarratorVoice(voice: PlatformNarratorVoice) {
  const gender = cleanNarratorName(voice.gender) || 'unknown gender'
  const accent = cleanNarratorName(voice.accent) || 'unknown accent'
  return `${voice.name} (${gender}, ${accent})`
}

async function fetchPlatformNarratorsForPrompt(): Promise<PlatformNarratorVoice[]> {
  const { data, error } = await supabase
    .from('narrator_voices')
    .select('name,gender,accent')
    .eq('is_active', true)
    .eq('is_platform_narrator', true)
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to load platform narrators: ${error.message}`)

  return (data || [])
    .map((voice: any) => ({
      name: cleanNarratorName(voice.name),
      gender: voice.gender,
      accent: voice.accent,
    }))
    .filter((voice: PlatformNarratorVoice) => !!voice.name)
}

async function resolveStandaloneNarratorForPrompt(story: any, brief: any): Promise<StandaloneNarratorPromptContext> {
  // The current queue/production-job shape has no confirmed narrator override field.
  // First real source: persisted brief_json.narrator.
  const briefNarrator = cleanNarratorName(brief?.narrator)
  if (briefNarrator) {
    return { mode: 'assigned', narratorName: briefNarrator, source: 'brief_json.narrator' }
  }

  const authorId = cleanNarratorName(story?.author_id)
  if (authorId) {
    const { data: author, error: authorError } = await supabase
      .from('authors')
      .select('narrator_id')
      .eq('id', authorId)
      .maybeSingle()

    if (authorError) throw new Error(`Failed to resolve author narrator: ${authorError.message}`)

    const narratorId = cleanNarratorName((author as any)?.narrator_id)
    if (narratorId) {
      const { data: narrator, error: narratorError } = await supabase
        .from('narrator_voices')
        .select('name')
        .eq('id', narratorId)
        .maybeSingle()

      if (narratorError) throw new Error(`Failed to resolve author narrator voice: ${narratorError.message}`)

      const narratorName = cleanNarratorName((narrator as any)?.name)
      if (!narratorName) throw new Error(`Author narrator_id ${narratorId} did not resolve to a narrator_voices.name`)
      return { mode: 'assigned', narratorName, source: 'author_narrator_id' }
    }
  }

  const platformNarrators = await fetchPlatformNarratorsForPrompt()
  if (platformNarrators.length === 0) {
    throw new Error('No active platform narrators are available for auto-pick mode')
  }
  return { mode: 'auto_pick', platformNarrators }
}

function buildStandaloneNarratorPromptBlock(context: StandaloneNarratorPromptContext) {
  if (context.mode === 'assigned') {
    return [
      'NARRATOR ASSIGNMENT:',
      `NARRATOR: ${context.narratorName}`,
      'This narrator is assigned. Use this exact name. Do not change it or invent another.',
    ].join('\n')
  }

  return [
    'NARRATOR SELECTION:',
    'Pick EXACTLY one name from this list. Any name not on this list will cause production to fail. Do not invent a narrator name.',
    ...context.platformNarrators.map((voice) => `- ${formatPlatformNarratorVoice(voice)}`),
  ].join('\n')
}

function validateGeneratedStandaloneNarrator(script: string, context: StandaloneNarratorPromptContext) {
  const generatedNarrator = extractHeader(script, 'NARRATOR').trim()
  if (!generatedNarrator) throw new Error('Generated script is missing NARRATOR header')

  if (context.mode === 'assigned') {
    if (generatedNarrator !== context.narratorName) {
      throw new Error(`Generated NARRATOR "${generatedNarrator}" must exactly match assigned narrator "${context.narratorName}"`)
    }
    return
  }

  const validNames = new Set(context.platformNarrators.map((voice) => voice.name))
  if (!validNames.has(generatedNarrator)) {
    throw new Error(`Generated NARRATOR "${generatedNarrator}" is not in the active platform narrator list`)
  }
}

async function validateBelleText(kind: 'intro' | 'outro', text: string, options: { standalone: boolean; title?: string | null; author?: string | null; narrator?: string | null }) {
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
  // [LISTENER_NAME] is a valid personalization placeholder — do not reject it
  if (/\b(welcome|settle in|let['’]?s begin|begins now|only on endless tales|sponsored by|stay tuned)\b/i.test(text)) {
    issues.push(`${kind} uses forbidden host or promotional language.`)
  }
  if (/\bbelle b\b/i.test(text)) issues.push(`${kind} must say Belle, not Belle B.`)
  if (options.standalone && title && !belleTextIncludes(text, title)) {
    issues.push(`standalone ${kind} must include the story title.`)
  }
  if (options.standalone && kind === 'intro' && text && !(await hasConcreteNarrativeHook(text))) {
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
    // ATL-PIPE-012: narrator credit is required in standalone outro.
    // validateIntroOutroPositionRules enforces this at ready_for_review.
    // Mirror the check here so repair + validate_belle_assets steps also catch it early.
    const narrator = String(options.narrator || '').trim()
    if (options.standalone && narrator && !belleTextIncludes(text, narrator)) {
      issues.push(`standalone outro must include the narrator name.`)
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
- DESCRIPTION fails if it uses past-tense constructions or past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", "hidden", or "lost".
- DESCRIPTION PROTAGONIST RULE: the DESCRIPTION must accurately reflect who the protagonist actually is and what they are trying to do. If the script's protagonist is a security guard, DESCRIPTION must not say "driver". If the protagonist is a nurse, DESCRIPTION must not say "teacher". Mismatches between DESCRIPTION and actual protagonist role are a hard fail.
- DESCRIPTION SPOILER RULE: DESCRIPTION is a story-card teaser, not a plot summary. It must raise a question, not answer it. HARD FAIL if DESCRIPTION reveals: the survivor, the culprit, the missing person's status, a hidden person alive or dead, the final discovery, or the resolution payoff. Examples of failing DESCRIPTION phrases: "to a survivor", "to the killer", "reveals who did it", "the missing child is alive".
- The script must include the required header fields.
- The script must include a CHARACTER GUIDE.
- The script must include BELLE B ANNOUNCEMENT and BELLE B OUTRO blocks.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Difficult Solution Rule: the main problem must feel genuinely difficult at the beginning, the middle must reveal leverage and escalating consequences that make the solution possible, and the ending must feel emotionally and logically earned.
- Fail endings where the climax happens offscreen, the protagonist does not affect the outcome, the ending resolves through exposition instead of dramatic action, the emotional arc is unresolved, or the final solution is passive, too easy, or a "villain already dead" anticlimax.

SECTION 8C — EARLY INVESTMENT & ORIENTATION CHECK (v1.3):
Read the first ~400 words of the script body (after the Belle B intro block, approximately 3 minutes at 130 wpm).
Run the Five-Question Test. By minute 3, a first-time listener must be able to answer all five:
1. Who am I emotionally following? (protagonist or emotional anchor clear within 60–90 seconds)
2. What is happening right now? (immediate situation understandable within 2 minutes)
3. What does this person want, fear, or need? (visible pressure, need, wound, danger, obligation, or desire present)
4. Why does it matter? (personal stakes established)
5. What question am I listening to answer? (one clear listening question is open)
Also check: does the opening create at least one of sympathy, admiration, urgency, fear, curiosity, concern, or emotional identification? If none — FAIL.
Failure on any question = FAIL. Quote the specific lines that failed. State which questions cannot be answered.
The fix is not "explain more." The fix is "anchor the listener earlier."
Series Episode 1 is held to extra strictness — marginal pass on any single question = FAIL for Episode 1.
Do not advance to audio generation if this check fails.

When the script fails, identify the SPECIFIC issue. If DESCRIPTION does not match the protagonist's role, state what the DESCRIPTION says and what the protagonist's actual role is.

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
- Must not use generic host language such as "Welcome", "settle in", "begins now", "only on Endless Tales", "tonight", or promotional copy.
- Must not include [LISTENER_NAME] or any listener name; this line is the story announcement only.

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

MANDATORY FIELD REQUIREMENTS — you will be rejected if these are missing:
1. NO LISTENER NAME: The intro/announcement MUST NOT include [LISTENER_NAME] or any listener name. The shared name opener handles greeting/personalization.
2. NO GREETING: The intro/announcement MUST NOT use greeting/opener language such as "welcome", "settle in", or "let's begin".
3. STORY TITLE: Standalone intro/announcement and outro MUST include the exact story title as provided in TITLE above. Do not paraphrase, shorten, or omit it.
4. CONCRETE HOOK: Standalone intro/announcement MUST include a concrete narrative hook — a specific conflict, crime, mystery mechanism, secret, danger, cover-up, wrongdoing, or story object. "Something waiting" or "a story about trust" is NOT a hook. "Paper trail breaks, someone broke it on purpose" IS a hook. "A forged deed" IS a hook. Name the specific thing that creates danger or mystery.
5. NO SYNOPSIS: NEVER write a third-person synopsis, story description, or plot summary (e.g., "In this story...", "follows a driver...", "a man discovers..."). The listener already chose this story — do not describe it to them.
6. NARRATOR CREDIT (ATL-PIPE-012): Standalone outro MUST include the narrator voice talent name if provided. The narrator name is given in the NARRATOR field below. The exact phrase can vary ("Narrated by [NARRATOR]", "Voices by [NARRATOR]", or incorporated into the outro sentence), but the narrator name MUST appear verbatim in the outro.

Additional content rules:
- Standalone intro must lightly ground the listener in the story world, then add a specific emotional or sensory hook that creates anticipation.
- Outro should emotionally land and feel companion-like.
- Standalone outro must feel complete and must not tease a next episode or deferred resolution.
- Standalone outro must include the story title, author name, narrator name (if provided), and the exact phrase "Endless Tales original".
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
  const targetGenre = genre.trim()
  if (!targetGenre) throw new Error('Author selection requires a genre')

  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .eq('is_active', true)
    .ilike('primary_genre', targetGenre)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to load authors: ${error.message}`)

  const authors = (data || []) as AuthorRow[]
  if (authors.length === 0) throw new Error(`No active author for genre "${genre}"`)

  const requested = requestedAuthor.trim().toLowerCase()
  const selected = requested
    ? authors.find((author) => author.name.toLowerCase() === requested)
    : authors[0]

  if (requested && !selected) {
    throw new Error(`Requested author "${requestedAuthor}" is not active for genre "${genre}"`)
  }
  if (!selected) throw new Error(`No active author for genre "${genre}"`)

  const { error: rotationError } = await supabase
    .from('authors')
    .update({ last_used_at: nowIso() })
    .eq('id', selected.id)

  if (rotationError) throw new Error(`Failed to update author rotation: ${rotationError.message}`)
  return selected
}

async function resolveAuthorNarratorVoice(author: AuthorRow): Promise<ResolvedNarratorVoice> {
  const narratorId = cleanNarratorName(author.narrator_id)
  if (!narratorId) throw new Error(`Author "${author.name}" is missing narrator_id`)

  const { data, error } = await supabase
    .from('narrator_voices')
    .select('id,name,elevenlabs_voice_id')
    .eq('id', narratorId)
    .maybeSingle()

  if (error) throw new Error(`Failed to resolve narrator for author "${author.name}": ${error.message}`)

  const narratorName = cleanNarratorName((data as any)?.name)
  const elevenlabsVoiceId = String((data as any)?.elevenlabs_voice_id || '').trim()
  if (!(data as any)?.id || !narratorName || !elevenlabsVoiceId) {
    throw new Error(`Author "${author.name}" narrator_id ${narratorId} did not resolve to narrator_voices.name and elevenlabs_voice_id`)
  }

  return { id: String((data as any).id), elevenlabsVoiceId, name: narratorName }
}

function cleanAuthorStyleValue(value: unknown): string {
  return String(value || '').trim()
}

function buildAuthorStyleProfile(author: Partial<AuthorRow> | Record<string, any> | null | undefined) {
  if (!author) return null

  const signatureValues = [
    cleanAuthorStyleValue((author as any).signature),
    cleanAuthorStyleValue((author as any).style_signature_trait),
  ].filter(Boolean)

  return {
    name: cleanAuthorStyleValue((author as any).name || (author as any).author),
    style_reference: cleanAuthorStyleValue((author as any).style_reference),
    narrative_voice: cleanAuthorStyleValue((author as any).narrative_voice),
    tone: cleanAuthorStyleValue((author as any).tone),
    pacing: cleanAuthorStyleValue((author as any).pacing),
    signature: Array.from(new Set(signatureValues)).join(' '),
    style_description: cleanAuthorStyleValue((author as any).style_description),
    example_line: cleanAuthorStyleValue((author as any).example_line),
  }
}

function buildAuthorVoicePromptBlock(profile: any): string {
  if (!profile) return ''

  const lines = [
    'AUTHOR VOICE — write the ENTIRE story in this author\'s distinct voice. Do not fall back on a generic or default narrator style.',
  ]

  const authorName = cleanAuthorStyleValue(profile.name)
  const styleReference = cleanAuthorStyleValue(profile.style_reference)
  if (authorName && styleReference) {
    lines.push(`Author: ${authorName}, in the tradition of ${styleReference}`)
  } else if (authorName) {
    lines.push(`Author: ${authorName}`)
  } else if (styleReference) {
    lines.push(`In the tradition of ${styleReference}`)
  }

  const fieldLines: Array<[string, string]> = [
    ['Narrative voice', cleanAuthorStyleValue(profile.narrative_voice)],
    ['Tone', cleanAuthorStyleValue(profile.tone)],
    ['Pacing', cleanAuthorStyleValue(profile.pacing)],
    ['Signature traits', cleanAuthorStyleValue(profile.signature)],
    ['Style notes', cleanAuthorStyleValue(profile.style_description)],
  ]
  for (const [label, value] of fieldLines) {
    if (value) lines.push(`${label}: ${value}`)
  }

  const exampleLine = cleanAuthorStyleValue(profile.example_line)
  if (exampleLine) {
    lines.push('A line that exemplifies this author\'s voice — match its rhythm and texture:')
    lines.push(`"${exampleLine}"`)
  }

  lines.push('Commit fully to this voice. Two stories by different authors must read as if written by two different people.')

  return lines.join('\n')
}

function authorStyleProfileFromContext(story: any, brief: any) {
  const stored = brief?.author_voice_profile || brief?.authorVoiceProfile || {}
  const fallbackSignature = [
    cleanAuthorStyleValue(brief?.signature),
    cleanAuthorStyleValue(brief?.style_signature_trait),
  ].filter(Boolean).join(' ')

  return buildAuthorStyleProfile({
    name: stored.name || brief?.author || story?.author,
    style_reference: stored.style_reference || brief?.style_reference || '',
    narrative_voice: stored.narrative_voice || brief?.narrative_voice || story?.narrative_voice || '',
    tone: stored.tone || brief?.tone || '',
    pacing: stored.pacing || brief?.pacing || '',
    signature: stored.signature || fallbackSignature,
    style_description: stored.style_description || brief?.style_description || '',
    example_line: stored.example_line || brief?.example_line || '',
  })
}

async function resolveAuthorStyleProfileForStory(story: any, brief: any) {
  const authorId = cleanAuthorStyleValue(story?.author_id)
  if (authorId) {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .eq('id', authorId)
      .maybeSingle()

    if (error) throw new Error(`Failed to load author style profile: ${error.message}`)
    if (data) return buildAuthorStyleProfile(data as AuthorRow)
  }

  const authorName = cleanAuthorStyleValue(story?.author || brief?.author)
  if (authorName) {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .ilike('name', authorName)
      .maybeSingle()

    if (error) throw new Error(`Failed to load author style profile: ${error.message}`)
    if (data) return buildAuthorStyleProfile(data as AuthorRow)
  }

  return authorStyleProfileFromContext(story, brief)
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

async function lockJob(job: ProductionJob, lockHolderId: string) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString()
  const baseUpdate = {
    status: 'running',
    locked_at: nowIso(),
    locked_by: lockHolderId,
  }
  const lockedAt = job.locked_at
  const lockedBy = job.locked_by

  let query = supabase
    .from('production_jobs')
    .update(baseUpdate)
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  if (lockedBy === lockHolderId) {
    query = query.eq('locked_by', lockHolderId)
  } else if (lockedAt) {
    query = query.lt('locked_at', staleBefore)
  } else {
    query = query.is('locked_at', null).is('locked_by', null)
  }

  const { data, error } = await query
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to lock production job: ${error.message}`)
  return data as ProductionJob | null
}

async function clearLock(jobId: string, lockHolderId: string) {
  await supabase
    .from('production_jobs')
    .update({ locked_at: null, locked_by: null })
    .eq('id', jobId)
    .eq('locked_by', lockHolderId)
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

async function runGenerateVoicesPreflightRequest(origin: string, storyId: string): Promise<{
  responseOk: boolean
  status: number
  report: VoicePreflightResult
}> {
  const endpoint = `${origin}/api/admin/generate-voices`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VOICE_PREFLIGHT_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, preflightOnly: true }),
      signal: controller.signal,
    })
    const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices') as VoicePreflightResult
    return { responseOk: response.ok, status: response.status, report }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      responseOk: false,
      status: aborted ? 408 : 0,
      report: {
        success: false,
        preflightOnly: true,
        error: aborted
          ? `generate-voices preflight timed out after ${Math.round(VOICE_PREFLIGHT_TIMEOUT_MS / 1000)}s`
          : error instanceof Error ? error.message : String(error),
        blockingReasons: [
          aborted
            ? `generate-voices preflight timed out after ${Math.round(VOICE_PREFLIGHT_TIMEOUT_MS / 1000)}s`
            : `generate-voices preflight request failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function failJob(job: ProductionJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const logs = appendLog(job, 'Step failed', { error: message })
  const structuredErrorDetail = error && typeof error === 'object' && 'structuredErrorDetail' in error
    ? (error as { structuredErrorDetail?: unknown }).structuredErrorDetail
    : undefined
  
  // Build structured error_json to ensure classification is always possible
  const errorJson = buildStructuredError(
    'unknown_step',
    message,
    normalizeStep(job.current_step),
    {
      storyId: job.story_id,
      seriesId: job.series_id,
      marc_required: true,  // Unknown failures always require Marc
      ...(structuredErrorDetail !== undefined ? { detail: structuredErrorDetail } : {}),
    }
  )
  
  await supabase
    .from('production_jobs')
    .update({
      status: 'failed',
      error_json: errorJson,
      logs,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', job.id)

  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  await markStoryNeedsAttention(
    job.story_id || (state as any).storyId,
    `Production job failed at ${normalizeStep(job.current_step)}: ${message}`
  )

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
  const narrator = await resolveAuthorNarratorVoice(author)
  const authorVoiceProfile = buildAuthorStyleProfile(author)

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
    author_voice_profile: authorVoiceProfile,
    narrator: narrator.name,
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
      author_id: author.id || null,
      narrator_voice_id: narrator.elevenlabsVoiceId,
      narrator_voice_name: narrator.name,
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


const SERIES_CHARACTER_TITLE_PREFIXES = new Set([
  'DEPUTY', 'SHERIFF', 'OFFICER', 'DETECTIVE', 'SERGEANT', 'CAPTAIN', 'LIEUTENANT', 'CHIEF', 'AGENT',
  'DOCTOR', 'DR', 'MR', 'MRS', 'MS', 'MISS', 'PROFESSOR', 'PROF', 'FATHER', 'REVEREND', 'REV',
  'SISTER', 'JUDGE', 'MAYOR', 'SENATOR', 'PRESIDENT', 'COLONEL', 'MAJOR', 'GENERAL', 'PRIVATE',
  'NURSE', 'INSPECTOR',
])

function normalizeSeriesCharacterAliasName(name: string) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function stripLeadingSeriesCharacterTitle(name: string) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ')
  const tokens = clean.split(' ').filter(Boolean)
  if (tokens.length <= 1) return clean
  const firstToken = tokens[0].replace(/\.$/, '').toUpperCase()
  return SERIES_CHARACTER_TITLE_PREFIXES.has(firstToken) ? tokens.slice(1).join(' ') : clean
}

function normalizeSeriesCharacterName(name: string) {
  return normalizeSeriesCharacterAliasName(stripLeadingSeriesCharacterTitle(name))
}

function seriesCharacterNameTokens(name: string) {
  return normalizeSeriesCharacterName(name)
    .split(' ')
    .map(token => token.replace(/[^A-Z0-9'-]/g, '').trim())
    .filter(Boolean)
}

function isSeriesCharacterSubsetName(a: string, b: string) {
  const aTokens = seriesCharacterNameTokens(a)
  const bTokens = seriesCharacterNameTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false
  if (aTokens[0] !== bTokens[0]) return false
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens
  const longer = aTokens.length <= bTokens.length ? bTokens : aTokens
  return shorter.every(token => longer.includes(token))
}

function findSeriesRosterNameMatch(roster: any[], incomingName: string) {
  const normalized = normalizeSeriesCharacterName(incomingName)
  const exact = roster.find((row: any) => {
    const canonical = normalizeSeriesCharacterName(row.canonical_name_normalized || row.canonical_name)
    const aliases = Array.isArray(row.aliases) ? row.aliases.map((alias: string) => normalizeSeriesCharacterName(alias)) : []
    return canonical === normalized || aliases.includes(normalized)
  })
  if (exact) return { match: exact, kind: 'exact' as const, ambiguous: false }

  const fuzzyMatches = roster.filter((row: any) => isSeriesCharacterSubsetName(incomingName, row.canonical_name || row.canonical_name_normalized || ''))
  if (fuzzyMatches.length === 1) return { match: fuzzyMatches[0], kind: 'fuzzy' as const, ambiguous: false }
  if (fuzzyMatches.length > 1) return { match: null, kind: 'fuzzy' as const, ambiguous: true }
  return { match: null, kind: 'none' as const, ambiguous: false }
}

async function appendSeriesRosterAlias(seriesId: string, canonicalNameNormalized: string, aliasName: string) {
  const normalizedAlias = normalizeSeriesCharacterAliasName(aliasName)
  if (!normalizedAlias || normalizedAlias === normalizeSeriesCharacterAliasName(canonicalNameNormalized)) return

  const { data, error } = await supabase
    .from('series_character_roster')
    .select('aliases')
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', canonicalNameNormalized)
    .maybeSingle()

  if (error || !data) {
    if (error) console.warn(`Failed to load roster aliases for ${aliasName}: ${error.message}`)
    return
  }

  const aliases = Array.isArray(data.aliases)
    ? data.aliases.map((alias: string) => normalizeSeriesCharacterAliasName(alias)).filter(Boolean)
    : []
  const aliasSet = new Set(aliases)
  if (aliasSet.has(normalizedAlias)) return
  aliasSet.add(normalizedAlias)

  const { error: updateError } = await supabase
    .from('series_character_roster')
    .update({ aliases: Array.from(aliasSet), updated_at: nowIso() })
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', canonicalNameNormalized)

  if (updateError) console.warn(`Failed to append roster alias ${normalizedAlias}: ${updateError.message}`)
}

async function updateSeriesRosterEarliestAppearance(seriesId: string, rosterCharacter: any, episode: any, episodeNum: number) {
  const currentFirst = Number(rosterCharacter?.first_appeared_episode || 0)
  if (currentFirst > 0 && currentFirst <= episodeNum) return

  const canonicalNameNormalized = rosterCharacter?.canonical_name_normalized || normalizeSeriesCharacterName(rosterCharacter?.canonical_name)
  if (!canonicalNameNormalized) return

  const { error } = await supabase
    .from('series_character_roster')
    .update({
      first_appeared_episode: episodeNum,
      established_from_story_id: episode?.id || rosterCharacter?.established_from_story_id || null,
      updated_at: nowIso(),
    })
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', canonicalNameNormalized)

  if (error) console.warn(`Failed to update earliest roster appearance for ${canonicalNameNormalized}: ${error.message}`)
}

function detectSeriesCharacterRegionalTags(text: string) {
  const d = String(text || '').toLowerCase()
  const tags: string[] = []
  if (/\b(southern|us southern)\b/.test(d)) tags.push('southern')
  if (/\b(midwest|midwestern|us midwest)\b/.test(d)) tags.push('midwest')
  if (/\bnew england\b/.test(d)) tags.push('new_england')
  if (/\b(new york|brooklyn|bronx|queens)\b/.test(d)) tags.push('new_york')
  if (/\bboston\b/.test(d)) tags.push('boston')
  if (/\b(western|cowboy|cowgirl)\b/.test(d)) tags.push('western')
  if (/\b(texas|texan)\b/.test(d)) tags.push('texas')
  return Array.from(new Set(tags))
}

function parseSeriesCharacterGuide(script: string) {
  const chars: Array<{ name: string; description: string; gender: string; age: string; accent: string; regional_tags: string[] }> = []
  const guideMatch = String(script || '').match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)(?:\n---|\[START AUDIO DRAMA SCRIPT\])/i)
  if (!guideMatch) return chars
  const guideLines = guideMatch[1].split('\n').map(line => line.trim()).filter(Boolean)
  for (const line of guideLines) {
    const nameMatch = line.match(/^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'.()/]+?)\s*(?:[—–-]|:)/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const detail = line.slice(nameMatch[0].length).trim()
    const parts = detail.split(',').map(part => part.trim()).filter(Boolean)
    const lower = line.toLowerCase()
    const gender = lower.includes('female') || lower.includes('woman') || lower.includes('girl')
      ? 'female'
      : lower.includes('male') || lower.includes('man') || lower.includes('boy')
        ? 'male'
        : ''
    const genderIndex = parts.findIndex(part => /\b(female|woman|girl|male|man|boy)\b/i.test(part))
    const age = parts.find((part, index) => index !== genderIndex && /\b(young|old|elderly|teen|child|kid|\d{1,2}s?|early|mid|late)\b/i.test(part)) || ''
    const accent = parts.find(part => /\b(american|southern|british|english|irish|scottish|australian|canadian|boston|midwest|new england|new york|western|texas|texan)\b/i.test(part)) || ''
    chars.push({
      name,
      description: line,
      gender,
      age,
      accent,
      regional_tags: detectSeriesCharacterRegionalTags(line),
    })
  }
  return chars
}

async function loadSeriesCharacterRoster(seriesId: string) {
  const { data, error } = await supabase
    .from('series_character_roster')
    .select('canonical_name,canonical_name_normalized,aliases,description,gender,age,accent,regional_tags,voice_id,voice_name,first_appeared_episode,established_from_story_id,is_locked')
    .eq('series_id', seriesId)
    .eq('is_locked', true)
    .order('first_appeared_episode', { ascending: true })
    .order('canonical_name', { ascending: true })

  if (error) throw new Error(`Failed to load series character roster: ${error.message}`)
  return data || []
}

function buildSeriesCharacterRosterPromptBlock(roster: any[]) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return `LOCKED SERIES CHARACTER ROSTER — NONE YET
This is the first episode or no recurring characters have been established yet. Any speaking character you introduce in this episode may become locked for later episodes.`
  }

  return `LOCKED SERIES CHARACTER ROSTER — NON-NEGOTIABLE
These characters are already established in this series. This roster overrides the bible, episode brief, and any tempting reinvention.

HARD CHARACTER CONTINUITY RULES:
- Always use each character's FULL canonical_name exactly as shown below in BOTH the CHARACTER GUIDE and every speaker label.
- NEVER shorten to first name only. Example: use "Cecily Morrow" exactly, not "Cecily".
- If any roster character appears again, the CHARACTER GUIDE entry MUST use canonical_name EXACTLY.
- If any roster character speaks, the script speaker label MUST use canonical_name EXACTLY.
- The canonical_name shown below is the exact required form; do not invent abbreviations or alternate labels.
- Do NOT rename, re-age, re-accent, merge, split, or reinterpret roster characters.
- Do NOT replace a roster character with a new name that serves the same story role.
- Keep gender, age, accent, and description consistent with the locked roster.
- New characters are allowed only when they are genuinely new people, not renamed versions of roster characters.

LOCKED ROSTER:
${JSON.stringify(roster.map((character: any) => ({
    canonical_name: character.canonical_name,
    aliases: Array.isArray(character.aliases) ? character.aliases : [],
    gender: character.gender || '',
    age: character.age || '',
    accent: character.accent || '',
    regional_tags: character.regional_tags || [],
    description: character.description || '',
  })), null, 2)}`
}

async function upsertSeriesCharacterRosterFromEpisode(episode: any) {
  const seriesId = episode?.series_id
  const script = episode?.script
  if (!seriesId || !script) return
  const characters = parseSeriesCharacterGuide(String(script))
  if (characters.length === 0) return
  const number = episodeNumber(episode, 1)
  const now = nowIso()
  const roster = await loadSeriesCharacterRoster(String(seriesId))
  const rows: any[] = []

  for (const character of characters) {
    const rosterMatch = findSeriesRosterNameMatch(roster, character.name)
    if (rosterMatch.match) {
      await appendSeriesRosterAlias(
        String(seriesId),
        rosterMatch.match.canonical_name_normalized || normalizeSeriesCharacterName(rosterMatch.match.canonical_name),
        character.name
      )
      await updateSeriesRosterEarliestAppearance(String(seriesId), rosterMatch.match, episode, number)
      continue
    }

    if (rosterMatch.ambiguous) {
      console.warn(`Ambiguous series roster match for ${character.name}; leaving as distinct roster character`)
    }

    rows.push({
      series_id: String(seriesId),
      canonical_name: character.name,
      canonical_name_normalized: normalizeSeriesCharacterName(character.name),
      aliases: [],
      description: character.description,
      gender: character.gender || null,
      age: character.age || null,
      accent: character.accent || null,
      regional_tags: character.regional_tags,
      first_appeared_episode: number,
      established_from_story_id: episode.id,
      is_locked: true,
      updated_at: now,
    })
  }

  if (rows.length === 0) return

  const { error } = await supabase
    .from('series_character_roster')
    .upsert(rows, { onConflict: 'series_id,canonical_name_normalized', ignoreDuplicates: true })

  if (error) throw new Error(`Failed to establish series character roster: ${error.message}`)
}

async function ensureSeriesCharacterRosterThroughEpisode(seriesId: string, episodes: any[], throughEpisodeNumber: number) {
  const validatedEpisodes = [...(episodes || [])]
    .filter((episode: any) => String(episode?.series_id || '') === String(seriesId))
    .filter((episode: any) => episode?.script && (episode.status === 'validator_passed' || episode.validator_result === 'PASS'))
    .filter((episode: any) => {
      const number = episodeNumber(episode, 0)
      return number > 0 && number <= throughEpisodeNumber
    })
    .sort((a: any, b: any) => episodeNumber(a, 0) - episodeNumber(b, 0))

  for (const episode of validatedEpisodes) {
    await upsertSeriesCharacterRosterFromEpisode(episode)
  }
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

function buildStandaloneScriptPrompt(
  story: any,
  brief: any,
  namePaletteBlock: string,
  narratorContext: StandaloneNarratorPromptContext,
  authorVoiceBlock: string
) {
  const target = runtimeTarget(brief.runtime || '')
  const narratorPromptBlock = buildStandaloneNarratorPromptBlock(narratorContext)

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

🎯 EARLY INVESTMENT RULE (v2.4) — NON-NEGOTIABLE

By the three-minute mark (~400 words of script body after the Belle B intro), the listener must be able to answer all five orientation questions:
1. Who am I following? — protagonist or emotional anchor clearly established within 60–90 seconds.
2. What is happening? — immediate situation understandable within 2 minutes.
3. What do they want, fear, or need? — visible pressure present before minute 3.
4. Why does it matter? — personal stakes established at a human level.
5. What am I listening to find out? — one clear listening question is open.

The opening must also create at least one of: sympathy, admiration, urgency, fear, curiosity, concern, or emotional identification.

Core principle: CLARITY OF SITUATION. MYSTERY OF CAUSE.
The listener must know what is happening before being asked to wonder why it is happening.
Mystery of cause is allowed and encouraged. Mystery of situation is never acceptable.

Do not send a script forward if the opening relies mainly on "it makes sense later."
The fix for a weak opening is not "explain more." It is "anchor the listener to a person and a pressure earlier."

Write or revise the opening AFTER the rest of the episode is drafted when possible — it is easier to write a perfect entry point when you know what you are entering.

${authorVoiceBlock}

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
- Belle B announcement must not include [LISTENER_NAME] or any listener name; the shared name opener handles greeting/personalization.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B announcement must never include a greeting/opener, the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- No SFX in the published story body.
- The title may be blank in the brief; if blank, choose the best title from the story.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output ONLY the script, including the Story Resolution Map comment block. No commentary outside the script.

${namePaletteBlock}

${narratorPromptBlock}

Required script structure:
TITLE: [1 to 5 words, 28 characters or fewer]
SERIES:
EPISODE:
EPISODE_TITLE:
SERIES_TOTAL_EPISODES:
SERIES_IS_FINALE:
AUTHOR:
GENRE:
DESCRIPTION: [complete sentence, 70 characters or fewer, present tense only, tease a question without revealing the climax, twist, final discovery, or resolution payoff]
NARRATOR: ${narratorContext.mode === 'assigned' ? narratorContext.narratorName : '[pick exactly one name from the narrator selection list above]'}
ANNOUNCER: Belle B
NARRATIVE_VOICE:
NARRATOR_IS_CHARACTER: [true/false, must match NARRATOR]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B ANNOUNCEMENT
---
BELLE B: [one or two short sentences, warm, specific, sensory. Includes the story title in quotes and references something specific from the story. NO [LISTENER_NAME]. NO greeting/opener (e.g. no "settle in", "welcome") — the name opener handles that. NO author credit, NO narrator credit, no time-of-day, no "Endless Tales original".]

[START AUDIO DRAMA SCRIPT]
NARRATOR: ...
CHARACTER NAME: ...

BELLE B OUTRO
---
BELLE B: [one or two short sentences, reflective, no time-of-day reference, credits both the author AND the narrator voice talent by their exact name (e.g. "Written by [AUTHOR], narrated by [NARRATOR], an Endless Tales original."), says "an Endless Tales original"]

Production-format hard rules:

HAL-SCRIPT-002: MANDATORY LABELING RULE
- Every prose/dialogue line after [START AUDIO DRAMA SCRIPT] must begin with a speaker label.
- No unlabeled continuation paragraphs allowed under any circumstance.
- A paragraph must either:
  a) Start with NARRATOR: followed by the narration text, OR
  b) Start with CHARACTER NAME: followed by the dialogue, OR
  c) Be a [BRACKET CUE] for timing (beat, pause, SFX), OR
  d) Be empty/blank
- If narration continues from the previous line, start a new NARRATOR: line. Do not write unlabeled prose.
- Examples of WRONG (will cause voice_preflight to fail):
  NARRATOR: The door creaked open.
  A figure emerged from the shadows.  <-- WRONG: unlabeled
- Example of RIGHT:
  NARRATOR: The door creaked open.
  NARRATOR: A figure emerged from the shadows.

Additional production-format hard rules:
- Speaker labels are for spoken words only.
- Character-labeled lines must contain only words that character says aloud.
- Never put action, facial reactions, movement, blocking, inner thought, or narration under a character label.
- Put all action/reaction lines under NARRATOR.
- Wrong: DEPUTY PIKE: Pike's jaw tightened.
- Right: NARRATOR: Pike's jaw tightened.

Additional rules:
- DESCRIPTION must be a COMPLETE sentence, 70 characters or fewer, and present tense only so it fits two lines on story cards. If the brief-provided description is longer than 70 characters or uses past-tense constructions, rewrite it to comply. Before final output, self-check DESCRIPTION length; if it is over 70 characters, rewrite it internally until it is complete and 70 characters or fewer. Never cut DESCRIPTION mid-word or mid-phrase. Never output a fragment. Reject past-tense story-card phrasing such as "vanished", "was", "were", "had", "found", "discovered", "left", "moved", "sealed", "signed", "forged", "buried", "hidden", or "lost". DESCRIPTION must TEASE a question, never reveal the story's climax, twist, final discovery, or resolution payoff. Raise curiosity about the setup or mystery; do NOT state the outcome. Example: tease "strange notes under a neighbor's door at 3:12 a.m."; do NOT reveal "someone is trapped inside."
- If NARRATOR_IS_CHARACTER is false, NARRATOR must not be a story character name and must not include "(character)".
- If the narrator is a story character, NARRATOR_IS_CHARACTER must be true and the script must use consistent first-person narration.
- Standalone stories must end conclusively.
- Series non-finales must end on a specific cliffhanger.
- Keep narrator voice consistent.
- Do not include markdown fences.

HAL-SCRIPT-004: NUMBER AND CURRENCY FORMATTING RULE
- Write all numbers and money amounts as spoken words in dialogue and narration.
- Prefer "three hundred and forty thousand dollars" over "$340,000".
- Prefer "fourteen" over "14". Prefer "nineteen ninety-eight" over "1998" for years in dialogue.
- Exception: exact written numbers needed for plot (badge numbers, case numbers, codes) may use digits.
- Reason: voice TTS reads digit strings differently from how Whisper transcribes spoken audio.
  Using spoken word forms ensures QC transcript matching succeeds without normalization workarounds.

HAL-SCRIPT-005: When writing numbers in dialogue or narration, use consistent form. If you write forty-five, write all two-digit numbers as words. If you write 45, use digits. Mixed forms within a sentence create QC noise.

HAL-SCRIPT-006: SHORT DIALOGUE SENTENCE RULE
Do NOT write a character dialogue line that begins with a standalone one-word sentence followed immediately by more content in the same line.
BAD:  ROSA: Yes. He retired eight months ago.
BAD:  GARRITY: No. The file was stamped last week.
BAD:  DOLAN: Sure. I can check the register.
GOOD: ROSA: He retired eight months ago—she nodded and confirmed it.
GOOD: GARRITY: He said no; the file was stamped last week.
GOOD: ROSA: Yes, he retired eight months ago.
REASON: Whisper voice activity detection stops after the first short sentence ("Yes.") because the natural period pause reads as segment end. Combining into a single flowing sentence prevents false QC truncation.
If an affirmation/negation is necessary, write it as a separate ROSA: line before the continuation line.

HAL-SCRIPT-007: SHORT DIALOGUE LINE MINIMUM LENGTH
Dialogue lines MUST be at least 5 words. Lines shorter than 5 words cause Whisper to drop
the opening word(s) — e.g. "It's open." → Whisper returns "Open." (contraction dropped).
BAD:  LEN: It's open.
BAD:  ROSA: Come in.
BAD:  WARD: Too late.
GOOD: LEN: The door is already open, come through.
GOOD: ROSA: You can come in now, he is ready.
GOOD: WARD: I am afraid you are already too late.
If the dramatic beat requires a very short response, write it as subtext in the narration or
merge with the character's next line. Never leave a standalone line under 5 words.
REASON: Short audio clips from ElevenLabs can cause Whisper VAD to miss the opening
word(s), producing a partial transcript that fails QC. ATL-PIPE-017 catches some cases
but HAL-SCRIPT-007 prevents all of them at the source.

HAL-SCRIPT-003: DESCRIPTION PROTAGONIST CONSISTENCY RULE
- The DESCRIPTION field must name the protagonist using the EXACT role/occupation that appears in the script body.
- If the brief says "welfare clerk" but the script generates a "caseworker", use "caseworker" in DESCRIPTION.
- If the brief says "driver" but the script generates a "security guard", use "security guard" in DESCRIPTION.
- Write the script first. Then write DESCRIPTION to match who the protagonist actually is in that script.
- Do NOT copy the brief's protagonist role into DESCRIPTION without verifying it matches your script.
- Mismatches between DESCRIPTION and script protagonist are caught by validate_script and will force a retry.

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
    .select('id,title,author,author_id,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version')
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

  const narratorContext = await resolveStandaloneNarratorForPrompt(story, brief)
  if (narratorContext.mode === 'assigned') {
    const { data: narratorRow, error: narratorLookupError } = await supabase
      .from('narrator_voices')
      .select('id,name,elevenlabs_voice_id')
      .ilike('name', narratorContext.narratorName)
      .maybeSingle()

    if (narratorLookupError) throw new Error(`Failed to stamp standalone narrator: ${narratorLookupError.message}`)
    if (!narratorRow?.elevenlabs_voice_id) throw new Error(`Assigned narrator "${narratorContext.narratorName}" did not resolve to narrator_voices.elevenlabs_voice_id`)

    const { error: narratorStampError } = await supabase
      .from('stories')
      .update({
        narrator_voice_id: narratorRow.elevenlabs_voice_id,
        narrator_voice_name: narratorRow.name || narratorContext.narratorName,
      })
      .eq('id', story.id)

    if (narratorStampError) throw new Error(`Failed to stamp standalone narrator on story: ${narratorStampError.message}`)
  }
  const authorVoiceProfile = await resolveAuthorStyleProfileForStory(story, brief)
  const authorVoiceBlock = buildAuthorVoicePromptBlock(authorVoiceProfile)
  const promptBrief = narratorContext.mode === 'assigned'
    ? { ...brief, narrator: narratorContext.narratorName }
    : brief

  const recentStoryTexts = await loadRecentStoryTexts()
  const namePaletteBlock = buildNamePalettePromptBlock({
    genre: story.genre || brief.genre || '',
    setting: [brief.setting, brief.location, brief.region].filter(Boolean).join(' '),
    era: brief.era || brief.period || '',
    recentStoryTexts,
  })
  const prompt = buildStandaloneScriptPrompt(story, promptBrief, namePaletteBlock, narratorContext, authorVoiceBlock)

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
  validateGeneratedStandaloneNarrator(script, narratorContext)
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
  // Narrator check: narrator resolution writes only the explicit brief narrator field.
  const briefNarrator = String(promptBrief.narrator || '').trim()
  const generatedNarrator = extractHeader(script, 'NARRATOR').trim()
  if (briefNarrator && generatedNarrator && generatedNarrator.toLowerCase() !== briefNarrator.toLowerCase()) {
    briefMismatches.push(`Narrator mismatch: brief="${briefNarrator}" vs script="${generatedNarrator}"`)
  }
  const briefWarnings = briefMismatches.length > 0 ? briefMismatches : []

  // ATL-PIPE-005 / Phase 3: Extract Belle B announcement line for inspection.
  let announcementText: string | null = null
  try {
    const belleAnnouncementSection = extractBelleSection(script, 'intro')
    if (belleAnnouncementSection) {
      // Extract text after "BELLE B:" label
      const belleMatch = belleAnnouncementSection.match(/BELLE\s+B:\s*(.+?)(?:\n|$)/i)
      if (belleMatch) {
        announcementText = belleMatch[1].trim()
        const isGeneric = /^(settle\s+in|welcome|let['’]?s\s+begin)/i.test(announcementText) && announcementText.length < 100
        if (isGeneric) {
          briefWarnings.push(`Warning: Belle B announcement appears generic; expected specific story references without a greeting or listener name`)
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to extract Belle B announcement: ${String(e).slice(0, 100)}`)
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
  if (narratorContext.mode === 'assigned' && cleanNarratorName(brief.narrator) !== narratorContext.narratorName) {
    updatePayload.brief_json = promptBrief
  }
  // Only update announcement_text if extracted successfully and non-generic
  if (announcementText && announcementText.length > 20 && !announcementText.includes('[LISTENER_NAME]')) {
    updatePayload.announcement_text = announcementText
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
    introTextExtracted: !!extractBelleSection(script, 'intro'),
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
      isCardCopyFailure: true,        // ATL-PIPE-008: signal deterministic card-copy failure
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
    isCardCopyFailure: false,           // ATL-PIPE-008: AI-validator path
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
  const { responseOk, report } = await runGenerateVoicesPreflightRequest(origin, String(storyId))
  const passed = responseOk && report.success === true

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
  const introAssets = names.filter(name => name === 'announcement.mp3' || name.startsWith('announcement_') || name === 'intro.mp3' || name.startsWith('intro_'))
  const outroAssets = names.filter(name => name === 'outro.mp3' || name.startsWith('outro_'))
  const introText = extractBelleSection(story.script, 'intro')
  const outroText = extractBelleSection(story.script, 'outro')
  const standalone = !story.series_id && Number(story.series_total_episodes || 1) <= 1 && String(story.story_type || '').toLowerCase() !== 'series'
  // ATL-PIPE-012: narrator credit check now included in validateBelleText
  const narratorFromScript = extractHeader(String(story.script || ''), 'NARRATOR').trim() || null
  const issues = [
    ...(introAssets.length > 0 ? [] : ['intro asset is missing.']),
    ...(outroAssets.length > 0 ? [] : ['outro asset is missing.']),
    ...(await validateBelleText('intro', introText, { standalone, title: story.title, author: story.author, narrator: narratorFromScript })),
    ...(await validateBelleText('outro', outroText, { standalone, title: story.title, author: story.author, narrator: narratorFromScript })),
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

  if (state.belleAssetValidation?.status !== 'passed' &&
      state.belleAssetValidation?.status !== 'advisory_passed') {
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
  // ATL-PIPE-012: narrator credit check included in validateBelleText
  const narratorForQuality = extractHeader(String(story.script || ''), 'NARRATOR').trim() || null
  const deterministicIssues = [
    ...(await validateBelleText('intro', introText, { standalone, title: story.title, author: story.author, narrator: narratorForQuality })),
    ...(await validateBelleText('outro', outroText, { standalone, title: story.title, author: story.author, narrator: narratorForQuality })),
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
  // ATL-PIPE-012: RFR outro narrator repair uses a separate retry counter and must not be
  // blocked by stale belleQualityRepair.attempts from prior quality-repair loops.
  const isRfrOutroRepair = state.isRfrOutroRepair === true
  const attempts = Number(previousRepair.attempts || 0)
  if (!isAssetRepair && !isRfrOutroRepair) {
    if (attempts >= 2) throw new Error('Belle quality repair attempt limit reached')
  }

  // Prefer the most relevant failure report for the current repair type.
  // Asset repairs use belleAssetFailedReport (current, has actual forbidden-word issue).
  // RFR outro repairs use rfrOutroNarratorRepair.issue (narrator-missing message from RFR gate).
  // Quality repairs use the quality validator report.
  const failedReport = isRfrOutroRepair
    ? (state.belleQualityFailedReport || { issues: [state.rfrOutroNarratorRepair?.issue || 'standalone outro must name the narrator'] })
    : isAssetRepair
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

  // ATL-PIPE-012: extract narrator name from script header for narrator-credit repair
  const narratorForRepair = extractHeader(String(story.script || ''), 'NARRATOR').trim() || null

  const issueText = Array.isArray(failedReport.issues) ? failedReport.issues.join('\n') : ''
  const hasScores = typeof failedReport.introScore === 'number' || typeof failedReport.outroScore === 'number'
  // ATL-PIPE-012: RFR outro narrator repair always targets the outro only
  const repairIntro = isRfrOutroRepair
    ? false
    : hasScores
      ? Number(failedReport.introScore || 0) < 7 || /\bintro\b/i.test(issueText)
      : /\bintro\b/i.test(issueText) || !failedReport.issues || failedReport.issues.length === 0 || /\bintro/.test(String(failedReport.introText || ''))
  const repairOutro = isRfrOutroRepair
    ? true   // always repair outro when routing from RFR narrator-missing
    : hasScores
      ? Number(failedReport.outroScore || 0) < 7 || /\boutro\b/i.test(issueText)
      : /\boutro\b/i.test(issueText) || !failedReport.issues || failedReport.issues.length === 0 || /\boutro/.test(String(failedReport.outroText || ''))
  const shouldRepairIntro = repairIntro || (!repairIntro && !repairOutro)
  const shouldRepairOutro = repairOutro || (!repairIntro && !repairOutro)
  // Phase 3: the front Belle line is an announcement only. Name/opening is handled by shared name-pool clips.
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
Intro/announcement must include [LISTENER_NAME]: no (never; shared name opener handles personalization)
${narratorForRepair ? `Outro must include narrator name: ${narratorForRepair} (required — e.g. "Narrated by ${narratorForRepair}.")` : ''}

DECLARED METADATA:
${declaredStoryType}

TITLE:
${story.title || 'Untitled'}

GENRE:
${story.genre || 'Unknown'}

${narratorForRepair ? `NARRATOR (voice talent — must appear verbatim in outro credit):
${narratorForRepair}

` : ''}CURRENT BELLE INTRO:
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

  // ATL-PIPE-012: pass narratorForRepair so the post-repair check also validates narrator credit
  const deterministicIssues = [
    ...(shouldRepairIntro ? await validateBelleText('intro', repairedIntro, { standalone: true, title: story.title, author: story.author, narrator: narratorForRepair }) : []),
    ...(shouldRepairOutro ? await validateBelleText('outro', repairedOutro, { standalone: true, title: story.title, author: story.author, narrator: narratorForRepair }) : []),
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
      ...(shouldRepairIntro ? { announcement_text: repairedIntro, announcement_url: null } : {}),
      ...(shouldRepairOutro ? { outro_audio_url: null } : {}),
    })
    .eq('id', storyId)

  if (updateError) throw new Error(`Failed to save repaired Belle text: ${updateError.message}`)

  const { data: files, error: listError } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  if (listError) throw new Error(`Failed to list Belle audio assets for repair: ${listError.message}`)

  const removedAssets = (files || [])
    .map(file => file.name)
    .filter(name => (shouldRepairIntro && (name === 'announcement.mp3' || name.startsWith('announcement_') || name === 'intro.mp3' || name.startsWith('intro_'))) || (shouldRepairOutro && (name === 'outro.mp3' || name.startsWith('outro_'))))
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
    // ATL-P3: Verify final_mix.mp3 actually exists in storage before skipping render.
    // Stale DB URLs from prior failed runs can set audio_url without the file being present,
    // causing silent fake completions where the job advances but produces no audio.
    const storyFolder = `asc3/${storyId}`
    const { data: existingFiles } = await supabase.storage.from('audio').list(storyFolder, { limit: 20 })
    const finalMixExists = (existingFiles || []).some(f => f.name === 'final_mix.mp3')

    if (finalMixExists) {
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

    // Stale DB URL — file missing from storage. Clear DB columns and fall through to render.
    console.warn(`[runStandaloneRenderFinalMix] final_mix.mp3 absent from storage despite DB url set — clearing stale urls and re-rendering for ${storyId}`)
    await supabase.from('stories').update({ audio_url: null, story_audio_url: null }).eq('id', storyId)
  }

  // ATL-PIPE-003: Pre-Assembly Silence Gate — validate all segments before render_final_mix.
  // Threshold split (revised):
  //   ≤ 5KB  → hard fail (truly empty / ElevenLabs error response)
  //   5KB–20KB → warn in logs, continue render (legitimately short dialog lines)
  //   > 20KB → always valid
  const renderAttempts = (state.renderFinalMix?.attempts ?? 0) + 1
  const storyAudioFolder = `asc3/${storyId}`
  try {
    const { data: audioFiles, error: listError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
    if (listError) throw new Error(`Failed to list story segments: ${listError.message}`)

    const segmentPattern = /^segment_\d{4}\.mp3$/
    const audioSegments = (audioFiles || []).filter(f => segmentPattern.test(f.name))

    const HARD_FAIL_SIZE = 5 * 1024    // 5KB — truly empty / corrupted
    const WARN_SIZE      = 20 * 1024   // 20KB — possibly short but may be valid

    const hardFailSegments: string[] = []
    const warnSegments: string[] = []

    for (const file of audioSegments) {
      const size = file.metadata?.size ?? 0
      if (size <= HARD_FAIL_SIZE) {
        hardFailSegments.push(file.name)
        console.warn(`[ATL-PIPE-003] HARD FAIL segment ${file.name}: size=${size}B ≤ ${HARD_FAIL_SIZE}B — truly empty/corrupted`)
      } else if (size <= WARN_SIZE) {
        warnSegments.push(file.name)
        console.warn(`[ATL-PIPE-003] WARN segment ${file.name}: size=${size}B ≤ ${WARN_SIZE}B — short but may be valid short dialog, continuing`)
      }
    }

    if (hardFailSegments.length > 0) {
      const errorReport = {
        success: false,
        kind: 'null_lufs_segments',
        error: 'NULL_LUFS_PRE_ASSEMBLY_GATE_FAILED',
        affectedSegments: hardFailSegments,
        warnSegments,
        message: `Pre-assembly gate: ${hardFailSegments.length} segment(s) are truly empty (≤5KB). Reset job to generate_voices — stale segments will auto-regenerate.`,
        remediation: 'Reset job to generate_voices step — stale segments will auto-regenerate (no manual deletion needed)',
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
    // warnSegments are logged above but do NOT block render — short dialog lines are legitimate
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
      const positionResult = await validateIntroOutroPositionRules(epStory, introText, outroText)
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

// ── ATL-PIPE-012: classifyRfrIssues helper ───────────────────────────────
// Categorises ready_for_review gate failures to enable targeted repair paths.
function classifyRfrIssues(contentIssues: string[]): { kind: StructuredErrorJsonKind; narratorName?: string } {
  if (!Array.isArray(contentIssues) || contentIssues.length === 0) {
    return { kind: 'rfr_gate_unknown' }
  }
  
  // Check for narrator missing issue (e.g. 'standalone outro must name the narrator "Nora Ashby"')
  const narratorMatch = contentIssues
    .find(issue => /standalone outro must name the narrator/.test(issue))
    ?.match(/the narrator "([^"]+)"/)
  if (narratorMatch?.[1]) {
    return { kind: 'rfr_outro_narrator_missing', narratorName: narratorMatch[1] }
  }

  // Other issue types
  if (contentIssues.some(issue => /audio.*missing|final_mix\.mp3/i.test(issue))) {
    return { kind: 'rfr_audio_missing' }
  }

  return { kind: 'rfr_gate_unknown' }
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
    const positionResult = await validateIntroOutroPositionRules(story, introText, outroText)
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

function buildSeriesEpisodePrompt(series: any, episode: any, allEpisodes: any[], continuityBundle: any[], namePaletteBlock: string, authorVoiceBlock: string, assignedNarratorName: string, seriesCharacterRosterBlock: string) {
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

🎯 EARLY INVESTMENT RULE (v2.4) — NON-NEGOTIABLE

By the three-minute mark (~400 words of script body after the Belle B intro), the listener must be able to answer all five orientation questions:
1. Who am I following? — protagonist or emotional anchor clearly established within 60–90 seconds.
2. What is happening? — immediate situation understandable within 2 minutes.
3. What do they want, fear, or need? — visible pressure present before minute 3.
4. Why does it matter? — personal stakes established at a human level.
5. What am I listening to find out? — one clear listening question is open.

The opening must also create at least one of: sympathy, admiration, urgency, fear, curiosity, concern, or emotional identification.

Core principle: CLARITY OF SITUATION. MYSTERY OF CAUSE.
The listener must know what is happening before being asked to wonder why it is happening.
Mystery of cause is allowed and encouraged. Mystery of situation is never acceptable.

Do not send a script forward if the opening relies mainly on "it makes sense later."
The fix for a weak opening is not "explain more." It is "anchor the listener to a person and a pressure earlier."

For non-finale series episodes: re-orient the listener to who they are following and what is at stake within the first 2 minutes, before deepening the episode's conflict. Do not assume the listener remembers exactly where you left off.

${authorVoiceBlock}

ASSIGNED NARRATOR
NARRATOR: ${assignedNarratorName}
Use this exact assigned narrator name. Do NOT invent or change it. Do NOT use a story character as narrator unless NARRATOR_IS_CHARACTER is true.

${seriesCharacterRosterBlock}

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
- Belle B announcement must not include [LISTENER_NAME] or any listener name; the shared name opener handles greeting/personalization.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B announcement must never include a greeting/opener, the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
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
DESCRIPTION: [complete sentence, 70 characters or fewer, present tense only, tease a question without revealing the episode climax, twist, final discovery, or resolution payoff]
NARRATOR: ${assignedNarratorName}
ANNOUNCER: Belle B
NARRATIVE_VOICE: ${episode.narrative_voice || brief.narrative_voice || ''}
NARRATOR_IS_CHARACTER: [true/false, must match NARRATOR]
SUNO PROMPT:

CHARACTER GUIDE
---
[List each speaking character with age, gender, accent, and personality note]

BELLE B ANNOUNCEMENT
---
BELLE B: [one or two short sentences, warm, specific, sensory. Includes the episode title in quotes and references something specific from the episode. NO [LISTENER_NAME]. NO greeting/opener (e.g. no "settle in", "welcome") — the name opener handles that. NO author credit, NO narrator credit, no time-of-day, no "Endless Tales original".]

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
- DESCRIPTION must be a COMPLETE sentence, 70 characters or fewer, and present tense only. Before final output, self-check DESCRIPTION length; if it is over 70 characters, rewrite it internally until it is complete and 70 characters or fewer. Never cut DESCRIPTION mid-word or mid-phrase. Never output a fragment. DESCRIPTION must TEASE a question, never reveal the episode's climax, twist, final discovery, or resolution payoff. Raise curiosity about the setup or mystery; do NOT state the outcome. Example: tease "strange notes under a neighbor's door at 3:12 a.m."; do NOT reveal "someone is trapped inside."
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
  const narrator = await resolveAuthorNarratorVoice(author)
  const authorVoiceProfile = buildAuthorStyleProfile(author)

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
      author_voice_profile: authorVoiceProfile,
      narrator: narrator.name,
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
        author_id: author.id || null,
        narrator_voice_id: narrator.elevenlabsVoiceId,
        narrator_voice_name: narrator.name,
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
  const authorVoiceProfile = await resolveAuthorStyleProfileForStory(targetEpisode, brief)
  const authorVoiceBlock = buildAuthorVoicePromptBlock(authorVoiceProfile)
  const recentStoryTexts = await loadRecentStoryTexts(String(seriesId))
  const namePaletteBlock = buildNamePalettePromptBlock({
    genre: targetEpisode.genre || brief.genre || '',
    setting: [brief.setting, brief.location, brief.region, series.setting].filter(Boolean).join(' '),
    era: brief.era || brief.period || '',
    seriesContinuityText: continuityBundle.map((item: any) => JSON.stringify(item)).join('\n'),
    recentStoryTexts,
  })
  const assignedNarratorName = cleanNarratorName(targetEpisode.narrator_voice_name || brief.narrator)
  if (!assignedNarratorName) throw new Error(`Series episode ${targetEpisodeNumber} is missing assigned narrator`)
  const seriesCharacterRoster = await loadSeriesCharacterRoster(String(seriesId))
  const seriesCharacterRosterBlock = buildSeriesCharacterRosterPromptBlock(seriesCharacterRoster)
  const prompt = buildSeriesEpisodePrompt(series, targetEpisode, episodes, continuityBundle, namePaletteBlock, authorVoiceBlock, assignedNarratorName, seriesCharacterRosterBlock)

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
    await upsertSeriesCharacterRosterFromEpisode(episode)
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

  if (passed) {
    await upsertSeriesCharacterRosterFromEpisode({ ...episode, ...updated, script })
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

  const episodeCount = episodes.length
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
      content: `You are validating an Endless Tales ${episodeCount}-episode series package before audio production.

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
- Every non-finale episode must end with an intentional continuation hook, not standalone closure.
- The finale episode must close the series arc and must not tease another episode.
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

function extractValidatorFailureLines(report: string): string[] {
  const lines = String(report || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const fixIndex = lines.findIndex((line) => /fix the following before resubmitting/i.test(line))
  const fixLines = fixIndex >= 0
    ? lines
        .slice(fixIndex + 1)
        .filter((line) => !/✅/.test(line))
        .filter((line) => /^[-*]\s+|^❌/.test(line))
    : []
  const explicitFailLines = lines.filter((line) => /^❌/.test(line) && !/✅/.test(line))
  const combined = [...fixLines, ...explicitFailLines]
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line && !/VALIDATOR RESULT:\s*FAIL/i.test(line))

  return Array.from(new Set(combined))
}

function classifyDescriptionValidatorFailure(report: string): null | {
  retryable: boolean
  kind: 'mechanical' | 'substantive'
  reason: string
  failureLines: string[]
} {
  const failureLines = extractValidatorFailureLines(report)
  if (!failureLines.length) return null

  const descriptionLine = /\bdescription\b|story-card|teaser|present tense|70 characters|characters or fewer|blocked word|past-tense/i
  if (!failureLines.every((line) => descriptionLine.test(line))) return null

  const substantive = /spoiler|reveals?|climax|twist|final discovery|resolution payoff|outcome|culprit|survivor|protagonist.*mismatch|mismatch.*protagonist|role.*mismatch|description\s+does not match\s+(?:the\s+)?(?:protagonist|role)|weak plot|weak hook|editorial/i
  if (failureLines.some((line) => substantive.test(line))) {
    return { retryable: false, kind: 'substantive', reason: failureLines.join('; '), failureLines }
  }

  const mechanical = /required|missing|70 characters|characters or fewer|too long|present tense|past-tense|blocked word|format|punctuation|complete sentence|truncated|fragment|incomplete|mid-phrase|mid-word/i
  if (failureLines.every((line) => mechanical.test(line))) {
    return { retryable: true, kind: 'mechanical', reason: failureLines.join('; '), failureLines }
  }

  return { retryable: false, kind: 'substantive', reason: failureLines.join('; '), failureLines }
}

function seriesDescriptionFailureFromEpisodeResult(result: any) {
  const episodeReport = String(result?.episodeResult?.report || '')
  const episodeClassification = episodeReport ? classifyDescriptionValidatorFailure(episodeReport) : null
  if (episodeClassification) {
    return {
      episodeNumber: result.episodeResult?.episodeNumber,
      storyId: result.episodeResult?.storyId,
      report: episodeReport,
      classification: episodeClassification,
    }
  }

  const failedEpisodes = Array.isArray(result?.state?.seriesValidation?.failedEpisodes)
    ? result.state.seriesValidation.failedEpisodes
    : []
  const failed = failedEpisodes
    .map((episode: any) => ({
      episode,
      classification: classifyDescriptionValidatorFailure(String(episode?.report || '')),
    }))
    .find((item: any) => item.classification)
  if (!failed) return null

  return {
    episodeNumber: failed.episode.episodeNumber,
    storyId: failed.episode.storyId,
    report: String(failed.episode.report || ''),
    classification: failed.classification,
  }
}

async function regenerateSeriesDescriptionFromEpisodeFeedback(episode: any, feedbackReport: string, model: string, job: ProductionJob) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 900,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Rewrite only the DESCRIPTION header for this already-validated episode.

Do NOT rewrite the script body, title, Belle copy, narrator, author, or story events.
Use the validator feedback exactly.

Rules:
- Return JSON only: {"description": "text"}
- DESCRIPTION must be a complete sentence, 70 characters or fewer.
- DESCRIPTION must be present tense.
- DESCRIPTION must tease a question, not reveal the climax, twist, final discovery, culprit/survivor/status, or resolution payoff.
- Before returning, self-check the length and rewrite internally if it is over 70 characters.
- Do not reuse the current DESCRIPTION verbatim; generate a fresh compliant sentence.
- Prefer the validator's suggested wording when it gives one.

VALIDATOR FEEDBACK:
${feedbackReport}

EPISODE:
${JSON.stringify({
  episodeNumber: episodeNumber(episode, 0),
  title: episode.title,
  currentDescription: extractHeader(episode.script || '', 'DESCRIPTION') || episode.description || '',
}, null, 2)}`,
    }],
  })

  const raw = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()
  const parsed = parseJsonObject(raw)
  const description = sanitizeDescription(String(parsed.description || ''))
  if (!description) throw new Error('Description repair did not return description')

  logAnthropicCall({
    route: '/api/admin/production-jobs/run-next',
    purpose: 'series-description-repair',
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: episode.id || undefined,
    storyTitle: episode.title || 'Series description repair',
    metadata: { is_v2: true, production_job_id: job.id, series_id: episode.series_id, episode_number: episodeNumber(episode, 0) },
  }).catch(() => {})

  return description
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

  const rosterEnsureThroughEpisode = nextEpisode
    ? Math.max(episodeNumber(nextEpisode, 0) - 1, 0)
    : episodes.reduce((max: number, episode: any) => Math.max(max, episodeNumber(episode, 0)), 0)
  if (rosterEnsureThroughEpisode > 0) {
    await ensureSeriesCharacterRosterThroughEpisode(String(seriesId), episodes, rosterEnsureThroughEpisode)
  }

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

    if (result.passed) {
      const refreshedForRoster = await loadSeriesEpisodes(String(seriesId))
      await ensureSeriesCharacterRosterThroughEpisode(String(seriesId), refreshedForRoster, result.episodeNumber)
    }

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
  const finalEpisodeNumber = refreshedEpisodes.reduce((max: number, episode: any) => Math.max(max, episodeNumber(episode, 0)), 0)
  if (finalEpisodeNumber > 0) {
    await ensureSeriesCharacterRosterThroughEpisode(String(seriesId), refreshedEpisodes, finalEpisodeNumber)
  }
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

  const finalEpisodeNumber = episodes.reduce((max: number, episode: any) => Math.max(max, episodeNumber(episode, 0)), 0)
  if (finalEpisodeNumber > 0) {
    await ensureSeriesCharacterRosterThroughEpisode(String(seriesId), episodes, finalEpisodeNumber)
  }

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
  const { responseOk, report } = await runGenerateVoicesPreflightRequest(origin, storyId)
  const passed = responseOk && report.success === true

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
    finalMixUrl = String(report?.finalAudioUrl || '') || null
    duration = Number(report?.durationSecs || 0) || null
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
  let lockHolderId = WORKER_ID

  try {
    // Load shared mission context for this session (INC-011 prevention)
    const activeMission = await loadActiveMission(supabase).catch(() => null)
    if (!activeMission) {
      console.warn('⚠️  No active mission loaded. Production work requires mission context. Set via missionContext.createMission().')
    }

    const body = await req.json().catch(() => ({}))
    const requestedJobId = String(body.jobId || '').trim()
    lockHolderId = String(body.holderId || WORKER_ID).trim() || WORKER_ID
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

    lockedJob = await lockJob(candidate, lockHolderId)
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
        const persistedSeriesValidation = lockedJob.state_json?.seriesValidation && typeof lockedJob.state_json.seriesValidation === 'object'
          ? lockedJob.state_json.seriesValidation
          : {}
        const descriptionRetry = persistedSeriesValidation.descriptionRetry || {}
        const descriptionRetryCount = Number(descriptionRetry.count || 0)
        const descriptionFailure = seriesDescriptionFailureFromEpisodeResult(result)

        if (descriptionFailure?.classification?.retryable && descriptionRetryCount < MAX_SERIES_DESCRIPTION_RETRIES) {
          const targetEpisode = result.episodes.find((episode: any) =>
            String(episode.id) === String(descriptionFailure.storyId)
              || episodeNumber(episode, 0) === Number(descriptionFailure.episodeNumber)
          )
          if (!targetEpisode?.id || !targetEpisode?.script) {
            throw new Error(`Description repair target episode ${descriptionFailure.episodeNumber} was not found or has no script`)
          }

          const repairedDescription = await regenerateSeriesDescriptionFromEpisodeFeedback(
            targetEpisode,
            descriptionFailure.report,
            model,
            lockedJob
          )
          const retryCount = descriptionRetryCount + 1
          const nextScript = replaceOrInsertHeader(String(targetEpisode.script), 'DESCRIPTION', repairedDescription)
          const nextBrief = { ...(targetEpisode.brief_json || {}), description: repairedDescription }
          const existingScriptJson = targetEpisode.script_json && typeof targetEpisode.script_json === 'object' ? targetEpisode.script_json : {}
          const existingSeriesGeneration = existingScriptJson.series_generation || {}
          const { error: storyUpdateError } = await supabase
            .from('stories')
            .update({
              description: repairedDescription,
              script: nextScript,
              brief_json: nextBrief,
              script_json: {
                ...existingScriptJson,
                series_generation: {
                  ...existingSeriesGeneration,
                  summary: {
                    ...(existingSeriesGeneration.summary || {}),
                    description: repairedDescription,
                  },
                  description_repair: {
                    repaired_at: nowIso(),
                    retry_count: retryCount,
                    validator_report: descriptionFailure.report,
                  },
                },
              },
              validator_result: null,
              validator_report: null,
              validator_passed_at: null,
              status: 'script_drafted',
            })
            .eq('id', targetEpisode.id)

          if (storyUpdateError) {
            throw new Error(`Failed to save repaired series DESCRIPTION: ${storyUpdateError.message}`)
          }

          const retryLogs = appendLog({ ...lockedJob, logs }, `Auto-retry ${retryCount}/${MAX_SERIES_DESCRIPTION_RETRIES}: repaired episode ${episodeNumber(targetEpisode, 0)} DESCRIPTION from validator feedback`, {
            seriesId: result.seriesId,
            storyId: targetEpisode.id,
            episodeNumber: episodeNumber(targetEpisode, 0),
            repairedDescription,
          })
          const retryState = {
            ...result.state,
            seriesValidation: {
              ...result.state.seriesValidation,
              failedEpisodes: (result.state.seriesValidation?.failedEpisodes || [])
                .filter((episode: any) => String(episode.storyId) !== String(targetEpisode.id)),
              packageReport: null,
              descriptionRetry: {
                count: retryCount,
                max: MAX_SERIES_DESCRIPTION_RETRIES,
                storyId: targetEpisode.id,
                episodeNumber: episodeNumber(targetEpisode, 0),
                lastDescription: repairedDescription,
                lastReport: descriptionFailure.report,
                lastRetriedAt: nowIso(),
              },
            },
          }

          const { data: retryJob, error: retryUpdateError } = await supabase
            .from('production_jobs')
            .update({
              status: 'queued',
              current_step: NEXT_STEP_AFTER_SERIES_SCRIPTS,
              state_json: retryState,
              error_json: {
                step,
                seriesId: result.seriesId,
                action: 'description_retry',
                retryCount,
                maxRetries: MAX_SERIES_DESCRIPTION_RETRIES,
                repairedStoryId: targetEpisode.id,
                repairedEpisodeNumber: episodeNumber(targetEpisode, 0),
                repairedDescription,
                validatorReport: descriptionFailure.report,
                at: nowIso(),
              },
              logs: retryLogs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (retryUpdateError) {
            throw new Error(`Failed to queue series DESCRIPTION retry: ${retryUpdateError.message}`)
          }

          return NextResponse.json({
            success: true,
            action: 'series_description_retry',
            jobId: retryJob.id,
            currentStep: step,
            nextStep: NEXT_STEP_AFTER_SERIES_SCRIPTS,
            retryCount,
            maxRetries: MAX_SERIES_DESCRIPTION_RETRIES,
            seriesId: result.seriesId,
            repairedStoryId: targetEpisode.id,
            repairedEpisodeNumber: episodeNumber(targetEpisode, 0),
            repairedDescription,
            logs: retryLogs,
          })
        }

        await markStoriesNeedAttention(
          (result.state.seriesValidation?.failedEpisodes || []).map((episode: any) => episode.storyId),
          `Series validation needs attention: ${descriptionFailure?.classification?.reason || 'Validation failed without an autonomous-safe repair.'}`
        )

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
              descriptionRetryExhausted: Boolean(descriptionFailure && descriptionRetryCount >= MAX_SERIES_DESCRIPTION_RETRIES),
              descriptionRetryCount,
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

      // ATL-PIPE-008: autonomous retry with structured classification
      if (!result.passed) {
        const MAX_RETRIES = 2
        const reportText = typeof result.report === 'string' ? result.report : JSON.stringify(result.report || '')
        const isCardCopy = result.isCardCopyFailure === true
        const classification = classifyValidateScriptFailure(reportText, isCardCopy)
        const retryCount = Number((lockedJob.state_json as any)?.validateScriptRetryCount ?? 0)
        const canAutoRetry = classification.isAutonomousRetryable && retryCount < MAX_RETRIES
        const playbook = getPlaybookByKind(classification.kind)

        // Fix A: Always record a learning incident with job_id, story_id, and context
        const { data: learningIncident } = await supabase
          .from('production_learning_events')
          .insert({
            job_id: lockedJob.id,
            story_id: result.storyId || lockedJob.story_id || null,
            series_id: lockedJob.series_id || null,
            series_title: (lockedJob.state_json as any)?.seriesTitle || null,
            episode_title: (lockedJob.state_json as any)?.episodeTitle || (lockedJob.state_json as any)?.storyTitle || null,
            stage: 'validate_script',
            failure_type: classification.kind,
            root_cause: reportText.slice(0, 500) || 'validate_script rejected generated script',
            fix_applied: canAutoRetry
              ? `Autonomous retry ${retryCount + 1}/${MAX_RETRIES}: cleared script, reset to generate_script`
              : `Autonomous retries exhausted (${retryCount}/${MAX_RETRIES}); Marc review required`,
            fix_type: canAutoRetry ? 'autonomous_retry' : 'marc_review_required',
            prevention_rule: classification.kind === 'script_description_blocked_word'
              ? 'Script generation must not produce DESCRIPTION with blocked past-tense words'
              : classification.kind === 'script_quality_editorial'
              ? 'DESCRIPTION must accurately reflect protagonist role; AI validator verifies match'
              : null,
            reusable: true,
            confidence: 0.85,
          })
          .select('id')
          .single()

        if (canAutoRetry) {
          const nextRetryCount = retryCount + 1

          // Clear story script so generate_script regenerates from scratch
          await supabase
            .from('stories')
            .update({
              script: null,
              script_json: null,
              validator_result: null,
              validator_report: null,
              status: 'draft',
            })
            .eq('id', result.storyId)

          const retryLogs = appendLog({ ...lockedJob, logs }, `Auto-retry ${nextRetryCount}/${MAX_RETRIES}: re-queuing to generate_script after ${classification.kind}`, {
            source: 'autonomous-runner',
            storyId: result.storyId,
            failureKind: classification.kind,
            retryCount: nextRetryCount,
            nextStep: NEXT_STEP_AFTER_CREATE,
            learningIncidentId: learningIncident?.id || null,
          })

          const { data: resetJob, error: updateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'queued',
              current_step: NEXT_STEP_AFTER_CREATE,
              state_json: {
                ...result.state,
                scriptGenerated: false,
                scriptGeneratedStoryId: null,
                validateScriptRetryCount: nextRetryCount,
                validateScriptLastFailureKind: classification.kind,
                validateScriptLastReport: reportText.slice(0, 500),
              },
              error_json: buildStructuredError(classification.kind, classification.recommendedAction, 'validate_script', {
                storyId: result.storyId,
                marc_required: false,
                autonomous_repair: true,
                retry_count: nextRetryCount,
                max_retries: MAX_RETRIES,
                safe_resume_point: 'generate_script',
                fixRecommendation: classification.recommendedAction,
                rootCause: reportText.slice(0, 300),
                detail: {
                  validatorResult: 'FAIL',
                  validatorReport: reportText.slice(0, 1000),
                  isCardCopyFailure: isCardCopy,
                  playbookId: playbook?.id || null,
                  learningIncidentId: learningIncident?.id || null,
                  recommended_action: classification.recommendedAction,
                  diagnostic_evidence: reportText.slice(0, 500),
                },
              }),
              locked_at: null,
              locked_by: null,
              logs: retryLogs,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (updateError) throw new Error(`Failed to reset standalone validation job for retry: ${updateError.message}`)

          return NextResponse.json({
            success: true,
            action: 'autonomous_retry',
            jobId: resetJob!.id,
            currentStep: step,
            nextStep: NEXT_STEP_AFTER_CREATE,
            retryCount: nextRetryCount,
            maxRetries: MAX_RETRIES,
            failureKind: classification.kind,
            marcRequired: false,
            storyId: result.storyId,
            learningIncidentId: learningIncident?.id || null,
            playbookId: playbook?.id || null,
            message: `Script validation failed (${classification.kind}). Autonomous retry ${nextRetryCount}/${MAX_RETRIES} — re-queuing to generate_script.`,
            logs: retryLogs,
          })
        }

        // Max retries exhausted or non-retryable: fail with marc_required=true
        await markStoryNeedsAttention(
          result.storyId,
          `Standalone validation needs attention: ${classification.kind}. ${classification.recommendedAction}`
        )

        const failedLogs = appendLog({ ...lockedJob, logs }, `validate_script retries exhausted (${retryCount}/${MAX_RETRIES}) — failing, Marc required`, {
          source: 'autonomous-runner',
          storyId: result.storyId,
          failureKind: classification.kind,
          retryCount,
          learningIncidentId: learningIncident?.id || null,
        })

        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_SCRIPT,
            state_json: {
              ...result.state,
              validateScriptRetryCount: retryCount,
              validateScriptLastFailureKind: classification.kind,
            },
            error_json: buildStructuredError(classification.kind, `Retries exhausted. ${classification.recommendedAction}`, 'validate_script', {
              storyId: result.storyId,
              marc_required: true,
              autonomous_repair: false,
              retry_count: retryCount,
              max_retries: MAX_RETRIES,
              safe_resume_point: 'generate_script',
              fixRecommendation: `${MAX_RETRIES} autonomous retries failed. Marc must review: ${classification.recommendedAction}`,
              rootCause: reportText.slice(0, 300),
              detail: {
                validatorResult: 'FAIL',
                validatorReport: reportText.slice(0, 1000),
                isCardCopyFailure: isCardCopy,
                playbookId: playbook?.id || null,
                learningIncidentId: learningIncident?.id || null,
                recommended_action: classification.recommendedAction,
                diagnostic_evidence: reportText.slice(0, 500),
              },
            }),
            logs: failedLogs,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to save standalone validation failure: ${updateError.message}`)

        return NextResponse.json({
          success: false,
          jobId: failedJob!.id,
          currentStep: step,
          status: failedJob!.status,
          storyId: result.storyId,
          validatorResult: 'FAIL',
          validatorReport: result.report,
          failureKind: classification.kind,
          marcRequired: true,
          retryCount,
          maxRetries: MAX_RETRIES,
          playbookId: playbook?.id || null,
          learningIncidentId: learningIncident?.id || null,
          logs: failedLogs,
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

      // ATL-PIPE-009: voice_preflight failure classification with autonomous retry
      if (!result.passed) {
        const MAX_RETRIES = 2
        
        // Classify failure type: narrator mismatch, unlabeled lines, or unknown
        const hasNarratorIssue = result.narratorIssues && result.narratorIssues.length > 0
        const hasUnlabeledLines = blockingReasons.some(r => /unlabeled.*line/i.test(r)) || (result.report as any)?.unlabeledLineCount > 0
        const unlabeledLineCount = (result.report as any)?.unlabeledLineCount || 0
        const unlabeledExamples = (result.report as any)?.examples || []
        
        let failureKind: StructuredErrorJsonKind = 'unknown_qc'
        let isAutonomousRetryable = false
        let recommendedAction = ''
        
        if (hasNarratorIssue) {
          failureKind = 'narrator_mismatch'
          isAutonomousRetryable = false  // narrator mismatch requires DB/manual fix, not retry
          recommendedAction = `Narrator mismatch: ${result.narratorIssues![0]}. Update NARRATOR header or narrator_voice_name in DB.`
        } else if (hasUnlabeledLines) {
          failureKind = 'script_unlabeled_lines'
          isAutonomousRetryable = true   // unlabeled lines are repairable via generate_script retry
          recommendedAction = `${unlabeledLineCount} unlabeled story body lines found. Re-generate script with HAL-SCRIPT-002 enforced: every line must start with NARRATOR: or CHARACTER NAME:.`
        }
        
        const retryCount = Number((lockedJob.state_json as any)?.voicePreflightScriptRetryCount ?? 0)
        const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES
        const firstBlocker = blockingReasons[0] || 'Voice preflight failed'
        
        // Always record learning incident
        const { data: learningIncident } = await supabase
          .from('production_learning_events')
          .insert({
            job_id: lockedJob.id,
            story_id: result.storyId || lockedJob.story_id || null,
            series_id: lockedJob.series_id || null,
            series_title: (lockedJob.state_json as any)?.seriesTitle || null,
            episode_title: (lockedJob.state_json as any)?.episodeTitle || (lockedJob.state_json as any)?.storyTitle || null,
            stage: 'voice_preflight',
            failure_type: failureKind,
            root_cause: firstBlocker,
            fix_applied: canAutoRetry
              ? `Autonomous retry ${retryCount + 1}/${MAX_RETRIES}: cleared script, reset to generate_script`
              : `${failureKind === 'narrator_mismatch' ? 'Manual DB fix required' : `Autonomous retries exhausted (${retryCount}/${MAX_RETRIES}); Marc review required`}`,
            fix_type: canAutoRetry ? 'autonomous_retry' : failureKind === 'narrator_mismatch' ? 'manual_fix' : 'marc_review_required',
            prevention_rule: failureKind === 'script_unlabeled_lines'
              ? 'HAL-SCRIPT-002: every prose line must begin with NARRATOR: or CHARACTER NAME:'
              : failureKind === 'narrator_mismatch'
              ? 'NARRATOR header must match narrator_voice_name in stories table or narrator_voices table'
              : null,
            reusable: true,
            confidence: 0.85,
          })
          .select('id')
          .single()
        
        // If unlabeled lines and retries available: autonomous retry
        if (canAutoRetry) {
          const nextRetryCount = retryCount + 1
          
          // Clear script so generate_script regenerates
          await supabase
            .from('stories')
            .update({
              script: null,
              script_json: null,
              validator_result: null,
              validator_report: null,
              status: 'draft',
            })
            .eq('id', result.storyId)
          
          const retryLogs = appendLog(lockedJob, `Auto-retry ${nextRetryCount}/${MAX_RETRIES}: unlabeled lines detected, re-queuing to generate_script`, {
            source: 'autonomous-runner',
            storyId: result.storyId,
            failureKind,
            unlabeledLineCount,
            retryCount: nextRetryCount,
            learningIncidentId: learningIncident?.id || null,
          })
          
          const { data: resetJob, error: updateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'queued',
              current_step: NEXT_STEP_AFTER_CREATE,
              state_json: {
                ...result.state,
                voicePreflightScriptRetryCount: nextRetryCount,
                scriptGenerated: false,
                scriptGeneratedStoryId: null,
                voicePreflightLastFailureKind: failureKind,
                voicePreflightUnlabeledCount: unlabeledLineCount,
              },
              error_json: buildStructuredError(failureKind, recommendedAction, step, {
                storyId: result.storyId,
                marc_required: false,
                autonomous_repair: true,
                retry_count: nextRetryCount,
                max_retries: MAX_RETRIES,
                safe_resume_point: 'generate_script',
                fixRecommendation: recommendedAction,
                rootCause: firstBlocker,
                detail: {
                  unlabeledLineCount,
                  examples: unlabeledExamples.slice(0, 3),
                  blockingReasons,
                  learningIncidentId: learningIncident?.id || null,
                },
              }),
              logs: retryLogs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()
          
          if (updateError) throw new Error(`Failed to reset voice_preflight job for retry: ${updateError.message}`)
          
          return NextResponse.json({
            success: true,
            action: 'autonomous_retry',
            jobId: resetJob!.id,
            currentStep: step,
            nextStep: NEXT_STEP_AFTER_CREATE,
            retryCount: nextRetryCount,
            maxRetries: MAX_RETRIES,
            failureKind,
            storyId: result.storyId,
            unlabeledLineCount,
            learningIncidentId: learningIncident?.id || null,
            logs: retryLogs,
          })
        }
        
        // No auto-retry: fail with structured error_json
        const errorJsonPayload = buildStructuredError(
          failureKind,
          failureKind === 'narrator_mismatch'
            ? `${recommendedAction}`
            : `${recommendedAction} (Retries exhausted: ${retryCount}/${MAX_RETRIES})`,
          step,
          {
            storyId: result.storyId,
            marc_required: failureKind !== 'narrator_mismatch',  // narrator can be DB-fixed by Atlas
            autonomous_repair: false,
            retry_count: retryCount,
            max_retries: failureKind === 'script_unlabeled_lines' ? MAX_RETRIES : undefined,
            safe_resume_point: failureKind === 'script_unlabeled_lines' ? 'generate_script' : undefined,
            fixRecommendation: recommendedAction,
            rootCause: firstBlocker,
            detail: {
              narratorIssues: result.narratorIssues,
              blockingReasons,
              unlabeledLineCount,
              examples: unlabeledExamples.slice(0, 3),
              learningIncidentId: learningIncident?.id || null,
            },
          }
        )
        const playbook = getPlaybookByKind(failureKind)

        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_RESOLUTION,
            state_json: {
              ...result.state,
              voicePreflightScriptRetryCount: retryCount,
              voicePreflightLastFailureKind: failureKind,
            },
            error_json: {
              ...errorJsonPayload,
              playbookId: playbook?.id || null,
              preflightReport: result.report,
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
          jobId: failedJob!.id,
          currentStep: step,
          status: failedJob!.status,
          storyId: result.storyId,
          failureKind,
          narratorIssues: result.narratorIssues,
          preflightReport: result.report,
          blockingReasons,
          unlabeledLineCount,
          unlabeledExamples,
          errorKind: errorJsonPayload.kind,
          playbookId: playbook?.id || null,
          retryCount,
          maxRetries: failureKind === 'script_unlabeled_lines' ? MAX_RETRIES : undefined,
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
        // Classify failure kind from the report message for structured error_json (INC-005/INC-010)
        const failureMsg = String(result.report?.error || result.report?.message || '').trim()
        const isTranscriptAmbiguous = /TRANSCRIPT_AMBIGUOUS/.test(failureMsg)
        const isNarratorMismatch = /narrator.*mismatch|NARRATOR.*not found/i.test(failureMsg)
        const isSilenceBuffer = /SILENCE_BUFFER|silence.*threshold/i.test(failureMsg)
        const failureKind = isTranscriptAmbiguous ? 'transcript_question_mark'
          : isNarratorMismatch ? 'narrator_mismatch'
          : isSilenceBuffer ? 'silence_buffer'
          : 'unknown_qc'
        const playbook = getPlaybookByKind(failureKind)

        // ── ATL-DIAG-001: Promote generate_voices failure details to top-level ──
        // Key fields (speaker, segment path, expected/detected text, retry
        // recommendation) were buried at detail.voiceGenerationReport.failures[0].
        // HAL-REPORT-001's extractErrorJsonFields() excluded 'unknown_qc' from
        // structured detection, causing Hal to report "empty details" even when
        // the full failure was present. Promote to top-level so any consumer
        // (Hal report, Command Center, alerting) can surface them without deep
        // traversal. INCIDENT-RULE-001: every known failure must become fast alert.
        const firstFailure: Record<string, any> =
          (result.report?.failures || [])[0] || {}
        const segName = firstFailure.segment
          || (result.segmentNumber != null
              ? `segment_${String(result.segmentNumber).padStart(4, '0')}.mp3`
              : null)
        const extractExpected = (msg: string) => {
          const m = msg.match(/expected\s+"([^"]+)"/)
          return m?.[1] ?? null
        }
        const extractDetected = (msg: string) => {
          const m = msg.match(/partial output\s+"([^"]+)"/)
          return m?.[1] ?? null
        }
        const diagFields = {
          // Identify exactly what failed
          failed_segment:       segName,
          failed_segment_path:  segName ? `asc3/${result.storyId}/${segName}` : null,
          failed_speaker:       firstFailure.speaker || null,
          failed_segment_type:  firstFailure.type   || null,
          // Text comparison — makes root cause visible without reading 3-level detail
          expected_text_excerpt: extractExpected(firstFailure.error || failureMsg || ''),
          detected_text_excerpt: extractDetected(firstFailure.error || failureMsg || ''),
          // Retry guidance
          retry_recommendation: failureKind === 'unknown_qc'
            ? 'unknown_qc: verify fix is deployed, then reset job to generate_voices. Segments 0000→(N-1) will be reused from storage.'
            : `See playbook ${playbook?.id || failureKind} for repair path.`,
          // Traceability
          story_title: (lockedJob.state_json as any)?.episodeTitle
            || (lockedJob.state_json as any)?.storyTitle
            || null,
          present_segment_count: result.report?.presentCount ?? null,
        }
        // ── END ATL-DIAG-001 ─────────────────────────────────────────────────

        const errorJsonPayload = buildStructuredError(
          failureKind,
          failureMsg || `Voice generation hard failure at segment ${result.segmentNumber}`,
          step,
          {
            storyId: result.storyId,
            segmentNumber: result.segmentNumber,
            marc_required: isTranscriptAmbiguous, // transcript "?" requires Marc; others are Atlas-fixable
            autonomous_repair: !isTranscriptAmbiguous,
            ...diagFields,
            detail: { voiceGenerationReport: result.report },
          }
        )
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_PREFLIGHT,
            // ATL-PIPE-018: Preserve critical preflight fields through generate_voices hard failures.
            // result.state spreads the incoming state, which should include voicePreflightPassed.
            // Belt-and-suspenders: if result.state somehow lost these fields (edge-case state
            // corruption), fall back to lockedJob.state_json values so a manual reset + retry
            // does not immediately fail with "Voice preflight must pass before generate_voices".
            state_json: {
              ...result.state,
              voicePreflightPassed: result.state.voicePreflightPassed
                ?? (lockedJob.state_json as Record<string, unknown>)?.voicePreflightPassed,
              voicePreflightStoryId: result.state.voicePreflightStoryId
                ?? (lockedJob.state_json as Record<string, unknown>)?.voicePreflightStoryId,
              voicePreflight: result.state.voicePreflight
                ?? (lockedJob.state_json as Record<string, unknown>)?.voicePreflight,
            },
            error_json: { ...errorJsonPayload, playbookId: playbook?.id || null },
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

        // RFR Sprint: classify defect before deciding whether to block or continue.
        // Advisory defects (hook quality, low specificity) log and advance.
        // Severe defects (missing title, placeholder, broken sentence) block and repair.
        if (isTextOnlyFailure) {
          const MAX_BELLE_RETRIES = 2
          const failureKind = classifyBelleIssues(issues)

          // Advisory bypass: non-severe defects advance to next step with a warning log.
          if (!isBelleSevereDefect(failureKind, issues)) {
            const advisoryLogs = appendLog(lockedJob, `Belle quality advisory (non-blocking): ${failureKind} — ${issues.join('; ')}`, {
              storyId: result.storyId,
              advisoryOnly: true,
              failureKind,
              issueCount: issues.length,
              nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION,
            })
            const { data: advisedJob, error: advErr } = await supabase
              .from('production_jobs')
              .update({
                story_id: result.storyId,
                status: 'running',
                current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION,
                step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
                state_json: {
                  ...result.state,
                  belleAssetValidation: {
                    ...result.state.belleAssetValidation,
                    status: 'advisory_passed',
                    advisoryOnly: true,
                  },
                  belleAdvisoryIssues: issues,
                  belleAdvisoryKind: failureKind,
                },
                error_json: null,
                logs: advisoryLogs,
                locked_at: null, locked_by: null,
              })
              .eq('id', lockedJob.id).select('*').single()
            if (advErr) throw new Error(`Advisory advance failed: ${advErr.message}`)
            return NextResponse.json({
              success: true,
              action: 'advisory_advance',
              jobId: advisedJob!.id,
              currentStep: step,
              nextStep: advisedJob!.current_step,
              storyId: result.storyId,
              advisoryIssues: issues,
              logs: advisoryLogs,
            })
          }

          const belleAssetRepairCount = Number((lockedJob.state_json as any)?.belleAssetRepairCount ?? 0)
          const playbook = getPlaybookByKind(failureKind)
          const canRepair = belleAssetRepairCount < MAX_BELLE_RETRIES

          const { data: learningIncident } = await supabase
            .from('production_learning_events')
            .insert({
              job_id: lockedJob.id,
              story_id: result.storyId || lockedJob.story_id || null,
              series_id: lockedJob.series_id || null,
              series_title: (lockedJob.state_json as any)?.seriesTitle || null,
              episode_title: (lockedJob.state_json as any)?.storyTitle || null,
              stage: 'validate_belle_assets',
              failure_type: failureKind,
              root_cause: issues.join('; '),
              fix_applied: canRepair
                ? `Autonomous repair ${belleAssetRepairCount + 1}/${MAX_BELLE_RETRIES}: routing to repair_belle_quality`
                : `Repair retries exhausted (${belleAssetRepairCount}/${MAX_BELLE_RETRIES}); Marc review required`,
              fix_type: canRepair ? 'autonomous_repair' : 'marc_review_required',
              prevention_rule: failureKind === 'belle_quality_hook_missing'
                ? 'BELLE_QUALITY_REPAIR_PROMPT: concrete hook required; hasConcreteNarrativeHook() expanded (ATL-PIPE-010)'
                : failureKind === 'belle_quality_title_missing'
                ? 'BELLE_QUALITY_REPAIR_PROMPT: story title must appear exactly as written'
                : null,
              reusable: true,
              confidence: 0.8,
            })
            .select('id')
            .single()

          if (canRepair) {
            const repairState = {
              ...result.state,
              belleAssetValidationFailed: true,
              belleAssetFailedReport: result.report,
              belleAssetRepairCount: belleAssetRepairCount + 1,
            }
            const repairErrorJson = buildStructuredError(failureKind, issues.join('; '), step, {
              storyId: result.storyId,
              marc_required: false,
              autonomous_repair: true,
              retry_count: belleAssetRepairCount + 1,
              max_retries: MAX_BELLE_RETRIES,
              safe_resume_point: 'repair_belle_quality',
              rootCause: issues.join('; '),
              fixRecommendation: `Routing to repair_belle_quality (attempt ${belleAssetRepairCount + 1}/${MAX_BELLE_RETRIES})`,
              detail: {
                issues,
                introText: result.report.introText ?? null,
                outroText: result.report.outroText ?? null,
                playbookId: playbook?.id || null,
                learningIncidentId: learningIncident?.id || null,
              },
            })
            const repairLogs = appendLog({ ...lockedJob, logs, current_step: step }, `Queued automatic Belle asset text repair (attempt ${belleAssetRepairCount + 1}/${MAX_BELLE_RETRIES})`, {
              storyId: result.storyId,
              nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
              failureKind,
              issueCount: issues.length,
              repairCount: belleAssetRepairCount + 1,
              learningIncidentId: learningIncident?.id || null,
            })
            const { data: repairJob, error: repairUpdateError } = await supabase
              .from('production_jobs')
              .update({
                story_id: result.storyId,
                status: 'running',
                current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
                state_json: repairState,
                error_json: repairErrorJson,
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
              action: 'autonomous_repair',
              jobId: repairJob!.id,
              currentStep: step,
              nextStep: repairJob!.current_step,
              storyId: result.storyId,
              failureKind,
              repairCount: belleAssetRepairCount + 1,
              belleAssetValidationReport: result.report,
              learningIncidentId: learningIncident?.id || null,
              logs: repairLogs,
            })
          }

          // Repair retries exhausted — fail terminally
          const exhaustedErrorJson = buildStructuredError(failureKind, `Belle asset repair exhausted (${belleAssetRepairCount}/${MAX_BELLE_RETRIES}): ${issues.join('; ')}`, step, {
            storyId: result.storyId,
            marc_required: true,
            autonomous_repair: false,
            retry_count: belleAssetRepairCount,
            max_retries: MAX_BELLE_RETRIES,
            safe_resume_point: 'generate_belle_assets',
            rootCause: issues.join('; '),
            fixRecommendation: 'Manually fix Belle intro text in script, delete stale Belle audio, reset job to generate_belle_assets.',
            detail: {
              issues,
              introText: result.report.introText ?? null,
              outroText: result.report.outroText ?? null,
              playbookId: playbook?.id || null,
              learningIncidentId: learningIncident?.id || null,
            },
          })
          const { data: exhaustedJob, error: exhaustedUpdateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'failed',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE,
              state_json: { ...result.state, belleAssetRepairCount },
              error_json: { ...exhaustedErrorJson, playbookId: playbook?.id || null },
              logs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (exhaustedUpdateError) throw new Error(`Failed to save Belle asset repair exhaustion: ${exhaustedUpdateError.message}`)

          return NextResponse.json({
            success: false,
            jobId: exhaustedJob!.id,
            currentStep: step,
            status: exhaustedJob!.status,
            storyId: result.storyId,
            failureKind,
            marcRequired: true,
            repairCount: belleAssetRepairCount,
            belleAssetValidationReport: result.report,
            logs,
          }, { status: 422 })
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
        const qcFailureKind = classifyBelleIssues(result.report.issues || [])
        const qcErrorJson = buildStructuredError(qcFailureKind || 'belle_quality_unknown', result.report.issues?.join('; ') || 'Belle asset QC failure', step, {
          storyId: result.storyId,
          marc_required: true,
          autonomous_repair: false,
          rootCause: result.report.issues?.join('; ') || 'Audio/transcript QC failure — cannot auto-repair',
          fixRecommendation: issuesByField.intro.length > 0 || issuesByField.outro.length > 0
            ? 'Text-rule violation: route to repair_belle_quality to rewrite the offending Belle line(s).'
            : 'Asset missing or unknown issue: regenerate Belle assets via generate_belle_assets.',
          detail: {
            assetPaths: { intro: introAssetPaths, outro: outroAssetPaths },
            expectedIntroText: result.report.introText ?? null,
            expectedOutroText: result.report.outroText ?? null,
            issuesByField,
          },
        })
        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE,
            state_json: result.state,
            error_json: qcErrorJson,
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
          jobId: failedJob!.id,
          currentStep: step,
          status: failedJob!.status,
          storyId: result.storyId,
          failureKind: qcFailureKind,
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
        // RFR Sprint: classify LLM issues as severe vs advisory before deciding to block.
        const llmIssues = Array.isArray(result.report.issues) ? result.report.issues : []
        const llmKind = classifyBelleIssues(llmIssues)
        const isLlmSevere = isBelleSevereDefect(llmKind, llmIssues)

        // Advisory bypass: non-severe LLM issues log and advance without repair cycle.
        if (!isLlmSevere) {
          const advisoryLogs = appendLog(lockedJob, `Belle quality advisory (non-blocking): LLM score ${result.report.introScore ?? '?'}/10 — ${llmIssues.join('; ')}`, {
            storyId: result.storyId,
            advisoryOnly: true,
            llmKind,
            introScore: result.report.introScore,
            outroScore: result.report.outroScore,
            nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY,
          })
          const { data: advisedJob, error: advErr } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'running',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_QUALITY,
              step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
              state_json: { ...result.state, belleQualityAdvisory: { kind: llmKind, issues: llmIssues, introScore: result.report.introScore } },
              error_json: null,
              logs: advisoryLogs,
              locked_at: null, locked_by: null,
            })
            .eq('id', lockedJob.id).select('*').single()
          if (advErr) throw new Error(`Belle quality advisory advance failed: ${advErr.message}`)
          return NextResponse.json({
            success: true,
            action: 'advisory_advance',
            jobId: advisedJob!.id,
            currentStep: step,
            nextStep: advisedJob!.current_step,
            storyId: result.storyId,
            advisoryIssues: llmIssues,
            introScore: result.report.introScore,
            logs: advisoryLogs,
          })
        }

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
        // ATL-PIPE-010: structured Belle repair failure with retry logic, learning incident, playbook
        const MAX_BELLE_REPAIR_RETRIES = 2
        const state = lockedJob.state_json && typeof lockedJob.state_json === 'object' ? lockedJob.state_json : {}
        const storyId = lockedJob.story_id || (state as any).storyId
        const repairAttempts = Number(((state as any).belleQualityRepair as Record<string, unknown>)?.attempts ?? 0)
        const isAssetRepair = (state as any).belleAssetValidationFailed === true
        const errMessage = err instanceof Error ? err.message : String(err)
        const isAttemptLimit = /attempt limit reached/i.test(errMessage)

        const failureKind = classifyBelleRepairError(errMessage)
        const playbook = getPlaybookByKind(failureKind)
        const canRetry = !isAttemptLimit && repairAttempts < MAX_BELLE_REPAIR_RETRIES

        // Always record learning incident
        const { data: learningIncident } = await supabase
          .from('production_learning_events')
          .insert({
            job_id: lockedJob.id,
            story_id: storyId ? String(storyId) : null,
            series_id: lockedJob.series_id || null,
            series_title: (lockedJob.state_json as any)?.seriesTitle || null,
            episode_title: (lockedJob.state_json as any)?.storyTitle || null,
            stage: 'repair_belle_quality',
            failure_type: failureKind,
            root_cause: errMessage.slice(0, 500),
            fix_applied: canRetry
              ? `Autonomous retry ${repairAttempts + 1}/${MAX_BELLE_REPAIR_RETRIES}: re-queuing repair`
              : 'Repair retries exhausted; Marc review required',
            fix_type: canRetry ? 'autonomous_retry' : 'marc_review_required',
            prevention_rule: 'BELLE_QUALITY_REPAIR_PROMPT updated: announcement must include title and concrete hook, with no listener name (ATL-PIPE-010)',
            reusable: true,
            confidence: 0.75,
          })
          .select('id')
          .single()

        const logs = appendLog(lockedJob, `Standalone Belle quality repair failed (attempt ${repairAttempts + 1}/${MAX_BELLE_REPAIR_RETRIES})`, {
          storyId: storyId ? String(storyId) : null,
          error: errMessage,
          repairAttempts,
          failureKind,
          canRetry,
        })

        if (canRetry) {
          const nextAttempts = repairAttempts + 1
          const retryState = {
            ...state,
            belleQualityRepair: {
              ...((state as any).belleQualityRepair || {}),
              attempts: nextAttempts,
              lastError: errMessage.slice(0, 300),
              lastErrorAt: nowIso(),
              failureKind,
              learningIncidentId: learningIncident?.id || null,
            },
          }
          const retryErrorJson = buildStructuredError(failureKind, errMessage, step, {
            storyId: storyId ? String(storyId) : null,
            marc_required: false,
            autonomous_repair: true,
            retry_count: nextAttempts,
            max_retries: MAX_BELLE_REPAIR_RETRIES,
            safe_resume_point: 'repair_belle_quality',
            rootCause: errMessage.slice(0, 300),
            fixRecommendation: `Re-queuing repair attempt ${nextAttempts}/${MAX_BELLE_REPAIR_RETRIES}`,
            detail: {
              repairAttempts: nextAttempts,
              isAssetRepair,
              playbookId: playbook?.id || null,
              learningIncidentId: learningIncident?.id || null,
            },
          })
          const retryLogs = appendLog({ ...lockedJob, logs }, `Auto-retry ${nextAttempts}/${MAX_BELLE_REPAIR_RETRIES}: re-queuing Belle repair`, {
            storyId: storyId ? String(storyId) : null,
            failureKind,
            nextAttempts,
          })
          const { data: retryJob, error: retryUpdateError } = await supabase
            .from('production_jobs')
            .update({
              status: 'queued',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
              state_json: retryState,
              error_json: retryErrorJson,
              logs: retryLogs,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (retryUpdateError) throw new Error(`Failed to re-queue Belle repair: ${retryUpdateError.message}`)

          return NextResponse.json({
            success: true,
            action: 'autonomous_retry',
            jobId: retryJob!.id,
            currentStep: step,
            nextStep: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
            storyId: storyId ? String(storyId) : null,
            failureKind,
            repairAttempts: nextAttempts,
            learningIncidentId: learningIncident?.id || null,
            logs: retryLogs,
          })
        }

        // Terminal failure
        const relevantReport = isAssetRepair
          ? ((state as any).belleAssetFailedReport || (state as any).belleQualityFailedReport || null)
          : ((state as any).belleQualityFailedReport || (state as any).belleQualityValidation || null)
        const terminalErrorJson = buildStructuredError(failureKind, `Belle repair exhausted (${repairAttempts}/${MAX_BELLE_REPAIR_RETRIES}): ${errMessage}`, step, {
          storyId: storyId ? String(storyId) : null,
          marc_required: true,
          autonomous_repair: false,
          retry_count: repairAttempts,
          max_retries: MAX_BELLE_REPAIR_RETRIES,
          safe_resume_point: 'generate_belle_assets',
          rootCause: errMessage.slice(0, 300),
          fixRecommendation: 'Manually fix Belle intro/outro in script, delete stale Belle audio, reset job to generate_belle_assets.',
          detail: {
            repairAttempts,
            isAttemptLimit,
            isAssetRepair,
            repairType: isAssetRepair ? 'asset_text_rule' : 'quality_validation',
            expectedIntroText: (relevantReport as any)?.introText ?? null,
            expectedOutroText: (relevantReport as any)?.outroText ?? null,
            diffSummary: Array.isArray((relevantReport as any)?.issues)
              ? ((relevantReport as any).issues as string[]).join('; ')
              : errMessage,
            playbookId: playbook?.id || null,
            learningIncidentId: learningIncident?.id || null,
          },
        })

        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
            error_json: { ...terminalErrorJson, playbookId: playbook?.id || null },
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
          jobId: failedJob!.id,
          currentStep: step,
          status: failedJob!.status,
          storyId: storyId ? String(storyId) : null,
          failureKind,
          marcRequired: true,
          repairAttempts,
          error: errMessage,
          learningIncidentId: learningIncident?.id || null,
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
          const belleRetryTarget = seriesBelleRetryTarget(result)
          if (belleRetryTarget) {
            const persistedPackage = lockedJob.state_json?.seriesCompleteStoryPackage &&
              typeof lockedJob.state_json.seriesCompleteStoryPackage === 'object'
                ? lockedJob.state_json.seriesCompleteStoryPackage
                : {}
            const persistedBelleRetry = persistedPackage.belleRetry &&
              typeof persistedPackage.belleRetry === 'object'
                ? persistedPackage.belleRetry
                : {}
            const byEpisode = persistedBelleRetry.byEpisode &&
              typeof persistedBelleRetry.byEpisode === 'object'
                ? persistedBelleRetry.byEpisode
                : {}
            const currentRetry = Number(byEpisode[belleRetryTarget.storyId]?.count || 0)

            if (currentRetry < MAX_SERIES_BELLE_RETRIES) {
              const { data: targetStory, error: targetStoryError } = await supabase
                .from('stories')
                .select('id,title,description,script,series_id,series_name,episode_number,series_total_episodes,series_is_finale')
                .eq('id', belleRetryTarget.storyId)
                .single()
              if (targetStoryError || !targetStory?.script) {
                throw new Error(targetStoryError?.message || `Belle retry target story missing script: ${belleRetryTarget.storyId}`)
              }

              const seriesEpisodes = result.seriesId ? await loadSeriesEpisodes(String(result.seriesId)) : []
              const nextEpisode = seriesEpisodes.find((episode: any) =>
                episodeNumber(episode, 0) === Number(targetStory.episode_number || 0) + 1
              ) || null

              const repaired = await regenerateSeriesBelleFromFeedback(targetStory, belleRetryTarget, nextEpisode, model)
              let repairedScript = String(targetStory.script || '')
              if (belleRetryTarget.repairIntro) repairedScript = replaceBelleSection(repairedScript, 'intro', repaired.introText)
              if (belleRetryTarget.repairOutro) repairedScript = replaceBelleSection(repairedScript, 'outro', repaired.outroText)

              const validation = await validateIntroOutroPositionRules(
                { ...targetStory, script: repairedScript },
                extractBelleSection(repairedScript, 'intro'),
                extractBelleSection(repairedScript, 'outro')
              )
              if (!validation.passed) {
                const validationIntroText = extractBelleSection(repairedScript, 'intro')
                const validationOutroText = extractBelleSection(repairedScript, 'outro')
                const retryValidationError = new Error(`Belle retry produced invalid copy: ${validation.issues.join('; ')}`)
                ;(retryValidationError as Error & { structuredErrorDetail?: unknown }).structuredErrorDetail = {
                  kind: 'series_belle_retry_validation_failed',
                  seriesId: result.seriesId || lockedJob.series_id,
                  storyId: belleRetryTarget.storyId,
                  episodeNumber: belleRetryTarget.episodeNumber,
                  issues: validation.issues,
                  repairedIntroText: belleRetryTarget.repairIntro ? repaired.introText : null,
                  repairedOutroText: belleRetryTarget.repairOutro ? repaired.outroText : null,
                  validationIntroText,
                  validationOutroText,
                  normalizedNarrativeHookIntro: normalizeNarrativeHookText(validationIntroText),
                  detectedNarrativeHookCategory: detectNarrativeHookCategory(validationIntroText),
                }
                throw retryValidationError
              }

              const deletedBelleFiles = await deleteBelleAudioFiles(
                belleRetryTarget.storyId,
                belleRetryTarget.repairIntro,
                belleRetryTarget.repairOutro
              )

              const storyUpdates: Record<string, unknown> = {
                script: repairedScript,
                audio_url: null,
                story_audio_url: null,
                outro_with_music_url: null,
                ...(belleRetryTarget.repairIntro ? {
                  announcement_text: repaired.introText,
                  announcement_url: null,
                } : {}),
                ...(belleRetryTarget.repairOutro ? {
                  outro_text: repaired.outroText,
                  outro_audio_url: null,
                } : {}),
              }

              const { error: repairUpdateError } = await supabase
                .from('stories')
                .update(storyUpdates)
                .eq('id', belleRetryTarget.storyId)
              if (repairUpdateError) {
                throw new Error(`Failed to save repaired Belle copy: ${repairUpdateError.message}`)
              }

              const retryCount = currentRetry + 1
              const epKey = String(belleRetryTarget.episodeNumber || belleRetryTarget.storyId)
              const nextBelleDoneByEp = {
                ...(result.state.seriesBelleGeneration?.doneByEp || {}),
                [epKey]: false,
              }
              const nextRenderDoneByEp = {
                ...(result.state.seriesRenderFinalMix?.doneByEp || {}),
                [epKey]: false,
              }
              const nextPackageDoneByEp = {
                ...(result.state.seriesCompleteStoryPackage?.doneByEp || {}),
                [epKey]: false,
              }

              const retryState = {
                ...result.state,
                seriesBelleGeneration: {
                  ...(result.state.seriesBelleGeneration || {}),
                  doneByEp: nextBelleDoneByEp,
                  allDone: false,
                  lastUpdatedAt: nowIso(),
                },
                seriesRenderFinalMix: {
                  ...(result.state.seriesRenderFinalMix || {}),
                  doneByEp: nextRenderDoneByEp,
                  allDone: false,
                  lastUpdatedAt: nowIso(),
                },
                seriesCompleteStoryPackage: {
                  ...(result.state.seriesCompleteStoryPackage || {}),
                  doneByEp: nextPackageDoneByEp,
                  failedEpisode: null,
                  failureReason: null,
                  contentIssues: null,
                  allDone: false,
                  belleRetry: {
                    ...persistedBelleRetry,
                    byEpisode: {
                      ...byEpisode,
                      [belleRetryTarget.storyId]: {
                        count: retryCount,
                        max: MAX_SERIES_BELLE_RETRIES,
                        episodeNumber: belleRetryTarget.episodeNumber,
                        issues: belleRetryTarget.issues,
                        repairedIntro: belleRetryTarget.repairIntro ? repaired.introText : null,
                        repairedOutro: belleRetryTarget.repairOutro ? repaired.outroText : null,
                        deletedBelleFiles,
                        lastRetriedAt: nowIso(),
                      },
                    },
                  },
                  lastUpdatedAt: nowIso(),
                },
              }

              const retryLogs = appendLog({ ...lockedJob, logs }, `Auto-retry ${retryCount}/${MAX_SERIES_BELLE_RETRIES}: repaired Belle copy for EP${belleRetryTarget.episodeNumber}`, {
                seriesId: result.seriesId || lockedJob.series_id,
                storyId: belleRetryTarget.storyId,
                episodeNumber: belleRetryTarget.episodeNumber,
                issues: belleRetryTarget.issues,
                deletedBelleFiles,
              })

              const { data: retryJob, error: retryUpdateError } = await supabase
                .from('production_jobs')
                .update({
                  status: 'queued',
                  current_step: NEXT_STEP_AFTER_SERIES_VOICES,
                  state_json: retryState,
                  error_json: {
                    step,
                    action: 'series_belle_retry',
                    retryCount,
                    maxRetries: MAX_SERIES_BELLE_RETRIES,
                    seriesId: result.seriesId || lockedJob.series_id,
                    repairedStoryId: belleRetryTarget.storyId,
                    repairedEpisodeNumber: belleRetryTarget.episodeNumber,
                    issues: belleRetryTarget.issues,
                    deletedBelleFiles,
                    at: nowIso(),
                  },
                  logs: retryLogs,
                  locked_at: null,
                  locked_by: null,
                })
                .eq('id', lockedJob.id)
                .select('*')
                .single()
              if (retryUpdateError) throw new Error(`Failed to queue series Belle retry: ${retryUpdateError.message}`)

              return NextResponse.json({
                success: true,
                action: 'series_belle_retry',
                jobId: retryJob.id,
                currentStep: step,
                nextStep: NEXT_STEP_AFTER_SERIES_VOICES,
                retryCount,
                maxRetries: MAX_SERIES_BELLE_RETRIES,
                seriesId: result.seriesId || lockedJob.series_id,
                repairedStoryId: belleRetryTarget.storyId,
                repairedEpisodeNumber: belleRetryTarget.episodeNumber,
                deletedBelleFiles,
                logs: retryLogs,
              })
            }
          }

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

        const finalizationAt = nowIso()
        const episodeStoryIds = (result.episodes || [])
          .map((episode: any) => String(episode.storyId || '').trim())
          .filter(Boolean)
        const { data: episodeWorkflowRows, error: episodeWorkflowError } = episodeStoryIds.length
          ? await supabase
              .from('stories')
              .select('id,workflow_state')
              .in('id', episodeStoryIds)
          : { data: [], error: null }

        if (episodeWorkflowError) {
          throw new Error(`Failed to load series episode workflow states: ${episodeWorkflowError.message}`)
        }

        const PROMOTABLE_STATES = new Set(['', 'stories_in_queue'])
        const episodeIdsToPromote = ((episodeWorkflowRows || []) as any[])
          .filter((story) => PROMOTABLE_STATES.has(String(story.workflow_state || '').trim()))
          .map((story) => story.id)

        if (episodeIdsToPromote.length > 0) {
          const { error: episodeWorkflowUpdateError } = await supabase
            .from('stories')
            .update({
              workflow_state: 'ready_for_review',
              workflow_state_changed_by: 'autonomous-runner',
              workflow_state_changed_at: finalizationAt,
              workflow_state_change_reason: `Series package ${lockedJob.id} completed and auto-finalized to ready_for_review.`,
            })
            .in('id', episodeIdsToPromote)
          if (episodeWorkflowUpdateError) {
            throw new Error(`Failed to mark series episodes ready_for_review: ${episodeWorkflowUpdateError.message}`)
          }
        }

        const completedLogs = appendLog(lockedJob, 'Series package complete — auto-finalized to Ready for Review', {
          seriesId: result.seriesId || lockedJob.series_id,
          episodeCount: episodeStoryIds.length,
          promotedEpisodeCount: episodeIdsToPromote.length,
          promotedEpisodeIds: episodeIdsToPromote,
        })

        const { data: updatedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            status: 'complete',
            current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
            step_index: Math.max(Number(lockedJob.step_index || 0), 0) + 1,
            state_json: result.state,
            error_json: null,
            logs: completedLogs,
            completed_at: finalizationAt,
            locked_at: null,
            locked_by: null,
          })
          .eq('id', lockedJob.id)
          .select('*')
          .single()

        if (updateError) throw new Error(`Failed to advance series package completion job: ${updateError.message}`)

        return NextResponse.json({
          success: true,
          action: 'series_ready_for_review_complete',
          jobId: updatedJob.id,
          currentStep: step,
          nextStep: updatedJob.current_step,
          status: updatedJob.status,
          seriesId: result.seriesId || lockedJob.series_id,
          processedEpisodes: result.processedEpisodes,
          promotedEpisodeIds: episodeIdsToPromote,
          seriesCompleteStoryPackage: result.state.seriesCompleteStoryPackage,
          logs: completedLogs,
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
      const MAX_RFR_RETRIES = 2
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
        // ATL-PIPE-012: classify RFR issues and attempt autonomous repair for narrator-missing
        const issueClassification = classifyRfrIssues(result.contentIssues || [])
        const rfrRepairAttempts = Number((lockedJob.state_json as any)?.rfrOutroNarratorRepair?.attempts ?? 0)
        const canRetry = issueClassification.kind === 'rfr_outro_narrator_missing' && rfrRepairAttempts < MAX_RFR_RETRIES

        if (canRetry) {
          // Route to repair_belle_quality with narrator context
          const rfrRepairState = {
            ...(lockedJob.state_json || {}),
            storyId: result.storyId,
            isRfrOutroRepair: true,
            rfrOutroNarratorRepair: {
              attempts: rfrRepairAttempts + 1,
              narratorName: issueClassification.narratorName,
              issue: result.contentIssues?.[0] || `standalone outro must name the narrator "${issueClassification.narratorName}"`,
              failedAt: nowIso(),
            },
            belleQualityFailedReport: {
              issues: result.contentIssues || [],
            },
          }

          const logs2 = appendLog(lockedJob, `Routing to autonomous repair: ${issueClassification.kind} (attempt ${rfrRepairAttempts + 1}/${MAX_RFR_RETRIES})`, {
            storyId: result.storyId,
            failureKind: issueClassification.kind,
            narratorName: issueClassification.narratorName,
            issues: result.contentIssues,
          })

          const { data: routedJob, error: updateError } = await supabase
            .from('production_jobs')
            .update({
              story_id: result.storyId,
              status: 'running',
              current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_REPAIR,
              state_json: rfrRepairState,
              error_json: buildStructuredError(issueClassification.kind, `RFR gate: ${result.contentIssues?.[0] || 'unknown issue'}`, step, {
                marc_required: false,
                detail: { retry_count: rfrRepairAttempts + 1, max_retries: MAX_RFR_RETRIES, action: 'autonomous_repair', safe_resume_point: 'repair_belle_quality' },
              }),
              logs: logs2,
              locked_at: null,
              locked_by: null,
            })
            .eq('id', lockedJob.id)
            .select('*')
            .single()

          if (updateError) throw new Error(`Failed to route ready-for-review failure to repair: ${updateError.message}`)

          // Record learning incident for RFR narrator repair
          await recordProductionLearningEvent(supabase, {
            job_id: lockedJob.id,
            story_id: result.storyId,
            series_id: lockedJob.series_id,
            series_title: (lockedJob.state_json as any)?.seriesTitle || null,
            episode_title: (lockedJob.state_json as any)?.episodeTitle || null,
            stage: 'ready_for_review',
            failure_type: issueClassification.kind,
            root_cause: `Standalone outro missing narrator credit: "${issueClassification.narratorName}"`,
            fix_type: 'autonomous_repair',
            fix_applied: `Routing to repair_belle_quality (attempt ${rfrRepairAttempts + 1}/${MAX_RFR_RETRIES})`,
            prevention_rule: 'BELLE_QUALITY_REPAIR_PROMPT updated to require narrator credit; buildStandaloneScriptPrompt template updated',
            reusable: true,
            confidence: 0.95,
          }).catch(() => {})

          return NextResponse.json({
            success: false,
            jobId: routedJob.id,
            currentStep: step,
            nextStep: routedJob.current_step,
            status: routedJob.status,
            storyId: result.storyId,
            issueClassification,
            routedToRepair: true,
            logs: logs2,
          }, { status: 422 })
        }

        // Not retryable — fail with structured error
        const failureKind = issueClassification.kind === 'rfr_outro_narrator_missing'
          ? 'rfr_outro_narrator_missing'
          : issueClassification.kind
        const failureMessage = result.contentIssues?.[0] || `RFR gate failed: ${issueClassification.kind}`

        const { data: failedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            story_id: result.storyId,
            status: 'failed',
            current_step: NEXT_STEP_AFTER_STANDALONE_PACKAGE,
            state_json: result.state,
            error_json: buildStructuredError(failureKind, failureMessage, step, {
              marc_required: true,
              detail: {
                playbookId: failureKind === 'rfr_outro_narrator_missing' ? 'pb-rfr-outro-narrator-missing' : `pb-${failureKind}`,
                missingFields: result.missingFields,
                contentIssues: result.contentIssues,
                retry_exhausted: rfrRepairAttempts >= MAX_RFR_RETRIES,
                max_retries: MAX_RFR_RETRIES,
              },
            }),
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
          issueClassification,
          retryExhausted: rfrRepairAttempts >= MAX_RFR_RETRIES,
          logs,
        }, { status: 422 })
      }

      const completedAt = nowIso()

      // ── ATL-PIPE-014: Auto-promote story on RFR success ───────────────────
      // The Review tab queries workflow_state, so a review-ready story is
      // is_hidden=true — hidden from the public app, visible to Marc in the
      // admin Review tab.
      // This satisfies Marc's M-1 rule: no manual visibility correction allowed.
      // ORION-GOV-006 compliant: audit fields set, audit row written.
      let storyPromotionStatus: 'ok' | 'skipped' | 'error' = 'skipped'
      if (result.storyId) {
        const { error: promoErr } = await supabase
          .from('stories')
          .update({
            workflow_state: 'ready_for_review',
            is_hidden: true,
            workflow_state_changed_by: 'autonomous-runner',
            workflow_state_changed_at: completedAt,
            workflow_state_change_reason: `Pipeline job ${lockedJob.id} completed all 14 steps autonomously. Auto-promoted by ATL-PIPE-014.`,
          })
          .eq('id', result.storyId)

        if (promoErr) {
          console.error(`[ready_for_review] ATL-PIPE-014 story promotion failed for ${result.storyId}: ${promoErr.message}`)
          storyPromotionStatus = 'error'
        } else {
          storyPromotionStatus = 'ok'
          // Write ORION-GOV-006 audit row (best-effort — do not fail RFR if this errors)
          await supabase
            .from('story_workflow_audit')
            .insert({
              story_id: result.storyId,
              from_state: null,
              to_state: 'ready_for_review',
              changed_by: 'autonomous-runner',
              changed_at: completedAt,
              reason: `ATL-PIPE-014: Pipeline job ${lockedJob.id} completed all 14 steps autonomously. Auto-promoted to ready_for_review.`,
              session_context: lockedJob.id,
            })
            .then(({ error: auditErr }) => {
              if (auditErr) console.warn(`[ready_for_review] ATL-PIPE-014 audit row insert failed (non-fatal): ${auditErr.message}`)
            })
        }
      }
      // ── END ATL-PIPE-014 ──────────────────────────────────────────────────

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
        storyPromotionStatus,
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

      await clearLock(lockedJob.id, lockHolderId)
    }
  }
}
