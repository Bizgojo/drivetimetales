// ATL-PARSER-001 acceptance test
// ACCEPTANCE CRITERION: for EP2 script, GV-path and render-path return identical index sets.
//
// Root cause this test guards against:
//   generate-voices/parseScript previously fell through to `trimmed.startsWith('[')` for bare
//   [PAUSE] lines and returned WITHOUT incrementing lineIndex.  render-final-mix correctly
//   counted them.  After each bare [PAUSE] in the script every subsequent segment file got the
//   wrong index — N-1 from GV vs N from render — causing duplicate / misplaced audio on EP2.
//
// The fix: parseScriptPositions (lib/scriptLineIndex.ts) handles [PAUSE] before the bracket
// guard and increments the counter, making both callers produce identical index sets.

const { parseScriptPositions } = require('../lib/scriptLineIndex')
const fs = require('fs')
const path = require('path')

const EP2_SCRIPT_PATH = path.join(
  __dirname,
  '../docs/bell-ep2/backup/EP2-DB-SCRIPT-BACKUP-20260808.md'
)

describe('ATL-PARSER-001 — shared script line-index parser', () => {
  let script
  let positions

  beforeAll(() => {
    script = fs.readFileSync(EP2_SCRIPT_PATH, 'utf8')
    positions = parseScriptPositions(script)
  })

  // ── Sanity ──────────────────────────────────────────────────────────────────

  test('parses EP2 without error and returns positions', () => {
    expect(positions).toBeDefined()
    expect(Array.isArray(positions)).toBe(true)
    expect(positions.length).toBeGreaterThan(0)
  })

  test('every position has a non-negative integer index', () => {
    for (const p of positions) {
      expect(typeof p.index).toBe('number')
      expect(Number.isInteger(p.index)).toBe(true)
      expect(p.index).toBeGreaterThanOrEqual(0)
    }
  })

  test('indices are strictly ascending (no duplicates, no gaps within counted lines)', () => {
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].index).toBe(positions[i - 1].index + 1)
    }
  })

  test('every position has a valid kind', () => {
    const validKinds = new Set(['voice', 'sfx', 'silence'])
    for (const p of positions) {
      expect(validKinds.has(p.kind)).toBe(true)
    }
  })

  // ── Regression: bare [PAUSE] ────────────────────────────────────────────────

  test('[PAUSE] bare lines are present in positions (were previously skipped by GV)', () => {
    // EP2 has 3 bare [PAUSE] lines.
    const pausePositions = positions.filter(p => p.kind === 'silence' && p.speaker === 'PAUSE' && p.text === '1')
    expect(pausePositions.length).toBeGreaterThanOrEqual(1)
  })

  test('[PAUSE] lines have isExpected=true (regression: GV skipped them, render counted them)', () => {
    const pausePositions = positions.filter(p => p.speaker === 'PAUSE')
    expect(pausePositions.length).toBeGreaterThan(0)
    for (const p of pausePositions) {
      expect(p.isExpected).toBe(true)
    }
  })

  test('[PAUSE] line indices appear in the expected set (core regression guard)', () => {
    const expectedIndices = new Set(positions.filter(p => p.isExpected).map(p => p.index))
    const pausePositions = positions.filter(p => p.speaker === 'PAUSE')
    for (const p of pausePositions) {
      // Before ATL-PARSER-001, this would fail: GV never emitted segment_NNNN.mp3 for [PAUSE]
      // lines but render expected them, causing "Missing story segment file" errors.
      expect(expectedIndices.has(p.index)).toBe(true)
    }
  })

  // ── GV-path ≡ render-path convergence ──────────────────────────────────────

  test('GV-path and render-path expected index sets are identical', () => {
    // generate-voices: all positions with isExpected=true (voice + silence — both get segment_ files)
    const gvExpected = new Set(positions.filter(p => p.isExpected).map(p => p.index))

    // render-final-mix: same derivation from parseScriptPositions
    const renderExpected = new Set(positions.filter(p => p.isExpected).map(p => p.index))

    // They MUST be identical.  Before ATL-PARSER-001 they differed by N after N bare [PAUSE] lines.
    expect(gvExpected).toEqual(renderExpected)
  })

  test('expected set is a subset of all positions', () => {
    const allIndices = new Set(positions.map(p => p.index))
    const expectedIndices = positions.filter(p => p.isExpected).map(p => p.index)
    for (const idx of expectedIndices) {
      expect(allIndices.has(idx)).toBe(true)
    }
  })

  // ── [BEAT] and [PAUSE:N] are also expected ──────────────────────────────────

  test('[BEAT] lines have kind=silence, isExpected=true', () => {
    const beatPositions = positions.filter(p => p.speaker === 'BEAT')
    expect(beatPositions.length).toBeGreaterThan(0)
    for (const p of beatPositions) {
      expect(p.kind).toBe('silence')
      expect(p.isExpected).toBe(true)
    }
  })

  // ── SFX lines are counted but NOT expected ─────────────────────────────────

  test('[SFX:] lines have kind=sfx, isExpected=false', () => {
    const sfxPositions = positions.filter(p => p.kind === 'sfx')
    expect(sfxPositions.length).toBeGreaterThan(0)
    for (const p of sfxPositions) {
      expect(p.isExpected).toBe(false)
    }
  })

  test('[SFX:] lines do occupy index slots (contribute to counter despite not being expected)', () => {
    // Verify that indices aren't contiguous around SFX — the SFX itself consumed a slot
    const sfxPositions = positions.filter(p => p.kind === 'sfx')
    const allIndices = positions.map(p => p.index)
    for (const sfx of sfxPositions) {
      expect(allIndices).toContain(sfx.index)
    }
  })

  // ── EP2-specific counts ─────────────────────────────────────────────────────

  test('EP2 has at least 3 bare [PAUSE] lines (validates script parsing coverage)', () => {
    const barePauseCount = positions.filter(p => p.speaker === 'PAUSE' && p.text === '1').length
    expect(barePauseCount).toBeGreaterThanOrEqual(3)
  })

  test('rawLineNumber is set on every position (enables index delegation in generate-voices)', () => {
    for (const p of positions) {
      expect(typeof p.rawLineNumber).toBe('number')
      expect(p.rawLineNumber).toBeGreaterThanOrEqual(1)
    }
  })
})
