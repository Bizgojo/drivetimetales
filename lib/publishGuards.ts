/**
 * PUBLISH-GUARDS-001 (CANON-99 decisions 20, 44 and 89; CANON-09, Marc Nov 9 2026).
 *   - No episode goes live alone: a single-story publish of a series episode is refused unless,
 *     once it is published, every episode of that series is live. Release a series as a whole.
 *   - Test stories are never published. Until a "test" column exists, a story counts as a test
 *     when its title or series name carries an upper-case TEST marker ("[GARBLE-TEST]",
 *     "(TEST ONLY)") or reads "Test Series <number>" (machine-made test series).
 */
type Row = { id?: unknown; title?: unknown; series_name?: unknown; status?: unknown; is_hidden?: unknown }

const TEST_MARK = /\bTEST\b|TEST ONLY/
const TEST_MARK_CI = /\btest series \d+|\[[^\]]*test[^\]]*\]|\(test only\)/i

export function testStoryReason(story: Row): string | null {
  for (const field of [story.title, story.series_name]) {
    const v = String(field ?? '')
    if (TEST_MARK.test(v) || TEST_MARK_CI.test(v)) return `"${v}" is marked as a test story; test stories are never published (PUBLISH-GUARDS-001)`
  }
  return null
}

const live = (r: Row) => String(r.status ?? '') === 'published' && r.is_hidden !== true

/** For a single-story publish: null when the whole series will be live afterwards. */
export function partialSeriesReason(targetId: string, siblings: Row[]): string | null {
  const others = siblings.filter((r) => String(r.id) !== String(targetId) && String(r.status ?? '') !== 'cold_storage')
  const notLive = others.filter((r) => !live(r))
  if (!notLive.length) return null
  return `${notLive.length} other episode(s) of this series are not live; a series is published as a whole, never one episode alone (PUBLISH-GUARDS-001). Use the series publish.`
}
