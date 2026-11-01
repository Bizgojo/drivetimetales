// __tests__/go-listen-et-test-001.test.ts — ET-TEST-ANON-TAG-20261031
// (commission et-test-anon-tag-20261031, Marc 19:26 EDT).
//
// Pins the Amendment-1 et_test flag in the anonymous listen path:
//   1. lib/goListen.ts — sanitizeEtTest / readEtTestParam accept strict run
//      ids only; the tracker stamps et_test on every event (null = genuine).
//   2. lib/listenReport.ts — excludeTestEvents drops tagged rows and KEEPS
//      genuine anonymous rows (null/undefined); excluded rows never count
//      as starts/completions.

import {
  createGoListenTracker,
  GoListenPayload,
  readEtTestParam,
  sanitizeEtTest,
} from '@/lib/goListen'
import {
  buildSessions,
  computeStats,
  excludeTestEvents,
  ListenEventRow,
} from '@/lib/listenReport'

describe('sanitizeEtTest', () => {
  it('passes strict run ids through', () => {
    expect(sanitizeEtTest('run_abc-123')).toBe('run_abc-123')
  })
  it('drops junk to null (never echoes)', () => {
    expect(sanitizeEtTest(null)).toBeNull()
    expect(sanitizeEtTest(undefined)).toBeNull()
    expect(sanitizeEtTest('')).toBeNull()
    expect(sanitizeEtTest('   ')).toBeNull()
    expect(sanitizeEtTest('run id with spaces')).toBeNull()
    expect(sanitizeEtTest('<script>alert(1)</script>')).toBeNull()
    expect(sanitizeEtTest('a'.repeat(65))).toBeNull()
    expect(sanitizeEtTest(123 as unknown as string)).toBeNull()
  })
})

describe('readEtTestParam', () => {
  it('reads ?et_test= from the query string', () => {
    expect(readEtTestParam('?v=a&et_test=run_42')).toBe('run_42')
    expect(readEtTestParam('?utm_source=meta')).toBeNull()
    expect(readEtTestParam('')).toBeNull()
    expect(readEtTestParam(null)).toBeNull()
  })
  it('rejects invalid ids in the URL', () => {
    expect(readEtTestParam('?et_test=<bad>')).toBeNull()
  })
})

describe('createGoListenTracker et_test carry', () => {
  const collect = (etTest?: string | null) => {
    const sent: GoListenPayload[] = []
    const tracker = createGoListenTracker({
      variant: 'bare',
      utmSource: null,
      utmCampaign: null,
      etTest,
      send: p => sent.push(p),
    })
    tracker.onPageView()
    tracker.onPlayStart(0)
    return sent
  }
  it('stamps the run id on every event in a test session', () => {
    for (const p of collect('run_42')) expect(p.et_test).toBe('run_42')
  })
  it('sends null for genuine visits (no etTest / null / junk)', () => {
    for (const p of collect(undefined)) expect(p.et_test).toBeNull()
    for (const p of collect(null)) expect(p.et_test).toBeNull()
    for (const p of collect('<bad>')) expect(p.et_test).toBeNull()
  })
})

describe('excludeTestEvents', () => {
  const row = (partial: Partial<ListenEventRow> & { session_id: string; event: string }): ListenEventRow => ({
    variant: 'bare',
    utm_source: null,
    position_seconds: 0,
    created_at: '2026-10-31T12:00:00.000Z',
    ...partial,
  })
  it('drops tagged test rows, keeps genuine anonymous rows', () => {
    const rows = [
      row({ session_id: 'test-1', event: 'play_start', et_test: 'run_42' }),
      row({ session_id: 'test-1', event: 'complete', et_test: 'run_42' }),
      row({ session_id: 'anon-1', event: 'play_start', et_test: null }),
      row({ session_id: 'anon-2', event: 'play_start' }),
    ]
    const out = excludeTestEvents(rows)
    expect(out.map(r => r.session_id).sort()).toEqual(['anon-1', 'anon-2'])
  })
  it('excluded test rows never count as starts', () => {
    const rows = excludeTestEvents([
      row({ session_id: 'test-1', event: 'play_start', et_test: 'run_42' }),
      row({ session_id: 'anon-1', event: 'play_start', et_test: null }),
    ])
    const sessions = Array.from(buildSessions(rows).values())
    expect(computeStats('bare', sessions).starts).toBe(1)
  })
  it('returns input untouched when nothing is tagged', () => {
    const rows = [row({ session_id: 'a', event: 'play_start', et_test: null })]
    expect(excludeTestEvents(rows)).toHaveLength(1)
  })
})
