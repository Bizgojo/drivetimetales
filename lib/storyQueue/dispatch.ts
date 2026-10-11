/**
 * DRAFT-NOT-FOR-MERGE — Atlas Gap-1 (authorize+dispatch atomic path)
 * Branch: feat/atlas-gap1-dispatch-oct11. Lyra review required. No merge authority.
 *
 * Single shared code path for story_queue_items → production_jobs dispatch.
 * Used by POST /api/admin/story-queue/dispatch AND the hardened
 * POST /api/admin/production-jobs.
 *
 * Decisions: gap1-auth-model-oct11-1401 (blueprintRef approval, server-verified),
 * gap1-bearer-auth-oct11-1401 (STRATEGOS_SERVICE_TOKEN, Marc mints — interface only),
 * gap1-harden-post-oct11-1401 (close direct-POST bypass).
 */

export type DispatchMode = 'single' | 'series'
export type DispatchCaller = 'strategos' | 'admin-ui'

export interface DispatchInput {
  queueItemId: string
  mode: DispatchMode
  blueprintRef: string
  reason?: string
  caller: DispatchCaller
  /** Who authorized: 'strategos' or an admin user id. Stored in audit + input_json. */
  authorizedBy: string
}

export interface DispatchResult {
  job: {
    id: string
    status: string
    current_step: string
    queue_item_id: string
    job_type: string
    created_at: string
  }
  item: { id: string; status: string; authorized: boolean; releasedToHal: boolean }
}

export const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']

export function normalizeDispatchMode(value: unknown): DispatchMode | null {
  const mode = String(value || '').trim()
  if (mode === 'single' || mode === 'series') return mode
  return null
}

/**
 * Resolves episode count from a queue item row.
 * Moved verbatim from app/api/admin/production-jobs/route.ts (resolveEpisodeCount)
 * so both routes share one implementation. (Pre-merge check: keep notes-regex.)
 */
export function resolveEpisodeCount(queueItem: Record<string, any>): number {
  const explicit = queueItem['totalEpisodes'] ?? queueItem['total_episodes']
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const n = Number(explicit)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  const notes = String(queueItem['notes'] || '')
  const match = notes.match(/^total\s+episodes\s*:\s*(\d+)/im)
  if (match) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return 0
}

/**
 * Bearer check for service callers (Strategos).
 * Env var: STRATEGOS_SERVICE_TOKEN — minted + set by Marc (Vercel, Marc-only).
 * This function references the env name only; no key material here, ever.
 * Fail-closed: env unset → {ok:false} (caller must 401, never run open).
 */
export function requireStrategosToken(req: Request): { ok: boolean; error?: string } {
  const expected = process.env.STRATEGOS_SERVICE_TOKEN
  if (!expected) return { ok: false, error: 'service token not configured' }
  const got = req.headers.get('authorization') || ''
  // Length-sensitive compare to avoid leaking prefix info via timing is
  // overkill here, but never use substring/startsWith matching.
  if (got !== `Bearer ${expected}`) return { ok: false, error: 'missing or invalid service token' }
  return { ok: true }
}

/**
 * Fail-closed blueprint approval check.
 *
 * BLOCKER B-1: no blueprint approval record exists in schema (verified
 * 2026-10-11: zero migration hits for "blueprint"; code mentions are
 * comments only). Until Marc/Strategos-owner defines the approval table +
 * columns, this MUST return {ok:false} — never fail open.
 *
 * TODO(B-1): implement lookup, e.g.
 *   const { data } = await supabase.from('<approval-table>')
 *     .select('id,<approval-column>').eq('id', blueprintRef).maybeSingle()
 *   return data && data.<approval-column> === '<approved-value>'
 *     ? {ok:true} : {ok:false, reason:`blueprint ${blueprintRef} is not approved`}
 */
export async function verifyBlueprintApproval(
  _supabase: any,
  blueprintRef: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!blueprintRef || !String(blueprintRef).trim()) {
    return { ok: false, reason: 'blueprintRef required' }
  }
  // B-1 unresolved: fail closed.
  return { ok: false, reason: 'blueprint verification unavailable (BLOCKER B-1: no approval record defined)' }
}

/**
 * Atomic authorize+dispatch. Throws DispatchError with .status for HTTP mapping.
 * Order: verify (no writes) → 409 check → series gate → writes (item + job + audit).
 */
