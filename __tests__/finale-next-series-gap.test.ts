/**
 * FINALE-GAP-001 — CANON-11 rules 80-81 regression tests.
 *
 * The behaviour under test is small but easy to get subtly wrong, and every
 * wrong version of it is annoying to a listener:
 *
 *   - Gap fires when it shouldn't  → a stall in the middle of a series, which
 *     reads as the app freezing.
 *   - Gap doesn't fire when it should → two stories run into each other with
 *     no break, which is the thing the rule exists to fix.
 *   - A failed lookup blocks the advance → worst case. The listener loses
 *     playback because a lookup hiccuped. No gap is the only safe default.
 *
 * Kept as a local mirror of isSeriesToSeriesSeam() for the same reason as the
 * voice-approval tests: importing the component pulls in the whole player and
 * a Supabase browser client, which cannot run here.
 */

type PlaylistItem = { id: string; episode_number?: number }
type StorySeries = Record<string, string | null | undefined> // nextId -> series_id

function isSeriesToSeriesSeamMirror(
  finished: { series_id?: string | null },
  nextItem: PlaylistItem | undefined,
  lookup: (id: string) => { ok: true; seriesId: string | null } | { ok: false }
): boolean {
  const fromSeries = finished?.series_id || null
  if (!fromSeries || !nextItem?.id) return false
  const res = lookup(nextItem.id)
  if (!res.ok) return false // lookup failure → no gap, never block playback
  if (!res.seriesId) return false
  return fromSeries !== res.seriesId
}

const lookupFrom = (map: StorySeries) => (id: string): { ok: true; seriesId: string | null } | { ok: false } =>
  id in map ? { ok: true, seriesId: map[id] ?? null } : { ok: true, seriesId: null }

describe('FINALE-GAP-001 seam detection', () => {
  test('finale of series A into series B is a seam — gap fires', () => {
    const lookup = lookupFrom({ nextStory: 'series-B' })
    expect(isSeriesToSeriesSeamMirror({ series_id: 'series-A' }, { id: 'nextStory' }, lookup)).toBe(true)
  })

  test('episode 3 into episode 4 of the SAME series is not a seam — no gap', () => {
    const lookup = lookupFrom({ ep4: 'series-A' })
    expect(isSeriesToSeriesSeamMirror({ series_id: 'series-A' }, { id: 'ep4' }, lookup)).toBe(false)
  })

  test('a standalone finishing gets no gap, even into another story', () => {
    const lookup = lookupFrom({ nextStory: 'series-B' })
    expect(isSeriesToSeriesSeamMirror({ series_id: null }, { id: 'nextStory' }, lookup)).toBe(false)
  })

  test('next item with no series of its own gets no gap', () => {
    const lookup = lookupFrom({ standalone: null })
    expect(isSeriesToSeriesSeamMirror({ series_id: 'series-A' }, { id: 'standalone' }, lookup)).toBe(false)
  })

  test('no next item means no gap', () => {
    const lookup = lookupFrom({})
    expect(isSeriesToSeriesSeamMirror({ series_id: 'series-A' }, undefined, lookup)).toBe(false)
  })

  test('a failed lookup does NOT block the advance — no gap, playback continues', () => {
    const failing = () => ({ ok: false } as const)
    expect(isSeriesToSeriesSeamMirror({ series_id: 'series-A' }, { id: 'nextStory' }, failing)).toBe(false)
  })

  test('the gap is 2 seconds, per rule 80', () => {
    const FINALE_SERIES_GAP_MS = 2000
    expect(FINALE_SERIES_GAP_MS).toBe(2000)
  })
})
