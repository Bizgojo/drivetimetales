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
import { GO_STORY_VARIANTS, resolveGoStory } from '@/lib/landing'

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

  // GO-LISTEN-VARIANT-001 (Marc, 2026-11-20): the hook variants used to be
  // recorded as 'bare', which made Miami ad traffic indistinguishable from
  // default /go traffic.
  it('records hook variants by their own name, not bare', () => {
    expect(resolveGoVariant('?v=miami')).toBe('miami')
    expect(resolveGoVariant('?v=rise')).toBe('rise')
    expect(resolveGoVariant('?v=widow')).toBe('widow')
    expect(resolveGoVariant('?v=rerouted')).toBe('rerouted')
    expect(resolveGoVariant('?v=home')).toBe('home')
    expect(resolveGoVariant('?v=MIAMI')).toBe('miami')
  })

  it('matches resolveGoStory exactly — the recorded variant is the story served', () => {
    // The pair must agree on every live variant: if resolveGoStory serves the
    // hook story, resolveGoVariant must record that hook's name, not 'bare'.
    for (const v of ['a', 'b', 'widow', 'rise', 'miami', 'rerouted', 'home']) {
      expect(resolveGoStory(`?v=${v}`).id).toBe(GO_STORY_VARIANTS[v].id)
      expect(resolveGoVariant(`?v=${v}`)).toBe(v)
    }
    // And they must agree in the fallback direction too: an unknown ?v serves
    // the default story and records 'bare'.
    expect(resolveGoStory('?v=nope').id).toBe(resolveGoStory('').id)
    expect(resolveGoVariant('?v=nope')).toBe('bare')
  })

  it('still serves bare for a gated or unknown variant', () => {
    expect(resolveGoVariant('?v=miami', ['a'])).toBe('bare')
    expect(resolveGoVariant('?v=nope')).toBe('bare')
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
    t.onTimeUpdate(80, 100) // jumps two milestones at once (+ sec_30 depth, INSTRUM-001)
    expect(sent.map(p => p.event)).toEqual(['pct_25', 'sec_30', 'pct_50', 'pct_75'])
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

// PIXEL-PLAYSTART-001 (Marc, 2026-11-20): the /go sample player must fire the
// Meta pixel, not just write go_listen_events. It logged 4 plays lifetime on
// the pixel against 35 in our own table.
describe('createGoListenTracker — pixel mirror', () => {
  function makeTracker() {
    const rows: GoListenPayload[] = []
    const pixels: Array<{ event: string; params: Record<string, unknown>; eventId: string }> = []
    const t = createGoListenTracker({
      variant: 'miami',
      utmSource: 'meta',
      utmCampaign: 'ww-miami',
      send: p => { rows.push(p) },
      sendPixel: (event, params, eventId) => { pixels.push({ event, params, eventId }) },
    })
    return { t, rows, pixels }
  }

  it('fires pixel PlayStart once on play, alongside the first-party row', () => {
    const { t, rows, pixels } = makeTracker()
    t.onPlayStart(0)
    t.onPlayStart(30) // pause→play again must not refire the pixel either
    expect(rows.filter(r => r.event === 'play_start')).toHaveLength(1)
    expect(pixels.filter(p => p.event === 'PlayStart')).toHaveLength(1)
    expect(pixels[0].params.u_go_variant).toBe('miami')
  })

  it('fires pixel Listened30s once when playback crosses 30s', () => {
    const { t, pixels } = makeTracker()
    t.onPlayStart(0)
    t.onTimeUpdate(10, 600)
    expect(pixels.filter(p => p.event === 'Listened30s')).toHaveLength(0)
    t.onTimeUpdate(30, 600)
    t.onTimeUpdate(45, 600)
    expect(pixels.filter(p => p.event === 'Listened30s')).toHaveLength(1)
  })

  it('never fires Listened30s for a listen that stopped before 30s', () => {
    const { t, pixels } = makeTracker()
    t.onPlayStart(0)
    t.onTimeUpdate(29, 600)
    t.onEnded(29)
    expect(pixels.filter(p => p.event === 'Listened30s')).toHaveLength(0)
  })

  it('a pixel failure never stops the first-party row or throws', () => {
    const rows: GoListenPayload[] = []
    const t = createGoListenTracker({
      variant: 'bare',
      utmSource: null,
      utmCampaign: null,
      send: p => { rows.push(p) },
      sendPixel: () => { throw new Error('fbq exploded') },
    })
    expect(() => {
      t.onPlayStart(0)
      t.onTimeUpdate(40, 600)
    }).not.toThrow()
    expect(rows.map(r => r.event)).toEqual(['play_start', 'sec_30'])
  })
})
