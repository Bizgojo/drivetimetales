// __tests__/listen-report-001.test.ts — ATL-GO-LISTEN-001 final revisions
// (Marc msg 2868): /admin/listen-report aggregation with the 24h/all-time
// window split. Pins lib/listenReport.ts (pure logic used by
// app/api/admin/listen-report/route.ts).

import {
  buildSessions,
  computeStats,
  groupWindows,
  inLast24h,
  ListenEventRow,
  median,
} from '@/lib/listenReport'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')
const CUTOFF = NOW - 24 * 60 * 60 * 1000
const HOURS = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

function row(partial: Partial<ListenEventRow> & { session_id: string; event: string }): ListenEventRow {
  return {
    variant: 'bare',
    utm_source: null,
    position_seconds: 0,
    created_at: HOURS(1),
    ...partial,
  }
}

describe('median', () => {
  it('handles empty, odd, and even inputs', () => {
    expect(median([])).toBeNull()
    expect(median([5])).toBe(5)
    expect(median([1, 9, 3])).toBe(3)
    expect(median([1, 3, 5, 9])).toBe(4)
  })
})

describe('buildSessions', () => {
  it('collapses events per session and records the FIRST event time', () => {
    const sessions = buildSessions([
      row({ session_id: 's1', event: 'play_start', position_seconds: 0, created_at: HOURS(3) }),
      row({ session_id: 's1', event: 'pct_25', position_seconds: 30, created_at: HOURS(2.9) }),
      // cta_click position must NOT extend listen depth.
      row({ session_id: 's1', event: 'cta_click', position_seconds: 999, created_at: HOURS(2.8) }),
    ])
    const s1 = sessions.get('s1')!
    expect(s1.events).toEqual(new Set(['play_start', 'pct_25', 'cta_click']))
    expect(s1.maxListenSeconds).toBe(30)
    expect(s1.firstEventMs).toBe(Date.parse(HOURS(3)))
  })

  it('backfills utm_source and survives junk created_at', () => {
    const sessions = buildSessions([
      row({ session_id: 's2', event: 'play_start', utm_source: null, created_at: 'not-a-date' }),
      row({ session_id: 's2', event: 'pct_25', utm_source: 'meta' }),
    ])
    const s2 = sessions.get('s2')!
    expect(s2.utmSource).toBe('meta')
    // Unparseable timestamps leave firstEventMs at the parseable minimum.
    expect(s2.firstEventMs).toBe(Date.parse(HOURS(1)))
  })
})

describe('inLast24h', () => {
  it('cuts on the session start (first event) vs the rolling cutoff', () => {
    const mk = (h: number) =>
      buildSessions([row({ session_id: 'x', event: 'play_start', created_at: HOURS(h) })]).get('x')!
    expect(inLast24h(mk(1), CUTOFF)).toBe(true)
    expect(inLast24h(mk(23.9), CUTOFF)).toBe(true)
    expect(inLast24h(mk(25), CUTOFF)).toBe(false)
  })
})

describe('computeStats', () => {
  it('is graceful on an empty group (0 rows live in prod)', () => {
    const s = computeStats('bare', [])
    expect(s).toEqual({
      key: 'bare',
      starts: 0,
      totalSessions: 0,
      medianListenSeconds: null,
      pct25Rate: null,
      pct50Rate: null,
      pct75Rate: null,
      completionRate: null,
      ctaClickRate: null,
      listenedFullyNoCta: 0,
      clickedCta: 0,
    })
  })
})

describe('groupWindows — the 24h/all-time split (Marc msg 2868)', () => {
  // Variant A: one fresh session (2h ago, full funnel + CTA click) and one
  // old session (48h ago, reached 75%, never clicked). Variant B: old only.
  const rows: ListenEventRow[] = [
    // fresh A session
    row({ session_id: 'a-new', variant: 'a', utm_source: 'meta', event: 'play_start', position_seconds: 0, created_at: HOURS(2) }),
    row({ session_id: 'a-new', variant: 'a', utm_source: 'meta', event: 'pct_75', position_seconds: 90, created_at: HOURS(1.9) }),
    row({ session_id: 'a-new', variant: 'a', utm_source: 'meta', event: 'complete', position_seconds: 120, created_at: HOURS(1.8) }),
    row({ session_id: 'a-new', variant: 'a', utm_source: 'meta', event: 'cta_click', position_seconds: 100, created_at: HOURS(1.8) }),
    // old A session — outside the 24h window
    row({ session_id: 'a-old', variant: 'a', utm_source: 'meta', event: 'play_start', position_seconds: 0, created_at: HOURS(48) }),
    row({ session_id: 'a-old', variant: 'a', utm_source: 'meta', event: 'pct_75', position_seconds: 95, created_at: HOURS(47.9) }),
    // old B session — outside the 24h window
    row({ session_id: 'b-old', variant: 'b', utm_source: null, event: 'play_start', position_seconds: 0, created_at: HOURS(30) }),
  ]
  const sessions = Array.from(buildSessions(rows).values())
  const byVariant = groupWindows(sessions, CUTOFF, s => s.variant)

  it('computes both windows per group', () => {
    const a = byVariant.find(g => g.key === 'a')!
    expect(a.total.starts).toBe(2)
    expect(a.h24.starts).toBe(1)
    expect(a.total.completionRate).toBe(50)
    expect(a.h24.completionRate).toBe(100)
    expect(a.total.ctaClickRate).toBe(50)
    expect(a.h24.ctaClickRate).toBe(100)
    // ≥75%-no-CTA: only the old A session — all-time only.
    expect(a.total.listenedFullyNoCta).toBe(1)
    expect(a.h24.listenedFullyNoCta).toBe(0)
    expect(a.total.clickedCta).toBe(1)
    expect(a.h24.clickedCta).toBe(1)
    expect(a.total.medianListenSeconds).toBe((120 + 95) / 2)
    expect(a.h24.medianListenSeconds).toBe(120)
  })

  it('keeps groups with zero 24h sessions (graceful zero shape)', () => {
    const b = byVariant.find(g => g.key === 'b')!
    expect(b.total.starts).toBe(1)
    expect(b.h24.starts).toBe(0)
    expect(b.h24.totalSessions).toBe(0)
    expect(b.h24.completionRate).toBeNull()
    expect(b.h24.medianListenSeconds).toBeNull()
  })

  it('sorts by ALL-TIME starts desc then key', () => {
    expect(byVariant.map(g => g.key)).toEqual(['a', 'b'])
  })

  it('is graceful on zero sessions (empty prod table)', () => {
    expect(groupWindows([], CUTOFF, s => s.variant)).toEqual([])
  })
})
