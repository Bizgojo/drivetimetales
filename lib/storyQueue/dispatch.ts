/**
 * Atlas Gap-1 build — authorize+dispatch atomic path.
 * Branch: feat/atlas-gap1-build-oct11. Independent diff review + Lyra review
 * required. No merge authority. Migration on feature branch only
 * (supabase/migrations/20261011163700_gap1_blueprint_approvals_audit.sql).
 *
 * Marc decisions 2026-10-11 16:37 EDT (authoritative):
 *   gap1-blueprint-table-oct11-1637 — blueprint approval record = NEW
 *     dedicated table `story_blueprint_approvals` (not reused columns,
 *     not Strategos-external).
 *   gap1-token-mint-oct11-1637 — token mint in the SAME step as the approval
 *     write: one handler creates the approval row AND stores the token
 *     reference. Interface only — this code NEVER mints, generates, or
 *     handles real key material. Marc mints STRATEGOS_SERVICE_TOKEN
 *     out-of-band; the handler stores exactly the caller-supplied opaque
 *     `tokenRef` string (key id / vault pointer), or NULL when absent.
 *   gap1-audit-table-oct11-1637 — audit trail for story-less queue items =
 *     NEW dedicated table `story_queue_dispatch_audit`
 *     (actor, action, queue_item_id, blueprint_ref, created_at, reason).
 *     NOT input_json, NOT story_workflow_audit (story_id NOT NULL there).
 *
 * Single shared code path for story_queue_items → production_jobs dispatch.
 * Used by POST /api/admin/story-queue/dispatch AND the hardened
 * POST /api/admin/production-jobs.
 */

export type DispatchMode = 'single' | 'series'
export type DispatchCaller = 'strategos' | 'admin-ui'

