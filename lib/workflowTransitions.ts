/**
 * Canonical story workflow state machine (PIPE-AUDIT-001).
 *
 * Extracted from app/api/admin/content-approval/route.ts so that:
 *  1. every writer can share ONE transition guard, and
 *  2. the matrix is unit-testable (__tests__/pipe-audit-001.test.ts).
 *
 * GOVERNANCE (ORION-GOV-006): all stories.workflow_state changes must go
 * through a guarded writer that sets workflow_state_changed_by/_at/_reason.
 * Known writers as of 2026-07-09 (see PIPE-AUDIT-001 report for full table):
 *  - app/api/admin/content-approval/route.ts   (guarded via transitionAllowed)
 *  - app/api/admin/publish-story/route.ts      (guarded via publishability gates)
 *  - app/api/cron/dispatch-queue/route.ts      (cron writer — repair_queue / dedup flagging)
 *  - app/api/admin/production-jobs/run-next    (runner promotion → ready_for_review)
 *  - agent scripts (hal/orion)                 (MUST honor this matrix)
 */

export const WORKFLOW_STATES = [
  'stories_in_queue',
  'scripts_ready',
  'ready_for_review',
  'approved_ready',
  'repair_queue',
  'being_repaired',
  'failed',
  'unpublished_library',
  'cold_storage',
  'published',
] as const

export type WorkflowStateName = (typeof WORKFLOW_STATES)[number]

export function isWorkflowState(value: unknown): value is WorkflowStateName {
  return (WORKFLOW_STATES as readonly string[]).includes(String(value ?? '').trim())
}

/**
 * from-state → allowed to-states.
 * NOTE: cold_storage → stories_in_queue is intentionally NOT in the matrix;
 * requeue-from-cold-storage is only legal through the dedicated
 * recover_from_cold_storage action (which resets review fields) or an
 * explicitly documented agent runbook. Direct writers must not invent it.
 */
export const WORKFLOW_TRANSITIONS: Record<string, WorkflowStateName[]> = {
  ready_for_review: ['approved_ready', 'repair_queue', 'cold_storage'],
  approved_ready: ['published', 'repair_queue', 'cold_storage'],
  repair_queue: ['being_repaired', 'ready_for_review', 'cold_storage'],
  being_repaired: ['ready_for_review', 'cold_storage'],
  failed: ['being_repaired', 'repair_queue', 'ready_for_review', 'cold_storage'],
  stories_in_queue: ['scripts_ready', 'ready_for_review', 'repair_queue', 'cold_storage'],
  scripts_ready: ['ready_for_review', 'repair_queue', 'cold_storage'],
  published: ['unpublished_library', 'repair_queue'],
  unpublished_library: ['ready_for_review', 'repair_queue', 'cold_storage'],
  cold_storage: ['ready_for_review'],
}

/**
 * Central transition guard. `retire` unlocks the published → cold_storage
 * retirement path only.
 */
export function transitionAllowed(from: string, to: string, retire = false): boolean {
  if (!isWorkflowState(to)) return false
  if (from === 'published' && to === 'cold_storage') return retire
  return (WORKFLOW_TRANSITIONS[from] || []).includes(to as WorkflowStateName)
}

// ── ATL-FOLLOWUP-002: repair-bucket doctrine (Marc ruling 2026-07-09) ────────

/**
 * The hold bucket. DB state values are unchanged in this work order
 * (two-phase plan); consoles display the bucket as PRODUCTION_HOLDS_LABEL.
 */
export const PRODUCTION_HOLD_STATES = ['repair_queue', 'being_repaired'] as const

/** UI display label for the repair_queue bucket. DB rename is a later migration. */
export const PRODUCTION_HOLDS_LABEL = 'Production Holds'

/** Canonical audit reason for the one-repair-pass doctrine. */
export const ONE_REPAIR_PASS_REASON =
  'one repair pass only; second production failure = cold storage'

export function isProductionHoldState(state: string | null | undefined): boolean {
  return (PRODUCTION_HOLD_STATES as readonly string[]).includes(String(state ?? '').trim())
}

/**
 * Should this transition increment stories.production_repair_count?
 *
 * Rules (Marc 2026-07-09):
 *  - Counts ONLY when a story leaves the hold bucket back into the pipeline
 *    (not hold → hold, and not hold → cold_storage — cold storage is not a
 *    repair; it is the terminal outcome).
 *  - Counts ONLY when the release followed a technical repair that changed
 *    the story record. Pipeline-defect releases — our bugs, where a code fix
 *    unblocked the story and the story record was never touched — do NOT count.
 *  - `storyRecordChanged` is the explicit signal from the writer. When the
 *    writer does not know (undefined/null), we infer from the state machine:
 *    leaving `being_repaired` implies a repair pass was performed on the
 *    story (that is what the state means); a direct `repair_queue` → release
 *    without entering being_repaired means the story was unblocked without
 *    anyone repairing the record (typically a pipeline/code fix) and does
 *    not consume the repair pass.
 */
export function shouldIncrementRepairCount(params: {
  from: string
  to: string
  storyRecordChanged?: boolean | null
}): boolean {
  const from = String(params.from ?? '').trim()
  const to = String(params.to ?? '').trim()
  if (!isProductionHoldState(from)) return false
  if (isProductionHoldState(to)) return false
  if (to === 'cold_storage') return false
  if (params.storyRecordChanged === true) return true
  if (params.storyRecordChanged === false) return false
  return from === 'being_repaired'
}

/**
 * Failure-circuit routing: a story that already consumed its single repair
 * pass and production-fails again goes straight to cold_storage instead of
 * back into the hold bucket.
 */
export function failureDestinationForStory(productionRepairCount: number | null | undefined): {
  state: 'repair_queue' | 'cold_storage'
  doctrineReason: string | null
} {
  if ((productionRepairCount ?? 0) >= 1) {
    return { state: 'cold_storage', doctrineReason: ONE_REPAIR_PASS_REASON }
  }
  return { state: 'repair_queue', doctrineReason: null }
}
