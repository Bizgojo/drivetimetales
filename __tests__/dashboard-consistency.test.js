'use strict'
/**
 * dashboard-consistency.test.js
 *
 * Plain JS, no new packages — uses only Node's built-in assert module.
 *
 * Tests the invariants between blockers.json (structured blocker SSoT)
 * and the Command Center "Needs Your Decision" panel and agent card displays.
 *
 * Run with: node __tests__/dashboard-consistency.test.js
 */

const assert = require('assert')

// ─── Data processing helpers (mirrors page.tsx logic) ────────────────────────

/**
 * Returns the count of marc-owned open blockers that should appear
 * in the "Needs Your Decision" panel.
 */
function getMarcDecisionCount(structuredBlockers) {
  return structuredBlockers.filter(
    b => b.requires_marc_action === true && b.status === 'open'
  ).length
}

/**
 * Returns whether the "All resolved" label should be shown.
 * Must be true only when ZERO marc-action open blockers exist.
 */
function shouldShowAllResolved(structuredBlockers, legacyMarcActions) {
  const marcOpenCount = getMarcDecisionCount(structuredBlockers)
  const legacyActiveCount = legacyMarcActions.filter(a => !a.done && a.resolution === null).length
  return marcOpenCount === 0 && legacyActiveCount === 0
}

/**
 * Returns all blocked text that would render on agent cards.
 * Only looks at structured blocker records (no free text).
 */
function getAgentCardBlockedTexts(agentsState, structuredBlockers) {
  const results = []
  for (const [agentId, state] of Object.entries(agentsState)) {
    const blockerIds = state.blockerIds ?? []
    const agentBlockers = blockerIds
      .map(id => structuredBlockers.find(b => b.id === id))
      .filter(b => b && b.status !== 'superseded')
    for (const blocker of agentBlockers) {
      results.push({ agentId, blocker })
    }
  }
  return results
}

/**
 * Returns agent-card blocked items that mention "Marc" as owner
 * (requires_marc_action: true).
 */
function getAgentCardMarcOwnedItems(agentsState, structuredBlockers) {
  return getAgentCardBlockedTexts(agentsState, structuredBlockers).filter(
    ({ blocker }) => blocker.requires_marc_action === true && blocker.status === 'open'
  )
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const OPEN_MARC_BLOCKER = {
  id: 'blk-bart-x-billing',
  blocked_agent: 'bart',
  owner: 'marc',
  requires_marc_action: true,
  status: 'open',
  headline: 'Check X/Twitter API billing',
  context: 'Bart needs billing info.',
  recommendation: 'Check the billing tab.',
  resolution_target: 'BART-001',
  updated_at: '2026-06-12T15:44:00Z',
}

const INTERNAL_DEP_BLOCKER = {
  id: 'blk-maya-autoplay',
  blocked_agent: 'maya',
  owner: 'atlas',
  requires_marc_action: false,
  status: 'open',
  headline: 'Waiting on Atlas: autoplay build',
  context: 'Maya needs autoplay first.',
  recommendation: 'Atlas to complete P2-1.',
  resolution_target: 'P2-1',
  updated_at: '2026-06-12T15:44:00Z',
}

const SUPERSEDED_BLOCKER = {
  id: 'blk-hal-belle-voice',
  blocked_agent: 'hal',
  owner: 'resolved',
  requires_marc_action: false,
  status: 'superseded',
  headline: 'Belle B canonical voice ID',
  context: 'Resolved.',
  recommendation: 'No action needed.',
  resolution_target: 'WO-001-RevD',
  updated_at: '2026-06-12T15:44:00Z',
}

const AGENTS_STATE_WITH_BLOCKERS = {
  bart: { status: 'working', currentTask: 'Financial model', waitingOn: '', blockerIds: ['blk-bart-x-billing'] },
  maya: { status: 'waiting', currentTask: 'Waiting', waitingOn: '', blockerIds: ['blk-maya-autoplay'] },
  hal:  { status: 'working', currentTask: 'Repair pipeline', waitingOn: '', blockerIds: [] },
  vega: { status: 'waiting', currentTask: 'QC ready', waitingOn: '', blockerIds: ['blk-vega-m1-story1'] },
}

const VEGA_BLOCKER = {
  id: 'blk-vega-m1-story1',
  blocked_agent: 'vega',
  owner: 'hal',
  requires_marc_action: false,
  status: 'open',
  headline: 'Waiting on Hal: M-1 Story #1 audio repair',
  context: 'Vega needs audio repair first.',
  recommendation: 'Hal to complete pipeline.',
  resolution_target: 'M-1-STORY-1',
  updated_at: '2026-06-12T15:44:00Z',
}

const ALL_STRUCTURED_BLOCKERS = [
  OPEN_MARC_BLOCKER,
  INTERNAL_DEP_BLOCKER,
  VEGA_BLOCKER,
  SUPERSEDED_BLOCKER,
]

// ─── Tests ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err.message}`)
    failed++
  }
}

