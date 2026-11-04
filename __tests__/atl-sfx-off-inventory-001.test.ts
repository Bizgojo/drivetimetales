/**
 * SFX-OFF-INVENTORY-001 (prod-series-stuck-20261104 item 2, Marc 2026-11-04).
 *
 * Root cause: with SFX generation disabled (SFX_OFF=on globally, or
 * SFX_SOUNDSNAP_ONLY on-default — both folded into the `sfxDisabled` gate in
 * generate-voices/route.ts), the incremental retryMissingOnly path SKIPPED
 * SFX generation but still listed sfx_NNNN.mp3 files as missing in
 * missingSegments. run-next re-targeted the same SFX index every cycle:
 * HTTP 200, zero spend, presentCount never rises — an infinite seg loop
 * (4 series stuck, 0 audio; Sunset EP26 blocked on 6 SFX lines).
 *
 * Fix: `expectedSegmentNames` excludes sfx-type lines when `sfxDisabled` is
 * true, so the shared buildInventoryReport never reports them missing — in
 * the incremental already-exists check, the incremental post-generation
 * report, AND the full-path final inventory (all three diff against the same
 * expected list). The run-next loop then advances past SFX indexes with no
 * run-next change: sfx names simply never appear in missingSegments.
 *
 * Invariants pinned here (pure-function mirrors of the route logic):
 *   1. SFX off → sfx lines excluded from expected names (no sfx_*.mp3).
 *   2. SFX on  → sfx lines included as sfx_NNNN.mp3 (ATL-SFX-INCR-001 kept).
 *   3. Loop scenario: [narr, narr, SFX(seg2), narr] + SFX off + all voice
 *      segments present → missing=[] → run-next completes (no loop).
 *   4. Loop scenario: same script + SFX off + seg3 voice missing →
 *      missing=[segment_0003.mp3] only → runner advances past seg2 to seg3.
 *   5. Route file contains the guard; skip branch + sfxDisabled gate intact.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { sfxGloballyOff, soundsnapOnly } from '@/lib/sfxSwitch'

// ---------------------------------------------------------------------------
// Mirror of the fixed expectedSegmentNames builder in
// app/api/admin/generate-voices/route.ts (SFX-OFF-INVENTORY-001)
// ---------------------------------------------------------------------------

type StoryLine = { index: number; type: string }

function buildExpectedSegmentNames(storyLines: StoryLine[], sfxDisabled: boolean): string[] {
  return storyLines
    .filter(line =>
      line.type === 'narrator' ||
      line.type === 'character' ||
      line.type === 'beat' ||
      line.type === 'pause' ||
      (line.type === 'sfx' && !sfxDisabled)
    )
    .map(line =>
      line.type === 'sfx'
        ? `sfx_${line.index.toString().padStart(4, '0')}.mp3`
        : `segment_${line.index.toString().padStart(4, '0')}.mp3`
    )
}

function buildMissingSegments(expected: string[], present: Set<string>): string[] {
  return expected.filter(name => !present.has(name))
}

// Script with [SFX] on seg2 (task checklist item 2 scenario)
const SCRIPT_WITH_SFX_ON_SEG2: StoryLine[] = [
  { index: 0, type: 'narrator' },
  { index: 1, type: 'narrator' },
  { index: 2, type: 'sfx' },
  { index: 3, type: 'narrator' },
]

describe('SFX-OFF-INVENTORY-001: sfx lines excluded from expected when disabled', () => {
  test('SFX off → no sfx_*.mp3 in expected names', () => {
    const names = buildExpectedSegmentNames(SCRIPT_WITH_SFX_ON_SEG2, true)
    expect(names).toEqual(['segment_0000.mp3', 'segment_0001.mp3', 'segment_0003.mp3'])
    expect(names.some(n => n.startsWith('sfx_'))).toBe(false)
  })

  test('SFX on → sfx_0002.mp3 still expected (ATL-SFX-INCR-001 preserved)', () => {
    const names = buildExpectedSegmentNames(SCRIPT_WITH_SFX_ON_SEG2, false)
    expect(names).toEqual(['segment_0000.mp3', 'segment_0001.mp3', 'sfx_0002.mp3', 'segment_0003.mp3'])
  })

  test('non-sfx line types unaffected by the flag either way', () => {
    const lines: StoryLine[] = [
      { index: 0, type: 'narrator' },
      { index: 1, type: 'character' },
      { index: 2, type: 'beat' },
      { index: 3, type: 'pause' },
    ]
    expect(buildExpectedSegmentNames(lines, true)).toHaveLength(4)
    expect(buildExpectedSegmentNames(lines, false)).toHaveLength(4)
  })
})

describe('SFX-OFF-INVENTORY-001: loop advances past SFX lines', () => {
  test('all voice segments present + SFX off → missing=[] → run-next completes', () => {
    const expected = buildExpectedSegmentNames(SCRIPT_WITH_SFX_ON_SEG2, true)
    const present = new Set(['segment_0000.mp3', 'segment_0001.mp3', 'segment_0003.mp3'])
    const missing = buildMissingSegments(expected, present)
    expect(missing).toEqual([])
    // run-next completion predicate: ok && no failures && missing empty
    const complete = true && [].length === 0 && missing.length === 0
    expect(complete).toBe(true)
  })

  test('seg3 voice missing + SFX off → missing=[segment_0003] → runner targets seg3, past seg2', () => {
    const expected = buildExpectedSegmentNames(SCRIPT_WITH_SFX_ON_SEG2, true)
    const present = new Set(['segment_0000.mp3', 'segment_0001.mp3'])
    const missing = buildMissingSegments(expected, present)
    expect(missing).toEqual(['segment_0003.mp3'])
    expect(missing).not.toContain('sfx_0002.mp3')
  })

  test('contrast: same state + SFX on → sfx_0002 still reported missing (generation path)', () => {
    const expected = buildExpectedSegmentNames(SCRIPT_WITH_SFX_ON_SEG2, false)
    const present = new Set(['segment_0000.mp3', 'segment_0001.mp3', 'segment_0003.mp3'])
    const missing = buildMissingSegments(expected, present)
    expect(missing).toEqual(['sfx_0002.mp3'])
  })
})

describe('SFX-OFF-INVENTORY-001: route wiring intact', () => {
  const gv = readFileSync(join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')

  test('expectedSegmentNames excludes sfx when sfxDisabled', () => {
    expect(gv).toContain("(line.type === 'sfx' && !sfxDisabled)")
  })

  test('fix tag present', () => {
    expect(gv).toContain('SFX-OFF-INVENTORY-001')
  })

  test('sfxDisabled gate still covers story flag + SFX_OFF + soundsnap-only', () => {
    expect(gv).toContain('sfxGloballyOff() || soundsnapOnly()')
  })

  test('incremental skip branch still skips SFX generation when disabled', () => {
    expect(gv).toContain('Skipping SFX segment')
  })

  test('switch defaults: soundsnap-only is on unless explicitly off (current prod condition)', () => {
    expect(soundsnapOnly({})).toBe(true)
    expect(soundsnapOnly({ SFX_SOUNDSNAP_ONLY: 'off' })).toBe(false)
    expect(sfxGloballyOff({ SFX_OFF: 'on' })).toBe(true)
  })
})
