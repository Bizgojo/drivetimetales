/**
 * __tests__/guards-bell-001.test.ts — BELL-FREEZE-GUARD-001
 *
 * Unit tests for frozenGuard and freezePreflight.
 *
 * These pin the invariants that would have prevented the PV2 re-freeze incident
 * (2026-08-05): story re-frozen with unauthorized Lena voice change before Marc
 * gave ear re-approval.
 *
 * Invariants tested:
 *   FROZEN-1: Non-frozen story → always allowed.
 *   FROZEN-2: Frozen story, no unlock decision → blocked.
 *   FROZEN-3: Frozen story + explicit unlockDecisionId present → allowed.
 *   FROZEN-4: Frozen story + generic short-id unlock present → allowed.
 *   FROZEN-5: Frozen story + unlock decision with value "rejected" → blocked.
 *   FROZEN-6: Null/missing manifest → treated as not frozen → allowed.
 *   PREFLIGHT-1: Required approval decision present → allowed.
 *   PREFLIGHT-2: Required approval decision missing → blocked.
 *   PREFLIGHT-3: Approval present but value is "rejected" → blocked.
 *   PREFLIGHT-4: Approval present but older than requireAfterTimestamp → blocked.
 *   PREFLIGHT-5: Approval present and newer than requireAfterTimestamp → allowed.
 *   PREFLIGHT-6: requireAfterTimestamp absent → timestamp not checked.
 */

import { checkFrozenGuard, assertNotFrozen, type Decision, type FrozenManifest } from '@/lib/guards/frozenGuard'
import { checkFreezePrerequisites, assertFreezePrerequisitesMet } from '@/lib/guards/freezePreflight'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STORY_ID = 'a88084ab-62e3-47f4-9b7a-5cbc32943349' // PV2
const SHORT_ID = 'a88084ab'

const FROZEN_MANIFEST: FrozenManifest = {
  frozen: true,
  frozen_at: '2026-07-29T22:09:00.000Z',
  frozen_revision: 'approved-rev6',
  frozen_by: 'Marc Postlewaite — 2026-07-29 22:09 EDT',
}

const LIVE_MANIFEST: FrozenManifest = {
  frozen: false,
}

const APPROVAL_DECISION: Decision = {
  decision_id: 'pv2-ear-approval-rev7',
  value: 'approved',
  timestamp: '2026-08-06T15:00:00.000Z',
  description: 'Marc ear approval for PV2 rev7',
}

const UNLOCK_DECISION: Decision = {
  decision_id: `${SHORT_ID}-unlock`,
  value: 'unlocked',
  timestamp: '2026-08-06T14:00:00.000Z',
  description: 'Marc unlocked PV2 for re-freeze',
}

const EXPLICIT_UNLOCK: Decision = {
  decision_id: 'pv2-rev7-unlock',
  value: 'unlocked',
  timestamp: '2026-08-06T14:30:00.000Z',
}

const REJECTED_DECISION: Decision = {
  decision_id: 'pv2-ear-approval-rev7',
  value: 'rejected',
  timestamp: '2026-08-06T15:00:00.000Z',
}

// ─── FrozenGuard ─────────────────────────────────────────────────────────────

