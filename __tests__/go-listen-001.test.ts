// __tests__/go-listen-001.test.ts — ATL-GO-LISTEN-001 regression pins for
// lib/goListen.ts (pure logic: variant resolution, milestone crossing,
// once-per-session latch, payload clamps, silent-failure guarantees).

import {
  clampPositionSeconds,
  createGoListenTracker,
  GoListenPayload,
  GO_LISTEN_MAX_POSITION_SECONDS,
  milestonesCrossed,
  newSessionId,
  normalizeUtm,
  resolveGoVariant,
} from '@/lib/goListen'

describe('resolveGoVariant', () => {
  it('maps live variants and everything else to bare', () => {
    expect(resolveGoVariant('?v=a')).toBe('a')
    expect(resolveGoVariant('v=b')).toBe('b')
    expect(resolveGoVariant('?v=B')).toBe('b')
    expect(resolveGoVariant('')).toBe('bare')
    expect(resolveGoVariant('?v=z')).toBe('bare')
    expect(resolveGoVariant('?utm_source=meta')).toBe('bare')
  })

  it('respects the live allowlist (gated variant serves bare)', () => {
    expect(resolveGoVariant('?v=a', ['b'])).toBe('bare')
    expect(resolveGoVariant('?v=b', ['b'])).toBe('b')
    expect(resolveGoVariant('?v=a', [])).toBe('bare')
  })

  it('never throws on junk', () => {
    expect(resolveGoVariant(null as unknown as string)).toBe('bare')
  })
})

describe('milestonesCrossed', () => {
  it('returns milestones at/past the position fraction', () => {
    expect(milestonesCrossed(25, 100, new Set())).toEqual(['pct_25'])
    expect(milestonesCrossed(60, 100, new Set())).toEqual(['pct_25', 'pct_50'])
    expect(milestonesCrossed(99, 100, new Set())).toEqual(['pct_25', 'pct_50', 'pct_75'])
  })

  it('excludes already-fired milestones', () => {
    expect(milestonesCrossed(60, 100, new Set(['pct_25']))).toEqual(['pct_50'])
    expect(milestonesCrossed(80, 100, new Set(['pct_25', 'pct_50', 'pct_75']))).toEqual([])
  })

  it('is safe on junk duration/position', () => {
    expect(milestonesCrossed(10, 0, new Set())).toEqual([])
    expect(milestonesCrossed(10, NaN, new Set())).toEqual([])
    expect(milestonesCrossed(NaN, 100, new Set())).toEqual([])
  })
})

describe('clamps + normalization', () => {
  it('clamps position to [0, max] integers', () => {
    expect(clampPositionSeconds(-5)).toBe(0)
    expect(clampPositionSeconds(12.9)).toBe(12)
    expect(clampPositionSeconds(NaN)).toBe(0)
    expect(clampPositionSeconds(999999)).toBe(GO_LISTEN_MAX_POSITION_SECONDS)
  })

  it('normalizes utm params (trim, bound, empty→null)', () => {
    expect(normalizeUtm('  meta ')).toBe('meta')
    expect(normalizeUtm('')).toBeNull()
    expect(normalizeUtm('   ')).toBeNull()
    expect(normalizeUtm(undefined)).toBeNull()
    expect(normalizeUtm('x'.repeat(500))).toHaveLength(120)
  })

  it('newSessionId yields UUID-shaped ids', () => {
    expect(newSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

describe('createGoListenTracker', () => {
  function tracker(sent: GoListenPayload[], variant: 'a' | 'b' | 'bare' = 'a') {
    return createGoListenTracker({
      variant,
      utmSource: 'meta',
      utmCampaign: 'gvl-test-001',
      send: p => { sent.push(p) },
    })
  }

  it('fires play_start once, with clamped position and utm', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onPlayStart(0.7)
    t.onPlayStart(30) // pause→play again — must NOT refire
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      variant: 'a', event: 'play_start', position_seconds: 0,
      utm_source: 'meta', utm_campaign: 'gvl-test-001', session_id: t.sessionId,
    })
  })

  it('fires each milestone at most once across timeupdates', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onTimeUpdate(26, 100)
    t.onTimeUpdate(27, 100) // same milestone again — latched
    t.onTimeUpdate(80, 100) // jumps two milestones at once
    expect(sent.map(p => p.event)).toEqual(['pct_25', 'pct_50', 'pct_75'])
  })

  it('fires complete and cta_click once each', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onEnded(100)
    t.onEnded(100)
    t.onCtaClick(101.4)
    t.onCtaClick(102)
    expect(sent.map(p => p.event)).toEqual(['complete', 'cta_click'])
    expect(sent[1].position_seconds).toBe(101)
  })

  it('swallows transport failures silently (playback hard rule)', () => {
    const t = createGoListenTracker({
      variant: 'bare',
      utmSource: null,
      utmCampaign: null,
      send: () => { throw new Error('network exploded') },
    })
    expect(() => {
      t.onPlayStart(0)
      t.onTimeUpdate(50, 100)
      t.onEnded(100)
      t.onCtaClick(100)
    }).not.toThrow()
  })

  it('mints a fresh session id per tracker (per visit)', () => {
    const a = createGoListenTracker({ variant: 'a', utmSource: null, utmCampaign: null, send: () => {} })
    const b = createGoListenTracker({ variant: 'a', utmSource: null, utmCampaign: null, send: () => {} })
    expect(a.sessionId).not.toBe(b.sessionId)
  })
})
