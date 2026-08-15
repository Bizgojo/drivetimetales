/**
 * lib/guards/freezePreflight.ts — BELL-FREEZE-GUARD-001 (Freeze Preflight Guard)
 *
 * Validates that Marc's approval is recorded in the decisions log BEFORE any
 * freeze script is allowed to execute.
 *
 * Root cause prevented: PV2 re-freeze (2026-08-05) proceeded before Marc gave ear
 * re-approval. The freeze-preflight guard requires a named approval decision to be
 * present and — for re-freezes — to have been recorded AFTER the last known change.
 *
 * Usage (script):
 *   const { checkFreezePrerequisites } = require('./scripts/lib/guardChecks')
 *   const check = checkFreezePrerequisites({
 *     storyId: PV2_ID,
 *     requiredDecisionId: 'pv2-ear-approval-rev7',
 *     decisions,
 *   })
 *   if (!check.allowed) { console.error(check.reason); process.exit(1) }
 *
 * Usage (API route):
 *   import { checkFreezePrerequisites } from '@/lib/guards/freezePreflight'
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Decision {
  decision_id: string
  value: string
  timestamp: string
  description?: string
  source?: string
}

export interface FreezePrecheckResult {
  /** Whether the freeze is allowed to proceed. */
  allowed: boolean
  /** Whether the required approval decision was found. */
  approvalFound: boolean
  approvalDecisionId: string | null
  approvalTimestamp: string | null
  /** Human-readable explanation. */
  reason: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Core guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify Marc's approval is present in the decisions log before allowing a freeze.
 *
 * Rules:
 *   1. The required decision must exist in the decisions log.
 *   2. Its value must not be "rejected", "revoked", or "blocked".
 *   3. If `requireAfterTimestamp` is set, the approval timestamp must be AFTER
 *      that point (prevents using a pre-change approval to ratify a post-change freeze).
 *
 * @param storyId - Story UUID (for error messages)
 * @param requiredDecisionId - The exact decision_id that must be present
 *   (e.g. 'pv2-ear-approval-rev7', 'bell-casting-june-harlow-narrator')
 * @param decisions - Array of Decision objects (today + yesterday from decisions log)
 * @param options.requireAfterTimestamp - ISO timestamp: approval must be NEWER than this
 *   (use the timestamp of the last change to prevent stale pre-change approvals)
 * @param options.label - Human label for the story/context (for error messages)
 */
export function checkFreezePrerequisites(params: {
  storyId: string
  requiredDecisionId: string
  decisions: Decision[]
  options?: {
    requireAfterTimestamp?: string
    label?: string
  }
}): FreezePrecheckResult {
  const { storyId, requiredDecisionId, decisions, options } = params
  const label = options?.label ?? storyId

  const approval = decisions.find(d => d.decision_id === requiredDecisionId)

  // Decision not found at all
  if (!approval) {
    return {
      allowed: false,
      approvalFound: false,
      approvalDecisionId: null,
      approvalTimestamp: null,
      reason:
        `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
        ` Required approval decision "${requiredDecisionId}" not found in decisions log.` +
        ` Marc must approve before this story can be frozen.`,
    }
  }

  // Decision found but value is negative
  const v = approval.value.toLowerCase().trim()
  if (v === 'rejected' || v === 'revoked' || v === 'blocked' || v === 'denied') {
    return {
      allowed: false,
      approvalFound: true,
      approvalDecisionId: requiredDecisionId,
      approvalTimestamp: approval.timestamp,
      reason:
        `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
        ` Decision "${requiredDecisionId}" exists but its value is "${approval.value}".` +
        ` Marc must give a positive approval.`,
    }
  }

  // Timestamp constraint: approval must post-date the last change
  if (options?.requireAfterTimestamp) {
    const approvalTs = new Date(approval.timestamp).getTime()
    const requiredAfterTs = new Date(options.requireAfterTimestamp).getTime()
    if (approvalTs < requiredAfterTs) {
      return {
        allowed: false,
        approvalFound: true,
        approvalDecisionId: requiredDecisionId,
        approvalTimestamp: approval.timestamp,
        reason:
          `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
          ` Approval "${requiredDecisionId}" (${approval.timestamp}) predates the` +
          ` required cutoff (${options.requireAfterTimestamp}).` +
          ` Marc must re-approve after the most recent change.`,
      }
    }
  }

  // All checks passed
  return {
    allowed: true,
    approvalFound: true,
    approvalDecisionId: requiredDecisionId,
    approvalTimestamp: approval.timestamp,
    reason: `Approval "${requiredDecisionId}" found (${approval.timestamp}). Freeze allowed for ${label}.`,
  }
}

/**
 * Throws if freeze prerequisites are not met.
 * Convenience wrapper for scripts that want early-exit on failure.
 */
export function assertFreezePrerequisitesMet(params: Parameters<typeof checkFreezePrerequisites>[0]): void {
  const result = checkFreezePrerequisites(params)
  if (!result.allowed) {
    throw new Error(result.reason)
  }
}