export interface DispatchInput {
  queueItemId: string
  mode: DispatchMode
  blueprintRef: string
  reason?: string
  caller: DispatchCaller
  /** Who authorized: 'strategos' or an admin user id. Stored in audit. */
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

export interface ApprovalInput {
  queueItemId: string
  blueprintRef: string
  approvedBy: string
  /** Series/queue ref, when the approval covers a series. Optional. */
  seriesId?: string
  /** Blueprint payload pointer/inline copy. Optional, stored as-is. */
  blueprintPayload?: Record<string, any>
  /**
   * Opaque reference to the minted service-token record, supplied by the
   * caller (Marc mints out-of-band). Stored verbatim, NEVER generated here:
   * this function performs no crypto, no randomBytes, no key derivation.
   * Absent → token_ref stays NULL and tokenRecorded is false.
   */
  tokenRef?: string
}

export interface ApprovalResult {
  approval: {
    id: string
    queue_item_id: string
    blueprint_ref: string
    approved_by: string
    approved_at: string
    status: string
    token_ref: string | null
  }
  /** True iff a caller-supplied tokenRef was stored alongside the approval. */
  tokenRecorded: boolean
}

export const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_for_external']

/** Approval-table + status constants (single source of truth for queries). */
export const BLUEPRINT_APPROVALS_TABLE = 'story_blueprint_approvals'
export const DISPATCH_AUDIT_TABLE = 'story_queue_dispatch_audit'
export const APPROVED_STATUS = 'approved'

export function normalizeDispatchMode(value: unknown): DispatchMode | null {
  const mode = String(value || '').trim()
  if (mode === 'single' || mode === 'series') return mode
  return null
}

/**
 * Resolves episode count from a queue item row.
 * Shared with POST /api/admin/production-jobs so both routes gate series
 * jobs identically. (Pre-merge check: keep notes-regex parity.)
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
  // Exact match only — never substring/startsWith matching.
  if (got !== `Bearer ${expected}`) return { ok: false, error: 'missing or invalid service token' }
  return { ok: true }
}

/**
 * Server-side blueprint approval verification against the dedicated table.
 * Fail-closed: any lookup failure, empty ref, or no active approved row
 * → {ok:false}. Never fail open.
 *
 * CLAUDE-FIX (N-A1, 2026-10-11): scoped by BOTH queue_item_id AND
 * blueprint_ref, matching the table's own unique partial index
 * `(queue_item_id, blueprint_ref) WHERE status='approved'`. The original
 * build queried by blueprint_ref alone, so an approval minted for queue
 * item A would also verify a dispatch of queue item B reusing the same
 * blueprint_ref — an approval is per (item, ref), not global to a ref.
 */
export async function verifyBlueprintApproval(
  supabase: any,
  blueprintRef: string,
  queueItemId: string
): Promise<{ ok: boolean; reason?: string }> {
  const ref = String(blueprintRef || '').trim()
  const itemId = String(queueItemId || '').trim()
  if (!ref) return { ok: false, reason: 'blueprintRef required' }
  if (!itemId) return { ok: false, reason: 'queueItemId required' }
  let query: any
  try {
    query = await supabase
      .from(BLUEPRINT_APPROVALS_TABLE)
      .select('id,queue_item_id,blueprint_ref,status,approved_by,approved_at')
      .eq('queue_item_id', itemId)
      .eq('blueprint_ref', ref)
      .eq('status', APPROVED_STATUS)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  } catch (err: any) {
    return { ok: false, reason: `blueprint verification unavailable: ${err?.message || 'lookup failed'}` }
  }
  if (query?.error) {
    return { ok: false, reason: `blueprint verification unavailable: ${query.error.message || 'lookup failed'}` }
  }
  if (!query?.data) {
    return { ok: false, reason: `blueprint ${ref} is not approved for queue item ${itemId}` }
  }
  return { ok: true }
}

/**
 * Approval + token-reference write in a SINGLE step
 * (gap1-token-mint-oct11-1637).
 *
 * One handler, one approval row: the INSERT carries the caller-supplied
 * opaque `tokenRef` in the same write that creates the approval, so the
 * approval record and the token reference can never diverge (no second
 * step to fail half-done). A `token_recorded` audit row is written right
 * after; if that audit write fails it is logged non-fatally — the approval
 * row itself already carries token_ref, so the basis is never lost.
 *
 * KEY-MATERIAL RULE: `tokenRef` is stored verbatim. This function generates
 * nothing — no random tokens, no secrets, no derivation. Marc mints the
 * real STRATEGOS_SERVICE_TOKEN out-of-band.
 *
 * Throws DispatchError with .status for HTTP mapping.
 */
export async function approveBlueprintAndRecordToken(
  supabase: any,
  input: ApprovalInput
): Promise<ApprovalResult> {
  const queueItemId = String(input.queueItemId || '').trim()
  const blueprintRef = String(input.blueprintRef || '').trim()
  const approvedBy = String(input.approvedBy || '').trim()
  if (!queueItemId) throw new DispatchError('queueItemId required', 400)
  if (!blueprintRef) throw new DispatchError('blueprintRef required', 400)
  if (!approvedBy) throw new DispatchError('approvedBy required', 400)

  const tokenRef =
    input.tokenRef !== undefined && input.tokenRef !== null
      ? String(input.tokenRef)
      : null

  // The queue item must exist — approvals never dangle.
  const { data: queueItem, error: queueError } = await supabase
    .from('story_queue_items')
    .select('id')
    .eq('id', queueItemId)
    .maybeSingle()
  if (queueError) throw new DispatchError(queueError.message || 'Failed to load queue item', 500)
  if (!queueItem) throw new DispatchError('Queue item not found', 404)

  // SINGLE STEP: approval row + token reference in one INSERT.
  const { data: approval, error: approvalError } = await supabase
    .from(BLUEPRINT_APPROVALS_TABLE)
    .insert({
      queue_item_id: queueItemId,
      series_id: input.seriesId || null,
      blueprint_ref: blueprintRef,
      blueprint_payload: input.blueprintPayload ?? null,
      approved_by: approvedBy,
      status: APPROVED_STATUS,
      token_ref: tokenRef,
    })
    .select('id,queue_item_id,blueprint_ref,approved_by,approved_at,status,token_ref')
    .single()
  if (approvalError) {
    // Unique-violation on the partial index = an active approval already
    // exists for this (item, ref): surface as 409, never duplicate.
    const msg = approvalError.message || 'Failed to record blueprint approval'
    const conflict = /duplicate|unique/i.test(msg)
    throw new DispatchError(
      conflict ? 'An active approval already exists for this queue item and blueprintRef' : msg,
      conflict ? 409 : 500
    )
  }

  const tokenRecorded = tokenRef !== null && tokenRef !== ''

  // Audit: approval basis (queryable even for story-less items).
  const { error: auditError } = await supabase.from(DISPATCH_AUDIT_TABLE).insert({
    actor: approvedBy,
    action: 'blueprint_approved',
    queue_item_id: queueItemId,
    blueprint_ref: blueprintRef,
    reason: tokenRecorded ? 'approval recorded with token reference' : 'approval recorded (no token reference supplied)',
  })
  if (auditError) console.error('[dispatch] approval audit insert failed (non-fatal):', auditError)

  if (tokenRecorded) {
    const { error: tokenAuditError } = await supabase.from(DISPATCH_AUDIT_TABLE).insert({
      actor: approvedBy,
      action: 'token_recorded',
      queue_item_id: queueItemId,
      blueprint_ref: blueprintRef,
      reason: 'service-token reference stored alongside approval (reference only, never key material)',
    })
    if (tokenAuditError) console.error('[dispatch] token audit insert failed (non-fatal):', tokenAuditError)
  }

  return { approval, tokenRecorded }
}

/**
 * Atomic authorize+dispatch. Throws DispatchError with .status for HTTP mapping.
 * Order: verify (no writes) → 409 check → series gate → writes
 * (item stamp + job insert + dedicated audit row).
 *
 * Audit goes to `story_queue_dispatch_audit` — works for story-less items
 * (no stories FK). story_workflow_audit is NOT written here: its story_id is
 * NOT NULL and story-less items are the common Strategos case.
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
  const v = await verifyBlueprintApproval(supabase, blueprintRef, queueItemId)
  if (!v.ok) {
    // Rejected dispatch attempts are auditable too (best-effort: the table
    // has no FK, so this write is safe even for unknown item ids).
    try {
      await supabase.from(DISPATCH_AUDIT_TABLE).insert({
        actor: input.authorizedBy,
        action: 'dispatch_rejected',
        queue_item_id: queueItemId,
        blueprint_ref: blueprintRef,
        reason: v.reason || 'blueprint not approved',
      })
    } catch {}
    throw new DispatchError(v.reason || 'blueprint not approved', 422)
  }

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
    // Best-effort revert of step 5 — restore ALL FOUR stamped columns
    // (D3 fix: the draft restored only authorized+status).
    await supabase
      .from('story_queue_items')
      .update({
        authorized: queueItem.authorized === true,
        status: queueItem.status,
        released_to_hal: (queueItem as any).released_to_hal === true,
        released_to_hal_at: (queueItem as any).released_to_hal_at ?? null,
      })
      .eq('id', queueItemId)
    throw new DispatchError(insertError.message || 'Failed to create production job', 500)
  }

  // 7. Dedicated audit row — works for story-less items (no stories FK).
  const { error: auditError } = await supabase.from(DISPATCH_AUDIT_TABLE).insert({
    actor: input.authorizedBy,
    action: 'dispatched',
    queue_item_id: queueItemId,
    blueprint_ref: blueprintRef,
    reason:
      `authorized+dispatched via story-queue dispatch (job:${job.id})` +
      (input.reason ? ` ${input.reason}` : ''),
  })
  if (auditError) console.error('[dispatch] dispatch audit insert failed (non-fatal):', auditError)

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
