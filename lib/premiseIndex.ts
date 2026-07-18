/**
 * PREMISE-UNIQUENESS-001 — premise_index maintenance on workflow_state changes.
 *
 * Index rules (Marc ruling 2026-07-18):
 *  - A transition INTO any protected state (published, ready_for_review,
 *    repair_queue, approved_ready) upserts the story's premise into
 *    premise_index.
 *  - A transition INTO cold_storage deletes the row — cold storage frees the
 *    premise for reuse.
 *  - Every other transition leaves the index untouched.
 *
 * House pattern: the workflow_state writers (content-approval, publish-story,
 * dispatch-queue cron, run-next promotion) call syncPremiseIndexForTransition
 * AFTER their own successful stories update. Sync is best-effort and never
 * throws — a failed index write must not roll back or block a legal workflow
 * transition. Failures are logged and recoverable by re-running
 * scripts/backfill-premise-index.js.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractCoreHook, premiseIndexEligible } from './premiseGate'

export type PremiseIndexSyncResult = {
  action: 'upsert' | 'delete' | 'noop'
  count: number
  error: string | null
}

export type PremiseIndexSourceStory = {
  id: string
  series_id?: string | null
  title?: string | null
  workflow_state?: string | null
  genre?: string | null
  description?: string | null
  brief_json?: unknown
}

/**
 * Build a premise_index row from a stories row.
 * Premise source of truth: brief_json.premise, falling back to description
 * (legacy pre-V2 stories have no brief_json). Returns null when the story has
 * no premise text at all — nothing to reserve.
 */
export function premiseIndexRowForStory(story: PremiseIndexSourceStory, status?: string) {
  const brief = story.brief_json && typeof story.brief_json === 'object'
    ? story.brief_json as Record<string, unknown>
    : {}
  const premise = String(brief.premise ?? '').trim() || String(story.description ?? '').trim()
  if (!premise) return null
  return {
    story_id: story.id,
    series_id: story.series_id ?? null,
    title: story.title ?? null,
    status: String(status ?? story.workflow_state ?? '').trim() || 'unknown',
    genre: story.genre ?? null,
    logline: String(story.description ?? '').trim() || null,
    core_hook: extractCoreHook(premise),
    premise,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Sync premise_index after a workflow_state transition has been committed.
 * Never throws. Call with the destination state and the affected story ids.
 */
export async function syncPremiseIndexForTransition(
  supabase: SupabaseClient,
  params: { storyIds: string[]; toState: string },
): Promise<PremiseIndexSyncResult> {
  const storyIds = (params.storyIds || []).filter(Boolean).map(String)
  const toState = String(params.toState || '').trim()
  if (storyIds.length === 0) return { action: 'noop', count: 0, error: null }

  try {
    if (toState === 'cold_storage') {
      const { error } = await supabase
        .from('premise_index')
        .delete()
        .in('story_id', storyIds)
      if (error) throw new Error(error.message)
      return { action: 'delete', count: storyIds.length, error: null }
    }

    if (!premiseIndexEligible(toState)) {
      return { action: 'noop', count: 0, error: null }
    }

    const { data: stories, error: fetchError } = await supabase
      .from('stories')
      .select('id,series_id,title,workflow_state,genre,description,brief_json')
      .in('id', storyIds)
    if (fetchError) throw new Error(fetchError.message)

    const rows = (stories || [])
      .map((story: PremiseIndexSourceStory) => premiseIndexRowForStory(story, toState))
      .filter((row): row is NonNullable<ReturnType<typeof premiseIndexRowForStory>> => row !== null)

    if (rows.length === 0) return { action: 'noop', count: 0, error: null }

    const { error: upsertError } = await supabase
      .from('premise_index')
      .upsert(rows, { onConflict: 'story_id' })
    if (upsertError) throw new Error(upsertError.message)

    return { action: 'upsert', count: rows.length, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[premise-index] sync failed (toState=${toState}, stories=${storyIds.join(',')}): ${message} — recover with scripts/backfill-premise-index.js`)
    return { action: toState === 'cold_storage' ? 'delete' : 'upsert', count: 0, error: message }
  }
}
