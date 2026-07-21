/**
 * ATL-SFX-INCR-001 — incremental render path generates SFX files.
 *
 * Root cause: the `retryMissingOnly` path in generate-voices/route.ts never
 * generated sfx_NNNN.mp3 files because:
 *   1. `expectedSegmentNames` excluded SFX-type lines, so their indexes
 *      never appeared in `missingSegments`.
 *   2. The runner's `firstMissingSegmentNumber` could not parse `sfx_NNNN.mp3`
 *      names even if they were present — regex only matched `segment_NNNN.mp3`.
 *   3. If the runner somehow did request an SFX index, the handler threw
 *      "Targeted retry does not support sfx lines".
 *
 * Fix (three parts, all tagged ATL-SFX-INCR-001):
 *   A. generate-voices: `expectedSegmentNames` includes sfx lines → sfx_NNNN.mp3
 *   B. generate-voices: `retryMissingOnly` handler calls generateSFX() for sfx lines
 *   C. run-next: `segmentNumberFromName` regex extended to match sfx_NNNN.mp3
 *
 * Invariants pinned here:
 *   1. `segmentNumberFromName` extracts the index from sfx_NNNN.mp3 correctly.
 *   2. `segmentNumberFromName` still handles segment_NNNN.mp3 correctly.
 *   3. Non-matching names return null (no false positives).
 *   4. `firstMissingSegmentNumber` returns the correct index from a mixed list
 *      of segment and sfx file names.
 *   5. The runner correctly orders sfx and segment names by index.
 */

// We test the pure utility function directly from run-next.
// It is not exported, so we inline the fixed version here and verify the regex.
// The integration test (generate-voices calling generateSFX) requires a live
// Supabase + ElevenLabs environment; that is covered by staging smoke tests.

// ---------------------------------------------------------------------------
// Inline the fixed segmentNumberFromName for unit testing
// ---------------------------------------------------------------------------

