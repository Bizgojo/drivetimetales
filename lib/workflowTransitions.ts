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
