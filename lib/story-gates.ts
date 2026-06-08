// lib/story-gates.ts
// Single source of truth for story review gate logic
// Used by: app/api/admin/production-console/route.ts
//          app/admin/production/approval/page.tsx
//
// Rule: Both pages import from here. Gate logic lives ONLY here.
// Do not duplicate isReviewReady() or includeItem() elsewhere.

export interface GateResult {
  ready: boolean
  blocked: boolean
  blockedReason?: string
  warnings: string[]
}

export interface SeriesGateResult {
  complete: boolean
  totalExpected: number
  totalPresent: number
  missingEpisodes: number[]
}

export interface SeriesGroup {
  seriesId: string | null
  seriesName: string
  episodes: StoryWithGate[]
  seriesGate: SeriesGateResult | null
  isStandalone: boolean
  blocked: boolean
  blockedReason?: string
  combinedRuntimeMins: number
}

export interface StoryWithGate {
  id: string
  title: string
  series_name?: string | null
  series_id?: string | null
  episode_number?: number | null
  duration_mins?: number | null
  audio_url?: string | null
  story_audio_url?: string | null
  prose_text?: string | null
  author_id?: string | null
  narrator_voice_id?: string | null
  narrator_voice_name?: string | null
  cover_url?: string | null
  repair_notes?: string | null
  review_notes?: string | null
  workflow_state?: string | null
  grading_result?: Record<string, unknown> | null
  is_v2?: boolean | null
  production_standard?: string | null
  [key: string]: unknown
  _gate: GateResult
}

// ── Core gate evaluation ────────────────────────────────────────────────────

export function evaluateStoryGate(story: Record<string, unknown>): GateResult {
  const warnings: string[] = []

  // Hard blocks — story cannot appear in review
  const hasAudio = !!(story.audio_url || story.story_audio_url)
  if (!hasAudio) {
    return { ready: false, blocked: true, blockedReason: 'No audio produced', warnings }
  }

  if (!story.prose_text) {
    return { ready: false, blocked: true, blockedReason: 'No script text', warnings }
  }

  if (!story.author_id) {
    return { ready: false, blocked: true, blockedReason: 'No author assigned', warnings }
  }

  if (!story.narrator_voice_id) {
    return { ready: false, blocked: true, blockedReason: 'No narrator voice assigned', warnings }
  }

  const title = String(story.title ?? '')
  const seriesName = String(story.series_name ?? '')
  if (/\[TEST\]/i.test(title) || /\bTEST\b/i.test(seriesName)) {
    return { ready: false, blocked: true, blockedReason: 'Test data — not for production review', warnings }
  }

  // Soft warnings — story appears but Marc is informed
  if (!story.cover_url) {
    warnings.push('No cover art')
  }
  if (story.repair_notes) {
    warnings.push('Has repair notes — review carefully')
  }

  return { ready: true, blocked: false, warnings }
}

// ── Series completeness gate ────────────────────────────────────────────────

export function evaluateSeriesGate(
  seriesId: string,
  allRFRStories: Record<string, unknown>[]
): SeriesGateResult {
  const seriesStories = allRFRStories.filter(s => s.series_id === seriesId)
  const episodeNumbers = seriesStories
    .map(s => typeof s.episode_number === 'number' ? s.episode_number : null)
    .filter((n): n is number => n !== null)

  if (episodeNumbers.length === 0) {
    return { complete: false, totalExpected: 0, totalPresent: 0, missingEpisodes: [] }
  }

  const totalExpected = Math.max(...episodeNumbers)
  const presentSet = new Set(episodeNumbers)
  const missingEpisodes: number[] = []

  for (let i = 1; i <= totalExpected; i++) {
    if (!presentSet.has(i)) missingEpisodes.push(i)
  }

  // All episodes must also pass the individual story gate
  const passingStories = seriesStories.filter(s => evaluateStoryGate(s).ready)
  const totalPresent = passingStories.length
  const complete = missingEpisodes.length === 0 && totalPresent === totalExpected && totalExpected > 0

  return { complete, totalExpected, totalPresent, missingEpisodes }
}

// ── Story annotation ─────────────────────────────────────────────────────────

export function annotateStories(stories: Record<string, unknown>[]): StoryWithGate[] {
  return stories.map(s => ({ ...s, _gate: evaluateStoryGate(s) } as StoryWithGate))
}

export function filterReviewReady(stories: Record<string, unknown>[]): Record<string, unknown>[] {
  return stories.filter(s => evaluateStoryGate(s).ready)
}

// ── Series grouping for Content Approval ────────────────────────────────────