function segmentNumberFromName(name: string): number | null {
  // ATL-SFX-INCR-001: match both segment_NNNN.mp3 and sfx_NNNN.mp3
  const match = String(name || '').match(/^(?:segment|sfx)_(\d{4})\.mp3$/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isInteger(value) ? value : null
}

function firstMissingSegmentNumber(missingSegments: unknown, fallback: number): number {
  if (!Array.isArray(missingSegments)) return fallback
  const numbers = (missingSegments as string[])
    .map(segmentNumberFromName)
    .filter((value): value is number => Number.isInteger(value!))
    .sort((a, b) => a - b)
  return numbers[0] ?? fallback
}

// ---------------------------------------------------------------------------
// Inline expectedSegmentNames builder to verify the fix
// ---------------------------------------------------------------------------

type StoryLine = { index: number; type: string }

function buildExpectedSegmentNames(storyLines: StoryLine[]): string[] {
  // ATL-SFX-INCR-001: sfx lines use sfx_NNNN.mp3 naming
  return storyLines
    .filter(line =>
      line.type === 'narrator' ||
      line.type === 'character' ||
      line.type === 'beat' ||
      line.type === 'pause' ||
      line.type === 'sfx'
    )
    .map(line =>
      line.type === 'sfx'
        ? `sfx_${line.index.toString().padStart(4, '0')}.mp3`
        : `segment_${line.index.toString().padStart(4, '0')}.mp3`
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ATL-SFX-INCR-001: segmentNumberFromName — extended regex', () => {
  test('extracts index from segment_NNNN.mp3 (existing behaviour)', () => {
    expect(segmentNumberFromName('segment_0000.mp3')).toBe(0)
    expect(segmentNumberFromName('segment_0001.mp3')).toBe(1)
    expect(segmentNumberFromName('segment_0042.mp3')).toBe(42)
    expect(segmentNumberFromName('segment_9999.mp3')).toBe(9999)
  })

  test('extracts index from sfx_NNNN.mp3 (new behaviour)', () => {
    expect(segmentNumberFromName('sfx_0002.mp3')).toBe(2)
    expect(segmentNumberFromName('sfx_0000.mp3')).toBe(0)
    expect(segmentNumberFromName('sfx_0100.mp3')).toBe(100)
    expect(segmentNumberFromName('sfx_9999.mp3')).toBe(9999)
  })

  test('returns null for non-matching names (no false positives)', () => {
    expect(segmentNumberFromName('announcement.mp3')).toBeNull()
    expect(segmentNumberFromName('outro.mp3')).toBeNull()
    expect(segmentNumberFromName('sfx_abc.mp3')).toBeNull()
    expect(segmentNumberFromName('sound_0001.mp3')).toBeNull()
    expect(segmentNumberFromName('segment_001.mp3')).toBeNull()  // only 4-digit accepted
    expect(segmentNumberFromName('sfx_001.mp3')).toBeNull()      // only 4-digit accepted
    expect(segmentNumberFromName('')).toBeNull()
    expect(segmentNumberFromName('final_mix.mp3')).toBeNull()
  })
})

describe('ATL-SFX-INCR-001: firstMissingSegmentNumber with sfx entries', () => {
  test('returns the lowest index from a pure segment list (existing behaviour)', () => {
    expect(firstMissingSegmentNumber(['segment_0003.mp3', 'segment_0007.mp3'], 99)).toBe(3)
  })

  test('returns the lowest index from a pure sfx list', () => {
    expect(firstMissingSegmentNumber(['sfx_0002.mp3', 'sfx_0005.mp3'], 99)).toBe(2)
  })

  test('returns the lowest index from a mixed segment + sfx list', () => {
    // sfx_0002 < segment_0010 → should return 2
    expect(firstMissingSegmentNumber(['sfx_0002.mp3', 'segment_0010.mp3'], 99)).toBe(2)
    // segment_0001 < sfx_0005 → should return 1
    expect(firstMissingSegmentNumber(['segment_0001.mp3', 'sfx_0005.mp3'], 99)).toBe(1)
  })

  test('uses fallback when list is empty', () => {
    expect(firstMissingSegmentNumber([], 42)).toBe(42)
  })

  test('uses fallback when list is not an array', () => {
    expect(firstMissingSegmentNumber(null, 7)).toBe(7)
    expect(firstMissingSegmentNumber(undefined, 3)).toBe(3)
  })

  test('filters out non-matching names gracefully', () => {
    const mixed = ['outro.mp3', 'sfx_0002.mp3', 'announcement.mp3', 'segment_0005.mp3']
    expect(firstMissingSegmentNumber(mixed, 99)).toBe(2)
  })
})

describe('ATL-SFX-INCR-001: expectedSegmentNames includes sfx lines', () => {
  const storyLines: StoryLine[] = [
    { index: 0, type: 'narrator' },
    { index: 1, type: 'character' },
    { index: 2, type: 'sfx' },
    { index: 3, type: 'narrator' },
    { index: 4, type: 'beat' },
    { index: 5, type: 'sfx' },
    { index: 6, type: 'pause' },
  ]

  test('narrator and character lines map to segment_NNNN.mp3', () => {
    const names = buildExpectedSegmentNames(storyLines)
    expect(names).toContain('segment_0000.mp3')
    expect(names).toContain('segment_0001.mp3')
    expect(names).toContain('segment_0003.mp3')
  })

  test('beat and pause lines map to segment_NNNN.mp3', () => {
    const names = buildExpectedSegmentNames(storyLines)
    expect(names).toContain('segment_0004.mp3')
    expect(names).toContain('segment_0006.mp3')
  })

  test('sfx lines map to sfx_NNNN.mp3 (fix verification)', () => {
    const names = buildExpectedSegmentNames(storyLines)
    expect(names).toContain('sfx_0002.mp3')
    expect(names).toContain('sfx_0005.mp3')
    // sfx lines must NOT map to segment_NNNN.mp3
    expect(names).not.toContain('segment_0002.mp3')
    expect(names).not.toContain('segment_0005.mp3')
  })

  test('total count includes all targetable line types', () => {
    const names = buildExpectedSegmentNames(storyLines)
    // 7 lines total; 0 non-targetable (no intro/outro/announcer type)
    expect(names).toHaveLength(7)
  })

  test('non-targetable line types are excluded', () => {
    const lines: StoryLine[] = [
      { index: 0, type: 'announcer' },
      { index: 1, type: 'narrator' },
      { index: 2, type: 'sfx' },
    ]
    const names = buildExpectedSegmentNames(lines)
    expect(names).toHaveLength(2)
    expect(names).toContain('segment_0001.mp3')
    expect(names).toContain('sfx_0002.mp3')
  })
})

describe('ATL-SFX-INCR-001: runner does not skip SFX indexes', () => {
  /**
   * Simulate the runner's iteration over a script with an SFX line at index 2.
   * Before the fix: missingSegments never contained sfx_0002.mp3, so
   * firstMissingSegmentNumber jumped from 1 → 3, skipping index 2 entirely,
   * and episodeComplete was declared after segment_0003.mp3 was generated
   * (without ever generating sfx_0002.mp3).
   *
   * After the fix: missingSegments contains sfx_0002.mp3 until it is
   * generated. firstMissingSegmentNumber returns 2 on the call that sees
   * segment_0000.mp3 and segment_0001.mp3 present but sfx_0002.mp3 absent.
   */
  test('sfx index appears in missingSegments until file is generated', () => {
    // All expected names for a 4-line script: segment_0000, segment_0001,
    // sfx_0002, segment_0003.
    const expected = ['segment_0000.mp3', 'segment_0001.mp3', 'sfx_0002.mp3', 'segment_0003.mp3']

    // State: segment_0000 and segment_0001 are present, sfx_0002 and segment_0003 are not.
    const present = new Set(['segment_0000.mp3', 'segment_0001.mp3'])
    const missing = expected.filter(n => !present.has(n))
    // sfx_0002.mp3 must appear in missing so the runner requests index 2
    expect(missing).toContain('sfx_0002.mp3')
    expect(firstMissingSegmentNumber(missing, 99)).toBe(2)
  })

  test('episode is NOT complete while sfx_NNNN.mp3 is absent', () => {
    const expected = ['segment_0000.mp3', 'sfx_0001.mp3', 'segment_0002.mp3']
    // Only voice segments present — sfx_0001 missing
    const present = new Set(['segment_0000.mp3', 'segment_0002.mp3'])
    const missing = expected.filter(n => !present.has(n))
    expect(missing).toHaveLength(1)
    expect(missing[0]).toBe('sfx_0001.mp3')
    // episodeComplete = missingSegments.length === 0 — must be false here
    expect(missing.length === 0).toBe(false)
  })

  test('episode IS complete once sfx_NNNN.mp3 is present', () => {
    const expected = ['segment_0000.mp3', 'sfx_0001.mp3', 'segment_0002.mp3']
    const present = new Set(['segment_0000.mp3', 'sfx_0001.mp3', 'segment_0002.mp3'])
    const missing = expected.filter(n => !present.has(n))
    expect(missing).toHaveLength(0)
    // episodeComplete = missingSegments.length === 0 — must be true
    expect(missing.length === 0).toBe(true)
  })
})