describe('BELL-FREEZE-GUARD-001 [frozenGuard]', () => {

  test('FROZEN-1: non-frozen story → allowed', () => {
    const result = checkFrozenGuard({
      manifest: LIVE_MANIFEST,
      storyId: STORY_ID,
      operation: 'regen-segment-0030',
      decisions: [],
    })
    expect(result.allowed).toBe(true)
    expect(result.frozen).toBe(false)
    expect(result.unlockedByDecision).toBeNull()
  })

  test('FROZEN-2: frozen story, no unlock decision → blocked', () => {
    const result = checkFrozenGuard({
      manifest: FROZEN_MANIFEST,
      storyId: STORY_ID,
      operation: 'regen-segment-0030',
      decisions: [],
    })
    expect(result.allowed).toBe(false)
    expect(result.frozen).toBe(true)
    expect(result.frozenAt).toBe('2026-07-29T22:09:00.000Z')
    expect(result.frozenBy).toBe('Marc Postlewaite — 2026-07-29 22:09 EDT')
    expect(result.reason).toContain('BELL-FREEZE-GUARD-001')
    expect(result.reason).toContain(STORY_ID)
  })

  test('FROZEN-3: frozen story + explicit unlockDecisionId present → allowed', () => {
    const result = checkFrozenGuard({
      manifest: FROZEN_MANIFEST,
      storyId: STORY_ID,
      operation: 'rebuild-final-mix',
      decisions: [EXPLICIT_UNLOCK],
      unlockDecisionId: 'pv2-rev7-unlock',
    })
    expect(result.allowed).toBe(true)
    expect(result.frozen).toBe(true)
    expect(result.unlockedByDecision).toBe('pv2-rev7-unlock')
  })

  test('FROZEN-4: frozen story + generic short-id unlock pattern → allowed', () => {
    const result = checkFrozenGuard({
      manifest: FROZEN_MANIFEST,
      storyId: STORY_ID,
      operation: 'regen-segment-0030',
      decisions: [UNLOCK_DECISION],
    })
    expect(result.allowed).toBe(true)
    expect(result.unlockedByDecision).toBe(`${SHORT_ID}-unlock`)
  })

  test('FROZEN-5: frozen story + unlock decision with value "rejected" → blocked', () => {
    const rejectedUnlock: Decision = {
      ...UNLOCK_DECISION,
      value: 'rejected',
    }
    const result = checkFrozenGuard({
      manifest: FROZEN_MANIFEST,
      storyId: STORY_ID,
      operation: 'regen-segment-0030',
      decisions: [rejectedUnlock],
    })
    expect(result.allowed).toBe(false)
    expect(result.unlockedByDecision).toBeNull()
  })

  test('FROZEN-6: null manifest → treated as not frozen → allowed', () => {
    const result = checkFrozenGuard({
      manifest: null,
      storyId: STORY_ID,
      operation: 'initial-render',
      decisions: [],
    })
    expect(result.allowed).toBe(true)
    expect(result.frozen).toBe(false)
  })

  test('FROZEN-ERR: assertNotFrozen throws when blocked', () => {
    expect(() => assertNotFrozen({
      manifest: FROZEN_MANIFEST,
      storyId: STORY_ID,
      operation: 'regen-segment-0030',
      decisions: [],
    })).toThrow('BELL-FREEZE-GUARD-001')
  })

  test('FROZEN-ERR: assertNotFrozen does not throw when allowed', () => {
    expect(() => assertNotFrozen({
      manifest: LIVE_MANIFEST,
      storyId: STORY_ID,
      operation: 'initial-render',
      decisions: [],
    })).not.toThrow()
  })
})

// ─── FreezePreflight ─────────────────────────────────────────────────────────

describe('BELL-FREEZE-GUARD-001 [freezePreflight]', () => {

  test('PREFLIGHT-1: required approval present → allowed', () => {
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [APPROVAL_DECISION],
    })
    expect(result.allowed).toBe(true)
    expect(result.approvalFound).toBe(true)
    expect(result.approvalDecisionId).toBe('pv2-ear-approval-rev7')
  })

  test('PREFLIGHT-2: required approval missing → blocked', () => {
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [],
    })
    expect(result.allowed).toBe(false)
    expect(result.approvalFound).toBe(false)
    expect(result.reason).toContain('BELL-FREEZE-GUARD-001')
    expect(result.reason).toContain('pv2-ear-approval-rev7')
  })

  test('PREFLIGHT-3: approval present but value is "rejected" → blocked', () => {
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [REJECTED_DECISION],
    })
    expect(result.allowed).toBe(false)
    expect(result.approvalFound).toBe(true)
    expect(result.reason).toContain('rejected')
  })

  test('PREFLIGHT-4: approval timestamp older than requireAfterTimestamp → blocked', () => {
    const oldApproval: Decision = {
      ...APPROVAL_DECISION,
      timestamp: '2026-07-29T22:10:00.000Z', // before the change
    }
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [oldApproval],
      options: {
        requireAfterTimestamp: '2026-08-05T00:00:00.000Z', // Mara fix change date
      },
    })
    expect(result.allowed).toBe(false)
    expect(result.approvalFound).toBe(true)
    expect(result.reason).toContain('predates')
  })

  test('PREFLIGHT-5: approval timestamp newer than requireAfterTimestamp → allowed', () => {
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [APPROVAL_DECISION], // 2026-08-06T15:00
      options: {
        requireAfterTimestamp: '2026-08-05T00:00:00.000Z',
      },
    })
    expect(result.allowed).toBe(true)
  })

  test('PREFLIGHT-6: no requireAfterTimestamp → timestamp not checked', () => {
    const veryOldApproval: Decision = {
      ...APPROVAL_DECISION,
      timestamp: '2020-01-01T00:00:00.000Z',
    }
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [veryOldApproval],
      // No requireAfterTimestamp
    })
    expect(result.allowed).toBe(true)
  })

  test('PREFLIGHT-ERR: assertFreezePrerequisitesMet throws when blocked', () => {
    expect(() => assertFreezePrerequisitesMet({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [],
    })).toThrow('BELL-FREEZE-GUARD-001')
  })

  test('PREFLIGHT-ERR: assertFreezePrerequisitesMet does not throw when allowed', () => {
    expect(() => assertFreezePrerequisitesMet({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [APPROVAL_DECISION],
    })).not.toThrow()
  })

  test('PREFLIGHT-LABEL: label appears in error message', () => {
    const result = checkFreezePrerequisites({
      storyId: STORY_ID,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: [],
      options: { label: 'PV2 rev7' },
    })
    expect(result.reason).toContain('PV2 rev7')
  })
})

