/**
 * PERS-FIX-002 — countable telemetry for silent personalization fallbacks.
 *
 * /api/asc3/story-playlist silently returned the generic final_mix whenever
 * the personalized branch was gated off (Marc × "Weight of the Water",
 * PERS-DIAG-001). The only trace was a console.warn on the error path —
 * asset-gate fallbacks (missing announcement_url etc.) produced NOTHING.
 *
 * This module makes every authenticated fallback countable:
 *  - one row in personalization_fallbacks (story_id, user_id, reason), plus
 *  - one structured log line ("[story-playlist] personalization_fallback"),
 * so silent degradation shows up in both SQL and log greps.
 */

export type PersonalizationFallbackReason =
  | 'missing_pronunciation_key'
  | 'missing_announcement_url'
  | 'missing_story_audio_url'
  | 'missing_outro_url'
  | 'name_pool_not_ready'
  | 'personalized_queue_error'

export type GateStory = {
  announcement_url?: string | null
  story_audio_url?: string | null
  outro_with_music_url?: string | null
  outro_audio_url?: string | null
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Mirrors the asset gates at the top of buildPersonalizedQueue, in gate
 * order. Returns the first failing gate's reason, or null when all static
 * asset gates pass (pool readiness is checked separately — it is async).
 */
export function personalizedAssetGateReason(
  story: GateStory,
  pronunciationKey: string
): PersonalizationFallbackReason | null {
  if (!clean(pronunciationKey)) return 'missing_pronunciation_key'
  if (!clean(story?.announcement_url)) return 'missing_announcement_url'
  if (!clean(story?.story_audio_url)) return 'missing_story_audio_url'
  if (!clean(story?.outro_with_music_url) && !clean(story?.outro_audio_url)) return 'missing_outro_url'
  return null
}

export type FallbackTelemetryInput = {
  storyId: string
  userId: string
  pronunciationKey?: string | null
  reason: string
}

/** Row shape for the personalization_fallbacks insert. */
export function fallbackTelemetryRow(input: FallbackTelemetryInput) {
  return {
    story_id: input.storyId,
    user_id: input.userId,
    pronunciation_key: clean(input.pronunciationKey) || null,
    reason: clean(input.reason).slice(0, 500) || 'unknown',
  }
}

type MinimalSupabaseClient = {
  from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> }
}

/**
 * Best-effort: never throws, never blocks playback. Emits the structured log
 * line unconditionally so the signal survives even if the table insert fails
 * (e.g. migration not applied yet).
 */
export async function recordPersonalizationFallback(
  client: MinimalSupabaseClient,
  input: FallbackTelemetryInput
): Promise<void> {
  const row = fallbackTelemetryRow(input)
  console.warn('[story-playlist] personalization_fallback', JSON.stringify(row))
  try {
    const { error } = await client.from('personalization_fallbacks').insert(row)
    if (error) {
      console.warn('[story-playlist] personalization_fallbacks insert failed:', error.message)
    }
  } catch (err) {
    console.warn(
      '[story-playlist] personalization_fallbacks insert threw:',
      err instanceof Error ? err.message : String(err)
    )
  }
}