export function groupBySeriesForApproval(
  readyStories: Record<string, unknown>[],
  allRFRStories: Record<string, unknown>[]
): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()

  for (const story of readyStories) {
    const seriesId = (story.series_id as string | null) ?? null
    const storyWithGate: StoryWithGate = { ...story, _gate: evaluateStoryGate(story) } as StoryWithGate

    if (seriesId === null) {
      // Standalone story — each gets its own group
      const key = `standalone-${story.id as string}`
      groups.set(key, {
        seriesId: null,
        seriesName: (story.title as string) ?? 'Untitled',
        episodes: [storyWithGate],
        seriesGate: null,
        isStandalone: true,
        blocked: false,
        combinedRuntimeMins: (story.duration_mins as number) ?? 0,
      })
    } else {
      if (!groups.has(seriesId)) {
        groups.set(seriesId, {
          seriesId,
          seriesName: (story.series_name as string) ?? 'Unknown Series',
          episodes: [],
          seriesGate: null,
          isStandalone: false,
          blocked: false,
          combinedRuntimeMins: 0,
        })
      }
      const group = groups.get(seriesId)!
      group.episodes.push(storyWithGate)
      group.combinedRuntimeMins += (story.duration_mins as number) ?? 0
    }
  }

  // Evaluate series gates and apply HARD BLOCK rule
  for (const [key, group] of Array.from(groups.entries())) {
    if (!group.isStandalone && group.seriesId) {
      const gate = evaluateSeriesGate(group.seriesId, allRFRStories)
      group.seriesGate = gate

      // Sort episodes by episode number
      group.episodes.sort((a, b) =>
        (a.episode_number ?? 0) - (b.episode_number ?? 0)
      )

      if (!gate.complete) {
        group.blocked = true
        group.blockedReason = gate.missingEpisodes.length > 0
          ? `Missing episode${gate.missingEpisodes.length > 1 ? 's' : ''}: ${gate.missingEpisodes.map(n => `Ep ${n}`).join(', ')}`
          : `Series incomplete — ${gate.totalPresent} of ${gate.totalExpected} episodes ready`
      }
    }
    groups.set(key, group)
  }

  return Array.from(groups.values()) as SeriesGroup[]
}

// ── Orion Recommendation (derived, never stored) ─────────────────────────────

export type OrgRecommendation = 'APPROVE' | 'REVIEW REQUIRED' | 'HOLD'

export function deriveOrionRecommendation(gate: GateResult): {
  recommendation: OrgRecommendation
  reason: string
} {
  if (gate.blocked) {
    return { recommendation: 'HOLD', reason: gate.blockedReason ?? 'Blocked from review' }
  }
  if (gate.warnings.length > 0) {
    return { recommendation: 'REVIEW REQUIRED', reason: gate.warnings[0] }
  }
  return { recommendation: 'APPROVE', reason: 'All quality gates passed' }
}

// ── Approval gate (mirrors content-approval episodeBlockingReasons) ──────────
// ATL-CONS-001 Phase C.1 — used by Production Console to show per-story
// block reasons and recommended action for every RFR item.
//
// hasCompletedJob: true if the story has a production_job with
//   completed_at set AND (status='complete' OR current_step in render/package steps)

export type RecommendedAction =
  | 'Resume Production'
  | 'Send to Repair Queue'
  | 'Move to Cold Storage'
  | 'Await Missing Episode'
  | 'Await Metadata Completion'
  | 'Audit Required'

export interface ApprovalGateResult {
  approvalReady: boolean
  blockReasons: string[]
  recommendedAction: RecommendedAction | null
}

export function evaluateApprovalGate(
  story: Record<string, unknown>,
  hasCompletedJob: boolean
): ApprovalGateResult {
  const blockReasons: string[] = []

  const status      = String(story.status ?? '')
  const isHidden    = story.is_hidden === true
  const publishedOn = story.published_on ?? null
  const reviewStatus = String(story.review_status ?? '') || 'pending'
  const audioUrl    = String(story.audio_url ?? '')
  const title       = String(story.title ?? '')
  const genre       = String(story.genre ?? '')
  const description = String(story.description ?? '')
  const durationMins = story.duration_mins

  // 1. Production status
  if (status !== 'audio_ready') {
    blockReasons.push(`Status is "${status || 'empty'}" — needs "audio_ready"`)
  }

  // 2. Visibility
  if (!isHidden) {
    blockReasons.push('is_hidden is false — story visible in app before approval')
  }

  // 3. Already published
  if (publishedOn !== null) {
    blockReasons.push('published_on is set — story is already published')
  }

  // 4. Review status
  if (reviewStatus === 'not_approved') {
    blockReasons.push('Review status is "not_approved" — previously rejected')
  } else if (reviewStatus !== 'pending') {
    blockReasons.push(`Review status is "${reviewStatus}" — needs "pending"`)
  }

  // 5. Audio fields
  if (!audioUrl) {
    blockReasons.push('Missing audio_url — no audio produced')
  }
  // Note: /final_mix.mp3 check is skipped for workflow_state=ready_for_review
  // (matches content-approval episodeBlockingReasons behaviour)

  if (!story.story_audio_url) {
    blockReasons.push('Missing story_audio_url — body-only audio not rendered')
  }

  // 6. Packaging
  if (!story.cover_url) {
    blockReasons.push('Missing cover art')
  }
  if (!story.prose_text) {
    blockReasons.push('Missing script text (prose_text)')
  }
  if (!story.author_id) {
    blockReasons.push('Missing author (author_id)')
  }
  if (!story.narrator_voice_id) {
    blockReasons.push('Missing narrator voice ID')
  }
  if (!story.narrator_voice_name) {
    blockReasons.push('Missing narrator voice name')
  }

  // 7. Required metadata fields
  if (!title)       blockReasons.push('Missing title')
  if (!genre)       blockReasons.push('Missing genre')
  if (!description) blockReasons.push('Missing description')
  if (!durationMins) blockReasons.push('Missing duration (duration_mins)')

  // 8. Production job completion proof
  if (!hasCompletedJob) {
    blockReasons.push('No completed production job — completion timestamp unproven')
  }

  return {
    approvalReady: blockReasons.length === 0,
    blockReasons,
    recommendedAction: blockReasons.length === 0
      ? null
      : deriveRecommendedAction(status, reviewStatus, audioUrl, story, hasCompletedJob, blockReasons),
  }
}

