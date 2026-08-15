/**
 * lib/guards/frozenGuard.ts — BELL-FREEZE-GUARD-001 v1.1 (Frozen Guard)
 *
 * Prevents any operation on a frozen story unless Marc has explicitly unlocked it
 * via a decisions-log entry.
 *
 * Root cause prevented: PV2 was frozen (Marc approval 2026-07-29), then re-rendered
 * with an unauthorized Lena voice change, then re-frozen BEFORE Marc ear re-approval.
 * This guard would have blocked both the re-render and the re-freeze.
 *
 * v1.1 — GUARD-HOLE FIX (Marc, 2026-08-06):
 * Original guard read decisions log and accepted ANY decision-log entry matching
 * the unlock pattern — including entries an agent wrote for itself.
 * An agent self-issued two unlocks on 2026-08-06 before this fix.
 *
 * Fix: unlock entries for FROZEN PROMOS must include a non-empty `marc_verbatim`
 * field containing Marc's actual quoted authorization text. Without it, the unlock
 * is rejected even if the decision_id pattern matches.
 *
 * PROTOCOL RULE (enforced here):
 *   — No agent may author a promo unlock entry.
 *   — Unlock entries MUST quote Marc's verbatim authorization text in marc_verbatim.
 *   — An unlock record without marc_verbatim is treated as blocked.
 *
 * Usage (API route):
 *   import { checkFrozenGuard } from '@/lib/guards/frozenGuard'
 *   const guard = checkFrozenGuard({ manifest, storyId, operation: 'generate-voices', decisions })
 *   if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: 403 })
 *
 * Usage (script — see scripts/lib/guardChecks.js for CJS wrapper):
 *   const { checkFrozenGuard } = require('./scripts/lib/guardChecks')
 *   checkFrozenGuard({ manifest, storyId, operation: 'pv2-regen', decisions })
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
  /**
   * REQUIRED for promo unlock entries (v1.1 guard-hole fix, Marc 2026-08-06).
   * Must contain Marc's verbatim authorization text as received.
   * An unlock record without this field is rejected by the guard regardless of
   * decision_id pattern match. No agent may write a promo unlock without this.
   */
  marc_verbatim?: string
}

export interface FrozenManifest {
  frozen?: boolean
  frozen_at?: string
  frozen_revision?: string
  frozen_by?: string
  [key: string]: unknown
}

