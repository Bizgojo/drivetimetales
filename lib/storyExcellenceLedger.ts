/**
 * Story Excellence Ledger
 *
 * Records creative lessons from Marc's story rejections and review feedback.
 * Every rejection must produce a durable lesson so Hal, Orion, and Atlas
 * accumulate creative wisdom and do not repeat the same errors.
 *
 * Distinct from the Production Learning Ledger (technical/pipeline failures).
 * This ledger captures *editorial and creative* lessons: what made a story
 * fail Marc's review, and what prevention rule applies to future stories.
 *
 * Core rule: A story rejection that does NOT produce a lesson here is waste.
 */

type SupabaseLike = {
  from: (table: string) => any
}

export type ExcellenceLessonCategory =
  | 'belle_quality'           // Belle intro/outro text/tone
  | 'story_resolution'        // Protagonist agency, climax, DSR
  | 'hook'                    // Opening hook strength
  | 'cliffhanger'             // Episode cliffhanger quality
  | 'ending_satisfaction'     // Finale/standalone ending
  | 'pacing'                  // Story rhythm, scene length
  | 'cover_art'               // Visual identity issues
  | 'narrator_character'      // Narrator-as-character treatment
  | 'dialogue_quality'        // Dialogue authenticity
  | 'script_structure'        // Scene/act structure problems
  | 'genre_fidelity'          // Genre conventions violated
  | 'personalization'         // [LISTENER_NAME] usage errors
  | 'other'                   // Catch-all; provide detail in lesson_text

export type StoryExcellenceLessonInput = {
  story_id?: string | null
  series_id?: string | null
  series_title?: string | null
  episode_title?: string | null
  rejected_by: string            // 'marc' | 'orion' | 'system'
  lesson_category: ExcellenceLessonCategory
  lesson_text: string            // What was wrong — must be specific
  prevention_rule?: string | null // Same format as productionLearning.ts (contains:/word: prefix)
  applies_to_future?: boolean
  confidence?: number
}

export type StoryExcellenceLesson = {
  id: string
  story_id: string | null
  series_id: string | null
  series_title: string | null
  episode_title: string | null
  rejected_by: string
  lesson_category: ExcellenceLessonCategory
  lesson_text: string
  prevention_rule: string | null
  applies_to_future: boolean
  confidence: number
  created_at: string
}

function clean(value: unknown): string {
  return String(value || '').trim()
}

function confidenceValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.8
}

/**
 * Record a creative lesson from a story rejection or review note.
 * Called by the approval/rejection flow in the content-approval route.
 */
export async function recordExcellenceLesson(
  supabase: SupabaseLike,
  input: StoryExcellenceLessonInput,
): Promise<{ data: StoryExcellenceLesson | null; error: Error | null }> {
  const lessonText = clean(input.lesson_text)
  if (!lessonText) {
    return { data: null, error: new Error('lesson_text is required and must not be empty') }
  }

  const category = clean(input.lesson_category) || 'other'

  const payload = {
    story_id: input.story_id || null,
    series_id: input.series_id || null,
    series_title: input.series_title || null,
    episode_title: input.episode_title || null,
    rejected_by: clean(input.rejected_by) || 'unknown',
    lesson_category: category,
    lesson_text: lessonText,
    prevention_rule: input.prevention_rule || null,
    applies_to_future: input.applies_to_future !== false,
    confidence: confidenceValue(input.confidence),
  }

  const { data, error } = await supabase
    .from('story_excellence_lessons')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    console.warn('[story-excellence] Failed to record lesson:', error.message)
    return { data: null, error: new Error(error.message) }
  }

  return { data: data as StoryExcellenceLesson, error: null }
}

/**
 * Load active lessons that apply to future stories.
 * Used by Hal's learning loop and preflight checks.
 */
export async function loadActiveExcellenceLessons(
  supabase: SupabaseLike,
  opts: { category?: ExcellenceLessonCategory; limit?: number } = {},
): Promise<StoryExcellenceLesson[]> {
  let query = supabase
    .from('story_excellence_lessons')
    .select('*')
    .eq('applies_to_future', true)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.category) {
    query = query.eq('lesson_category', opts.category)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[story-excellence] Failed to load lessons:', error.message)
    return []
  }

  return (data as StoryExcellenceLesson[]) || []
}

/**
 * Scan a script/story context for known excellence prevention rules.
 * Returns matched lessons as structured feedback (same pattern as productionLearning.ts).
 */
export type ExcellenceFeedbackItem = {
  id: string
  category: ExcellenceLessonCategory
  lessonText: string
  preventionRule: string | null
  matchedText: string | null
  confidence: number
}

function matchPreventionRule(text: string, rule: string | null | undefined): string | null {
  const cleanRule = clean(rule)
  if (!cleanRule) return null

  if (cleanRule.startsWith('contains:')) {
    const fragment = cleanRule.slice('contains:'.length).trim()
    return fragment && text.includes(fragment) ? fragment : null
  }

  if (cleanRule.startsWith('word:')) {
    const word = cleanRule.slice('word:'.length).trim()
    if (!word) return null
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`).test(text) ? word : null
  }

  return null
}

export async function buildExcellenceFeedback(
  supabase: SupabaseLike,
  script: string,
): Promise<{
  checked: boolean
  lessonCount: number
  matches: ExcellenceFeedbackItem[]
}> {
  const lessons = await loadActiveExcellenceLessons(supabase)

  const matches: ExcellenceFeedbackItem[] = []
  const seen = new Set<string>()

  for (const lesson of lessons) {
    if (!lesson.prevention_rule) continue
    const matchedText = matchPreventionRule(script, lesson.prevention_rule)
    if (!matchedText) continue
    const key = `${lesson.lesson_category}:${lesson.prevention_rule}`
    if (seen.has(key)) continue
    seen.add(key)
    matches.push({
      id: lesson.id,
      category: lesson.lesson_category,
      lessonText: lesson.lesson_text,
      preventionRule: lesson.prevention_rule,
      matchedText,
      confidence: lesson.confidence,
    })
  }

  return { checked: true, lessonCount: lessons.length, matches }
}

/**
 * Mark a lesson as no longer applicable to future stories.
 * Used when a prevention rule is superseded by a code fix or schema change.
 */
export async function deprecateLesson(
  supabase: SupabaseLike,
  lessonId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('story_excellence_lessons')
    .update({ applies_to_future: false })
    .eq('id', lessonId)

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}