function deriveRecommendedAction(
  status: string,
  reviewStatus: string,
  audioUrl: string,
  story: Record<string, unknown>,
  hasCompletedJob: boolean,
  blockReasons: string[]
): RecommendedAction {
  // Previously rejected — needs human decision
  if (reviewStatus === 'not_approved') return 'Send to Repair Queue'

  // Validator failed — broken script/audio
  if (status === 'validator_failed') return 'Send to Repair Queue'

  // No audio at all — needs to go back into production
  if (!audioUrl) return 'Resume Production'

  // Has audio but missing story_audio_url or not audio_ready
  if (!story.story_audio_url) return 'Resume Production'
  if (status !== 'audio_ready') return 'Resume Production'

  // Has audio_ready status but no job proof — likely pre-ASC or legacy
  if (!hasCompletedJob) return 'Resume Production'

  // Metadata gaps (author, narrator, cover) — needs packaging work
  const metadataMissing = !story.author_id || !story.narrator_voice_id ||
    !story.narrator_voice_name || !story.cover_url || !story.prose_text ||
    !story.title || !story.genre || !story.description || !story.duration_mins
  if (metadataMissing) return 'Await Metadata Completion'

  // is_hidden=false with full production stack — odd state
  if (story.is_hidden !== true) return 'Audit Required'

  // published_on set
  if (story.published_on !== null) return 'Move to Cold Storage'

  return 'Audit Required'
}

// ── QC checklist evaluation ──────────────────────────────────────────────────

export type ChecklistStatus = 'pass' | 'fail' | 'unverified'

export interface QCChecklistItem {
  label: string
  status: ChecklistStatus
  key: string
}

export function evaluateQCChecklist(
  gradingResult: Record<string, unknown> | null | undefined,
  episodeNumber: number | null | undefined,
  totalEpisodes: number | null | undefined,
  isStandalone: boolean
): QCChecklistItem[] {
  const g = gradingResult ?? {}

  const gradeField = (key: string): ChecklistStatus => {
    if (!(key in g)) return 'unverified'
    return g[key] ? 'pass' : 'fail'
  }

  const items: QCChecklistItem[] = [
    { key: 'sting', label: 'Sting correct', status: gradeField('sting') },
    { key: 'belle_intro', label: 'Belle intro correct', status: gradeField('belle_intro') },
    { key: 'hook', label: 'Hook present', status: gradeField('hook') },
    { key: 'personalization', label: 'Personalization working', status: gradeField('personalization') },
    { key: 'music_intro_volume', label: 'Background music starts loud after intro', status: gradeField('music_intro_volume') },
    { key: 'music_duck_story', label: 'Music ducks under story', status: gradeField('music_duck_story') },
    { key: 'music_rise_post_story', label: 'Music rises after story', status: gradeField('music_rise_post_story') },
    { key: 'music_duck_outro', label: 'Music ducks under outro', status: gradeField('music_duck_outro') },
    { key: 'music_fade_outro', label: 'Music fades 3 seconds after outro', status: gradeField('music_fade_outro') },
    { key: 'outro', label: 'Outro correct', status: gradeField('outro') },
  ]

  // Cliffhanger — only for non-final series episodes
  const isFinal = totalEpisodes != null && episodeNumber != null && episodeNumber >= totalEpisodes
  if (!isStandalone && !isFinal) {
    items.push({ key: 'cliffhanger', label: 'Cliffhanger preserved', status: gradeField('cliffhanger') })
  }

  // Ending satisfying — only for finale or standalone
  if (isStandalone || isFinal) {
    items.push({ key: 'ending_satisfying', label: 'Ending satisfying', status: gradeField('ending_satisfying') })
  }

  return items
}