export class DispatchError extends Error {
  status: number
  extra?: Record<string, any>
  constructor(message: string, status = 400, extra?: Record<string, any>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export async function authorizeAndDispatchQueueItem(
  supabase: any,
  input: DispatchInput
): Promise<DispatchResult> {
  const queueItemId = String(input.queueItemId || '').trim()
  if (!queueItemId) throw new DispatchError('queueItemId required', 400)
  if (!normalizeDispatchMode(input.mode)) throw new DispatchError('mode must be single or series', 400)
  const blueprintRef = String(input.blueprintRef || '').trim()
  if (!blueprintRef) throw new DispatchError('blueprintRef required', 400)

  // 1. Blueprint verification — before any state mutation.
  const v = await verifyBlueprintApproval(supabase, blueprintRef)
  if (!v.ok) throw new DispatchError(v.reason || 'blueprint not approved', 422)

  // 2. Load queue item.
  const { data: queueItem, error: queueError } = await supabase
    .from('story_queue_items')
    .select('*')
    .eq('id', queueItemId)
    .maybeSingle()
  if (queueError) throw new DispatchError(queueError.message || 'Failed to load queue item', 500)
  if (!queueItem) throw new DispatchError('Queue item not found', 404)

  // 3. Idempotency: active job already referencing this queue item → 409.
  const { data: existingJob, error: existingJobError } = await supabase
    .from('production_jobs')
    .select('id,status,current_step,queue_item_id,job_type,created_at')
    .eq('queue_item_id', queueItemId)
    .in('status', ACTIVE_JOB_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingJobError) throw new DispatchError(existingJobError.message || 'Failed to check active production jobs', 500)
  if (existingJob) {
    throw new DispatchError('Active production job already exists for this queue item', 409, {
      existingJobId: existingJob.id,
      existingJob,
    })
  }

  // 4. Series gate (parity with existing POST).
  if (input.mode === 'series') {
    const episodeCount = resolveEpisodeCount(queueItem)
    if (episodeCount < 2) {
      throw new DispatchError(
        `Series jobs require totalEpisodes ≥ 2 in the queue item. Resolved ${episodeCount} episode(s).`,
        400
      )
    }
  }

  // 5. Authorize + stamp item.
  const releasedAt = new Date().toISOString()
  const { data: updatedItem, error: itemError } = await supabase
    .from('story_queue_items')
    .update({
      authorized: true,
      status: 'dispatched',
      released_to_hal: true,
      released_to_hal_at: releasedAt,
    })
    .eq('id', queueItemId)
    .select('id,status,authorized,released_to_hal')
    .single()
  if (itemError) throw new DispatchError(itemError.message || 'Failed to authorize queue item', 500)

  // 6. Insert job. Compensating rollback: if this fails, revert the item stamp.
  const { data: job, error: insertError } = await supabase
    .from('production_jobs')
    .insert({
      queue_item_id: queueItemId,
      job_type: input.mode,
      status: 'queued',
      current_step: 'queued',
      step_index: 0,
      created_by: input.authorizedBy,
      input_json: {
        queueItem,
        mode: input.mode,
        source: 'story_queue_dispatch',
        blueprintRef,
        authorizedBy: input.authorizedBy,
        caller: input.caller,
        reason: input.reason || null,
      },
    })
    .select('id,status,current_step,queue_item_id,job_type,created_at')
    .single()
  if (insertError) {
    // Best-effort revert of step 5 (item was readable+unchanged-by-others in the
    // common case; a concurrent change here is surfaced, not hidden).
    await supabase
      .from('story_queue_items')
      .update({ authorized: queueItem.authorized === true, status: queueItem.status })
      .eq('id', queueItemId)
    throw new DispatchError(insertError.message || 'Failed to create production job', 500)
  }

  // 7. Audit row (story_workflow_audit; queue-item pointer via prefixed reason —
  // story_id FK requires a stories row which may not exist yet; see design §8).
  const storyId: string | null = queueItem.story_id ? String(queueItem.story_id) : null
  if (storyId) {
    const { error: auditError } = await supabase.from('story_workflow_audit').insert({
      story_id: storyId,
      from_state: queueItem.status || null,
      to_state: 'dispatched',
      changed_by: input.authorizedBy,
      reason: `queue-dispatch:${queueItemId} blueprint:${blueprintRef}` + (input.reason ? ` ${input.reason}` : ''),
      session_context: `job:${job.id}`,
    })
    if (auditError) console.error('[dispatch] audit insert failed (non-fatal):', auditError)
  } else {
    console.warn('[dispatch] no story_id on queue item; audit pointer in job input_json only:', {
      queueItemId,
      jobId: job.id,
      blueprintRef,
    })
  }

  return {
    job,
    item: {
      id: updatedItem.id,
      status: updatedItem.status,
      authorized: updatedItem.authorized === true,
      releasedToHal: (updatedItem as any).released_to_hal === true,
    },
  }
}