console.log('\n📊 Dashboard Consistency Tests\n')

// Test 1: "All resolved" only shows when zero marc-action open blockers
test('All resolved shown when NO open marc-action blockers', () => {
  const emptyBlockers = []
  assert.strictEqual(
    shouldShowAllResolved(emptyBlockers, []),
    true,
    'Should show "All resolved" when no open marc-action blockers'
  )
})

test('All resolved NOT shown when open marc-action blocker exists', () => {
  const withMarc = [OPEN_MARC_BLOCKER]
  assert.strictEqual(
    shouldShowAllResolved(withMarc, []),
    false,
    'Should NOT show "All resolved" when a marc-action open blocker exists'
  )
})

// Test 2: Panel count equals filtered marc-action open blockers
test('Panel count equals marc-action open blocker count', () => {
  const count = getMarcDecisionCount(ALL_STRUCTURED_BLOCKERS)
  // Only blk-bart-x-billing has requires_marc_action: true AND status: open
  assert.strictEqual(count, 1, `Expected 1 marc-action blocker, got ${count}`)
})

test('Panel count is 0 when all blockers are internal dependencies', () => {
  const internalOnly = [INTERNAL_DEP_BLOCKER, VEGA_BLOCKER]
  const count = getMarcDecisionCount(internalOnly)
  assert.strictEqual(count, 0, 'Internal-dependency blockers should not count as Marc decisions')
})

// Test 3: Agent cards with requires_marc_action: false must NOT show "Marc" as decision owner
test('Internal-dep blockers do NOT have requires_marc_action=true', () => {
  const internalBlockers = ALL_STRUCTURED_BLOCKERS.filter(b => !b.requires_marc_action)
  for (const b of internalBlockers) {
    assert.strictEqual(
      b.requires_marc_action,
      false,
      `Blocker ${b.id} should have requires_marc_action=false`
    )
    assert.notStrictEqual(
      b.owner.toLowerCase(),
      'marc',
      `Internal blocker ${b.id} should not have owner=marc`
    )
  }
})

// Test 4: Superseded blockers do NOT contribute to card blocked text
test('Superseded blocker does not appear on agent card', () => {
  const halState = AGENTS_STATE_WITH_BLOCKERS.hal
  const halBlockers = (halState.blockerIds ?? [])
    .map(id => ALL_STRUCTURED_BLOCKERS.find(b => b.id === id))
    .filter(b => b && b.status !== 'superseded')
  assert.strictEqual(halBlockers.length, 0, 'Hal should have no visible blockers (Belle B is superseded)')
})

// Test 5: Decision count === agent-card marc-owned blocker count
test('Top-level decision count equals agent-card marc-owned blocker count', () => {
  const panelCount = getMarcDecisionCount(ALL_STRUCTURED_BLOCKERS)
  const agentCardMarcItems = getAgentCardMarcOwnedItems(AGENTS_STATE_WITH_BLOCKERS, ALL_STRUCTURED_BLOCKERS)
  assert.strictEqual(
    panelCount,
    agentCardMarcItems.length,
    `Panel count (${panelCount}) must equal agent-card marc-owned blocker count (${agentCardMarcItems.length})`
  )
})

// Test 6: Internal dependencies labeled "Waiting on [agent]", not "Marc decision"
test('Internal dep blockers have non-marc owner', () => {
  const internalBlockers = ALL_STRUCTURED_BLOCKERS.filter(
    b => !b.requires_marc_action && b.status === 'open'
  )
  for (const b of internalBlockers) {
    // Label would be "Waiting on [owner]" — never "Marc decision"
    assert.notStrictEqual(b.owner, 'marc', `Internal dep blocker ${b.id} should not have owner=marc`)
    assert.ok(b.owner.length > 0, `Internal dep blocker ${b.id} should have a named owner`)
  }
})

// Test 7: Blocker records have all required fields
test('All blocker records have required fields', () => {
  const requiredFields = ['id', 'owner', 'blocked_agent', 'requires_marc_action', 'status', 'recommendation', 'updated_at', 'resolution_target']
  for (const b of ALL_STRUCTURED_BLOCKERS) {
    for (const field of requiredFields) {
      assert.ok(field in b, `Blocker ${b.id} is missing required field: ${field}`)
      assert.notStrictEqual(b[field], undefined, `Blocker ${b.id}.${field} must not be undefined`)
    }
  }
})

// Test 8: Unblock/View link available for each blocked agent
test('Each non-superseded blocked agent has a resolution_target for Unblock/View link', () => {
  const activeBlockers = ALL_STRUCTURED_BLOCKERS.filter(b => b.status === 'open')
  for (const b of activeBlockers) {
    assert.ok(b.resolution_target, `Blocker ${b.id} must have a resolution_target for Unblock/View link`)
    assert.ok(b.resolution_target.length > 0, `Blocker ${b.id}.resolution_target must not be empty`)
  }
})

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  process.exit(1)
} else {
  console.log('✅ All dashboard consistency tests passed.\n')
}
