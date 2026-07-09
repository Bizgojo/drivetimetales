/**
 * ATL-FOLLOWUP-002 (ITEM B) — repair-bucket doctrine (Marc ruling 2026-07-09).
 *
 * (1) production_repair_count: incremented only when a story leaves the
 *     production-holds bucket after a TECHNICAL REPAIR that changed the story
 *     record. Pipeline-defect releases (our bugs — a code fix unblocked the
 *     story) must NOT consume the repair pass.
 * (2) One repair pass only: a story with count >= 1 that production-fails
 *     again goes straight to cold_storage with the doctrine audit reason.
 * (3) UI label only: consoles display the repair_queue bucket as
 *     "Production Holds"; the DB state value is unchanged in this work order
 *     (two-phase plan — DB rename is a later migration).
 *
 * Tests import the real canonical matrix module (lib/workflowTransitions.ts).
 *
 * Run: npx jest __tests__/atl-followup-002-production-holds.test.ts --no-coverage
 */

import {
  PRODUCTION_HOLD_STATES,
  PRODUCTION_HOLDS_LABEL,
  ONE_REPAIR_PASS_REASON,
  isProductionHoldState,
  shouldIncrementRepairCount,
  failureDestinationForStory,
  transitionAllowed,
} from '@/lib/workflowTransitions'

describe('production-holds bucket definition', () => {
  it('the hold bucket is repair_queue + being_repaired (DB values unchanged)', () => {
    expect([...PRODUCTION_HOLD_STATES]).toEqual(['repair_queue', 'being_repaired'])
    expect(isProductionHoldState('repair_queue')).toBe(true)
    expect(isProductionHoldState('being_repaired')).toBe(true)
    expect(isProductionHoldState('cold_storage')).toBe(false)
    expect(isProductionHoldState('ready_for_review')).toBe(false)
    expect(isProductionHoldState(null)).toBe(false)
  })

  it('consoles display the bucket as "Production Holds"', () => {
    expect(PRODUCTION_HOLDS_LABEL).toBe('Production Holds')
  })
})

describe('shouldIncrementRepairCount — one repair pass accounting', () => {
  it('counts a repaired story leaving being_repaired back into the pipeline', () => {
    expect(shouldIncrementRepairCount({ from: 'being_repaired', to: 'ready_for_review' })).toBe(true)
  })

  it('counts when the writer explicitly reports the story record was changed', () => {
    expect(
      shouldIncrementRepairCount({ from: 'repair_queue', to: 'ready_for_review', storyRecordChanged: true })
    ).toBe(true)
  })

  it('does NOT count a pipeline-defect release (code fix unblocked it — record untouched)', () => {
    expect(
      shouldIncrementRepairCount({ from: 'being_repaired', to: 'ready_for_review', storyRecordChanged: false })
    ).toBe(false)
    expect(
      shouldIncrementRepairCount({ from: 'repair_queue', to: 'ready_for_review', storyRecordChanged: false })
    ).toBe(false)
  })

  it('does NOT count a direct repair_queue release with no explicit repair signal', () => {
    // Leaving repair_queue without ever entering being_repaired means nobody
    // repaired the record — typically a code fix / manual unblock.
    expect(shouldIncrementRepairCount({ from: 'repair_queue', to: 'ready_for_review' })).toBe(false)
    expect(shouldIncrementRepairCount({ from: 'repair_queue', to: 'ready_for_review', storyRecordChanged: null })).toBe(false)
  })

  it('does NOT count moves within the hold bucket', () => {
    expect(shouldIncrementRepairCount({ from: 'repair_queue', to: 'being_repaired', storyRecordChanged: true })).toBe(false)
  })

  it('does NOT count hold → cold_storage (terminal outcome, not a repair)', () => {
    expect(shouldIncrementRepairCount({ from: 'being_repaired', to: 'cold_storage', storyRecordChanged: true })).toBe(false)
    expect(shouldIncrementRepairCount({ from: 'repair_queue', to: 'cold_storage' })).toBe(false)
  })

  it('does NOT count transitions that do not start in the hold bucket', () => {
    expect(shouldIncrementRepairCount({ from: 'ready_for_review', to: 'repair_queue' })).toBe(false)
    expect(shouldIncrementRepairCount({ from: 'stories_in_queue', to: 'ready_for_review', storyRecordChanged: true })).toBe(false)
  })
})

describe('failureDestinationForStory — one repair pass only', () => {
  it('first production failure goes to the hold bucket', () => {
    expect(failureDestinationForStory(0)).toEqual({ state: 'repair_queue', doctrineReason: null })
    expect(failureDestinationForStory(null)).toEqual({ state: 'repair_queue', doctrineReason: null })
    expect(failureDestinationForStory(undefined)).toEqual({ state: 'repair_queue', doctrineReason: null })
  })

  it('a story that already consumed its repair pass goes straight to cold_storage', () => {
    expect(failureDestinationForStory(1)).toEqual({ state: 'cold_storage', doctrineReason: ONE_REPAIR_PASS_REASON })
    expect(failureDestinationForStory(3)).toEqual({ state: 'cold_storage', doctrineReason: ONE_REPAIR_PASS_REASON })
  })

  it('the audit reason is Marc-exact', () => {
    expect(ONE_REPAIR_PASS_REASON).toBe('one repair pass only; second production failure = cold storage')
  })

  it('both destinations are legal transitions from the dispatch circuit origin state', () => {
    // The dispatch failure circuit moves stories out of stories_in_queue.
    expect(transitionAllowed('stories_in_queue', 'repair_queue')).toBe(true)
    expect(transitionAllowed('stories_in_queue', 'cold_storage')).toBe(true)
  })
})

describe('canonical matrix unchanged by doctrine helpers (regression)', () => {
  it('hold-bucket exits still match PIPE-AUDIT-001 matrix', () => {
    expect(transitionAllowed('repair_queue', 'being_repaired')).toBe(true)
    expect(transitionAllowed('repair_queue', 'ready_for_review')).toBe(true)
    expect(transitionAllowed('repair_queue', 'cold_storage')).toBe(true)
    expect(transitionAllowed('being_repaired', 'ready_for_review')).toBe(true)
    expect(transitionAllowed('being_repaired', 'cold_storage')).toBe(true)
    expect(transitionAllowed('being_repaired', 'published')).toBe(false)
  })
})