export interface FrozenGuardResult {
  /** Whether the operation is allowed to proceed. */
  allowed: boolean
  /** Whether the story manifest has frozen=true. */
  frozen: boolean
  frozenAt: string | null
  frozenRevision: string | null
  frozenBy: string | null
  /** The decision_id that unlocked this story, if any. */
  unlockedByDecision: string | null
  /** Human-readable explanation. */
  reason: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Core guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a story's manifest allows the requested operation.
 *
 * A frozen story can only proceed if an explicit unlock decision is present in
 * the decisions log. The unlock decision must NOT have value "rejected" or "revoked".
 *
 * Unlock decision resolution order:
 *   1. Explicit `unlockDecisionId` param (preferred — exact match)
 *   2. `<storyId-8char-prefix>-unlock` pattern (fallback generic unlock)
 *   3. Full `<storyId>-unlock` pattern
 *
 * @param manifest - Loaded sfx-manifest.json (or null if story has no manifest yet)
 * @param storyId - Story UUID
 * @param operation - Human-readable description of what is being attempted (for error messages)
 * @param decisions - Array of Decision objects (today + yesterday from decisions log)
 * @param unlockDecisionId - Optional: specific decision_id that explicitly unlocks this story
 */
export function checkFrozenGuard(params: {
  manifest: FrozenManifest | null
  storyId: string
  operation: string
  decisions: Decision[]
  unlockDecisionId?: string
}): FrozenGuardResult {
  const { manifest, storyId, operation, decisions, unlockDecisionId } = params

  // Not frozen — allow
  if (!manifest || !manifest.frozen) {
    return {
      allowed: true,
      frozen: false,
      frozenAt: null,
      frozenRevision: null,
      frozenBy: null,
      unlockedByDecision: null,
      reason: 'Story is not frozen.',
    }
  }

  const frozenAt = manifest.frozen_at ?? null
  const frozenRevision = manifest.frozen_revision ?? null
  const frozenBy = manifest.frozen_by ?? null

  // Helper: is a decision value an affirmative unlock (not rejected/revoked)?
  function isAffirmative(value: string): boolean {
    const v = value.toLowerCase().trim()
    return v !== 'rejected' && v !== 'revoked' && v !== 'blocked' && v !== 'denied'
  }

  /**
   * v1.1 GUARD-HOLE FIX: promo unlock entries MUST include marc_verbatim.
   * Without Marc's verbatim text in the record, the unlock is rejected even if
   * the decision_id pattern matches. This prevents agents from self-issuing unlocks.
   */
  function hasMarcVerbatim(d: Decision): boolean {
    return typeof d.marc_verbatim === 'string' && d.marc_verbatim.trim().length > 0
  }

  // 1. Check explicit unlock decision id
  if (unlockDecisionId) {
    const d = decisions.find(x => x.decision_id === unlockDecisionId)
    if (d && isAffirmative(d.value)) {
      if (!hasMarcVerbatim(d)) {
        return {
          allowed: false,
          frozen: true,
          frozenAt,
          frozenRevision,
          frozenBy,
          unlockedByDecision: null,
          reason:
            `BELL-FREEZE-GUARD-001 v1.1 [frozenGuard]: Unlock decision "${unlockDecisionId}" found but` +
            ` REJECTED — missing required marc_verbatim field. Promo unlocks require Marc's verbatim` +
            ` authorization text. No agent may self-issue a promo unlock. (ATL-GUARD-HOLE-FIX-001)`,
        }
      }
      return {
        allowed: true,
        frozen: true,
        frozenAt,
        frozenRevision,
        frozenBy,
        unlockedByDecision: unlockDecisionId,
        reason: `Story is frozen but explicitly unlocked by decision "${unlockDecisionId}" (${d.timestamp}).`,
      }
    }
  }

  // 2. Check generic unlock by short-id pattern
  const shortId = storyId.slice(0, 8)
  const patterns = [`${shortId}-unlock`, `${storyId}-unlock`]
  for (const pattern of patterns) {
    const d = decisions.find(x => x.decision_id === pattern)
    if (d && isAffirmative(d.value)) {
      if (!hasMarcVerbatim(d)) {
        return {
          allowed: false,
          frozen: true,
          frozenAt,
          frozenRevision,
          frozenBy,
          unlockedByDecision: null,
          reason:
            `BELL-FREEZE-GUARD-001 v1.1 [frozenGuard]: Unlock decision "${d.decision_id}" found but` +
            ` REJECTED — missing required marc_verbatim field. Promo unlocks require Marc's verbatim` +
            ` authorization text. No agent may self-issue a promo unlock. (ATL-GUARD-HOLE-FIX-001)`,
        }
      }
      return {
        allowed: true,
        frozen: true,
        frozenAt,
        frozenRevision,
        frozenBy,
        unlockedByDecision: d.decision_id,
        reason: `Story is frozen but unlocked by decision "${d.decision_id}" (${d.timestamp}).`,
      }
    }
  }

  // Blocked
  const unlockKey = unlockDecisionId ?? `${shortId}-unlock`
  return {
    allowed: false,
    frozen: true,
    frozenAt,
    frozenRevision,
    frozenBy,
    unlockedByDecision: null,
    reason:
      `BELL-FREEZE-GUARD-001 [frozenGuard]: Story ${storyId} is frozen` +
      (frozenAt ? ` (frozen_at=${frozenAt})` : '') +
      (frozenBy ? `, frozen_by="${frozenBy}"` : '') +
      `. Operation "${operation}" is blocked. Only Marc can unlock.` +
      ` Required decisions-log entry: decision_id="${unlockKey}".`,
  }
}

/**
 * Throws if the frozen guard blocks the operation.
 * Convenience wrapper for early-exit scripts / throwaway callers.
 */
export function assertNotFrozen(params: Parameters<typeof checkFrozenGuard>[0]): void {
  const result = checkFrozenGuard(params)
  if (!result.allowed) {
    throw new Error(result.reason)
  }
}
