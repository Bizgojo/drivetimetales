import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicCall } from '@/app/lib/anthropic-logger'
import { buildNamePalettePromptBlock } from '@/lib/story/namePalette'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const WORKER_ID = `run-next:${process.pid}`
const LOCK_STALE_MS = 10 * 60 * 1000
const NEXT_STEP_AFTER_CREATE = 'generate_script'
const NEXT_STEP_AFTER_STANDALONE_SCRIPT = 'validate_script'
const NEXT_STEP_AFTER_STANDALONE_VALIDATION = 'voice_preflight'
const NEXT_STEP_AFTER_STANDALONE_PREFLIGHT = 'generate_voices'
const NEXT_STEP_AFTER_STANDALONE_VOICES = 'generate_belle_assets'
const NEXT_STEP_AFTER_STANDALONE_BELLE = 'validate_belle_assets'
const NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION = 'generate_music'
const NEXT_STEP_AFTER_STANDALONE_MUSIC = 'render_final_mix'
const NEXT_STEP_AFTER_STANDALONE_RENDER = 'complete_story_package'
const NEXT_STEP_AFTER_STANDALONE_PACKAGE = 'ready_for_review'
const NEXT_STEP_AFTER_SERIES_CREATE = 'generate_episode_script'
const NEXT_STEP_AFTER_SERIES_SCRIPTS = 'score_validate_package'
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
    if (DESCRIPTION_PAST_TENSE_RE.test(description)) {
      issues.push('DESCRIPTION contains forbidden past-tense story-card phrasing.')
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

function validateBelleText(kind: 'intro' | 'outro', text: string, options: { standalone: boolean }) {
  const issues: string[] = []
  const lower = text.toLowerCase()
  const wordCount = countWords(text)
  const sentenceCount = (text.match(/[.!?]+/g) || []).length
  const withoutPunctuation = text.replace(/[.!?]+$/g, '').trim()

  if (!text) issues.push(`${kind} text is required.`)
  if (text && wordCount < 4) issues.push(`${kind} text is too short.`)
  if (text && !/[.!?]$/.test(text)) issues.push(`${kind} text appears incomplete; it must end with punctuation.`)
  if (/\b(welcome|begins now|only on endless tales|sponsored by|stay tuned)\b/i.test(text)) {
    issues.push(`${kind} uses forbidden host or promotional language.`)
  }
  if (/\bbelle b\b/i.test(text)) issues.push(`${kind} must say Belle, not Belle B.`)
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

Return exactly one of these:
✅ VALIDATOR RESULT: PASS
Script is cleared for production.

or

❌ VALIDATOR RESULT: FAIL
Do not send to production. Fix the following before resubmitting:
- [specific issue]

Be specific.
`

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
  const categoryPayload: Record<string, any> = { ...payload, category: payload.genre }
  delete categoryPayload.genre

  const genrePayload = { ...payload }

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
    .select('id,title,author,author_style,genre,narrative_voice,description,brief_json,status,script,script_json,script_version,series_id,series_name,episode_number,series_episode_number,series_total_episodes,series_is_finale,story_type')
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

Use the CURRENT published rules:
- Belle B is the only announcer voice.
- Belle B is never labeled ANNOUNCER or SANDY.
- Belle B intro must include exactly one [LISTENER_NAME] placeholder. Do not include the listener's actual name.
- Belle B intro/outro must never use "Tonight" or any time-of-day reference.
- Belle B intro must never mention the author, narrator, or "an Endless Tales original"; those credits belong only in the Belle B outro.
- No SFX in the published story body.
- The title may be blank in the brief; if blank, choose the best title from the story.
- Final title must be 1 to 5 words and 28 characters or fewer so it fits one line on story cards.
- Output ONLY the script. No commentary.

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
  const wordCount = countWords(generatedTitle)

  if (!script) throw new Error('Claude returned an empty script')
  if (!generatedTitle || wordCount < 1 || wordCount > 5) {
    throw new Error(`Generated title must be 1 to 5 words. Got: "${generatedTitle}"`)
  }

  const scriptJson = {
    generated_title: generatedTitle,
    model,
    generated_at: nowIso(),
    raw_script: generatedScript,
    normalized_description: description,
    production_job_id: job.id,
  }

  const { data: updated, error: updateError } = await supabase
    .from('stories')
    .update({
      title: generatedTitle,
      description,
      script,
      script_json: scriptJson,
      status: 'script_drafted',
      script_version: (story.script_version || 1) + 1,
    })
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

  return {
    generated: true,
    storyId: String(updated.id),
    story: updated,
    state: {
      ...state,
      storyId: String(updated.id),
      storyTitle: updated.title,
      storyStatus: updated.status,
      description,
      hasScript: true,
      generateScriptSkipped: false,
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

async function runStandaloneVoicePreflight(job: ProductionJob, origin: string) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const storyId = job.story_id || state.storyId
  if (!storyId) throw new Error('Standalone job is missing story_id')

  if (state.voicePreflightPassed === true && state.voicePreflightStoryId === String(storyId)) {
    return {
      passed: true,
      skipped: true,
      storyId: String(storyId),
      report: state.voicePreflight || {
        success: true,
        preflightOnly: true,
        skipped: true,
      },
      state,
    }
  }

  const endpoint = `${origin}/api/admin/generate-voices`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId,
      preflightOnly: true,
    }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/admin/generate-voices') as VoicePreflightResult
  const passed = response.ok && report.success === true

  return {
    passed,
    skipped: false,
    storyId: String(storyId),
    report,
    state: {
      ...state,
      storyId: String(storyId),
      voicePreflightPassed: passed,
      voicePreflightStoryId: String(storyId),
      voicePreflight: report,
      voicePreflightAt: nowIso(),
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
    .select('id,script,story_type,series_id,series_total_episodes')
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
    ...validateBelleText('intro', introText, { standalone }),
    ...validateBelleText('outro', outroText, { standalone }),
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

  const response = await fetch(`${origin}/api/asc3/render-final-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
  })
  const report = await readJsonOrDiagnostic(response, '/api/asc3/render-final-mix')
  const finalAudioUrl = String(report?.finalAudioUrl || '').trim()
  const storyBodyUrl = String(report?.storyBodyUrl || '').trim()
  const durationSecs = Number(report?.durationSecs || 0)
  const success = response.ok && report?.success === true && Boolean(finalAudioUrl) && Boolean(storyBodyUrl)

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
  const renderComplete = String(state.renderFinalMix?.status || '').trim() === 'complete'
  if (
    !renderComplete &&
    (!audioUrl || audioUrl.startsWith('pending:') || !storyAudioUrl || storyAudioUrl.startsWith('pending:'))
  ) {
    throw new Error('Final mix outputs must exist before complete_story_package')
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
    .select('id,status,is_hidden,published_on,audio_url,story_audio_url,cover_url,prose_text')
    .eq('id', storyId)
    .single()

  if (error || !story) throw new Error(error?.message || 'Story not found')

  const missingFields = missingReadyForReviewFields(story)
  const success = missingFields.length === 0

  return {
    success,
    storyId: String(storyId),
    missingFields,
    story,
    state: {
      ...state,
      storyId: String(storyId),
      readyForReview: {
        status: success ? 'complete' : 'failed',
        missingFields,
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
  const totalEpisodes = totalEpisodesFor(queueItem)

  if (totalEpisodes < 2) throw new Error('Series jobs require at least 2 episodes')
  if (!premise) throw new Error('Queue item premise is required to create series package')
  if (!setting) throw new Error('Queue item setting is required to create series package')
  if (!runtime) throw new Error('Queue item duration is required to create series package')

  const author = await pickAuthor(genre, authorTarget)
  if (!author) throw new Error(`No approved author found for genre ${genre}`)

  const title = titleFromQueue(queueItem) || queuePlanValue(queueItem, 'Series title') || 'Untitled Series Package'
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
        series_name: title,
        episode_number: episodeNumber,
        series_episode_number: episodeNumber,
        series_total_episodes: totalEpisodes,
        series_is_finale: isFinale,
        duration_label: runtime,
        duration_mins: runtimeToMinutes(runtime),
        is_hidden: true,
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

export async function POST(req: NextRequest) {
  let lockedJob: ProductionJob | null = null

  try {
    const body = await req.json().catch(() => ({}))
    const requestedJobId = String(body.jobId || '').trim()
    const model = String(body.model || 'claude-opus-4-6')

    const candidate = await selectCandidate(requestedJobId)
    if (!candidate) {
      return NextResponse.json({ success: true, message: 'No queued or running production job found', job: null })
    }

    lockedJob = await lockJob(candidate)
    if (!lockedJob) {
      return bad('Production job is already locked', 409, { jobId: candidate.id })
    }

    const step = normalizeStep(lockedJob.current_step)
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
            current_step: NEXT_STEP_AFTER_STANDALONE_VALIDATION,
            state_json: result.state,
            error_json: {
              step,
              storyId: result.storyId,
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
            current_step: NEXT_STEP_AFTER_STANDALONE_BELLE_VALIDATION,
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

      if (type !== 'standalone') {
        return bad('Series package completion is not implemented in this run-next slice', 422, {
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

    if (step !== 'create_story_row') {
      return bad('Only create_story_row, generate_script, validate_script, voice_preflight, generate_voices, generate_belle_assets, validate_belle_assets, generate_music, render_final_mix, complete_story_package, ready_for_review, and generate_episode_script are implemented in this run-next slice', 422, {
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
      await clearLock(lockedJob.id)
    }
  }
}