// ─── PV2 incident regression ─────────────────────────────────────────────────

describe('PV2 incident regression (2026-08-05)', () => {
  /**
   * The actual failure:
   * PV2 was frozen rev6 (approved 2026-07-29). A patch script re-rendered
   * segment_0030 (for Mara name fix — authorized) AND snuck in a Lena voice
   * change (NOT authorized). The mix was re-frozen before Marc gave ear
   * re-approval. These tests confirm both guards would have blocked it.
   */

  const pv2Id = 'a88084ab-62e3-47f4-9b7a-5cbc32943349'
  const rev6FrozenManifest: FrozenManifest = {
    frozen: true,
    frozen_at: '2026-07-29T22:09:00.000Z',
    frozen_revision: 'approved-rev6',
    frozen_by: 'Marc Postlewaite — 2026-07-29 22:09 EDT',
  }

  // No re-approval decision was present when the patch ran (Aug 5)
  const decisionsAtTimeOfIncident: Decision[] = []

  test('frozenGuard blocks regen-segment-0030 on frozen PV2', () => {
    const result = checkFrozenGuard({
      manifest: rev6FrozenManifest,
      storyId: pv2Id,
      operation: 'regen-segment-0030 (Mara name fix)',
      decisions: decisionsAtTimeOfIncident,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('regen-segment-0030')
  })

  test('freezePreflight blocks re-freeze without approval', () => {
    const result = checkFreezePrerequisites({
      storyId: pv2Id,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: decisionsAtTimeOfIncident,
      options: { label: 'PV2 rev7 re-freeze' },
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Marc must approve')
  })

  test('both guards pass once Marc gives ear re-approval and unlock', () => {
    const decisionsAfterApproval: Decision[] = [
      {
        decision_id: 'pv2-ear-approval-rev7',
        value: 'approved',
        timestamp: '2026-08-06T15:00:00.000Z',
        description: 'Marc ear approval for PV2 rev7',
      },
      {
        decision_id: `${pv2Id.slice(0, 8)}-unlock`,
        value: 'unlocked',
        timestamp: '2026-08-06T14:00:00.000Z',
        description: 'Marc unlocked PV2 for re-freeze',
      },
    ]

    const frozen = checkFrozenGuard({
      manifest: rev6FrozenManifest,
      storyId: pv2Id,
      operation: 'regen-segment-0030',
      decisions: decisionsAfterApproval,
    })
    expect(frozen.allowed).toBe(true)

    const preflight = checkFreezePrerequisites({
      storyId: pv2Id,
      requiredDecisionId: 'pv2-ear-approval-rev7',
      decisions: decisionsAfterApproval,
      options: {
        requireAfterTimestamp: '2026-08-05T00:00:00.000Z',
        label: 'PV2 rev7',
      },
    })
    expect(preflight.allowed).toBe(true)
  })
})
