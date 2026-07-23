// INSTRUM-001 (UX-GO-001 commit 2, Marc approval msg 2942, 2026-07-19) —
// sec_30 depth event: closes the 0–189s blind spot between play_start and
// pct_25 on the ~12.6-min sample.
//
// Covers:
//   1. depthEventsCrossed — pure threshold logic (30s, latch, junk inputs).
//   2. Tracker emission — sec_30 fires at most once via onTimeUpdate, is
//      duration-independent, and CANNOT break the existing events (latch
//      isolation + swallow-all transport).
//   3. Ingest — sec_30 whitelisted; unknown events still 400 gracefully;
//      pre-DDL constraint/policy rejection handled as quiet 202 (fail-quiet
//      until Marc applies the migration).
//   4. Migration FILE exists with the sec_30 enum in BOTH the CHECK
//      constraint and the RLS insert policy — file only, NOT applied.

import fs from 'fs'
import path from 'path'
import {
  createGoListenTracker,
  depthEventsCrossed,
  GO_LISTEN_DEPTH_SECONDS,
  GoListenPayload,
} from '@/lib/goListen'

const routeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'api', 'go-listen', 'route.ts'), 'utf8')
const migrationPath = path.join(
  __dirname, '..', 'supabase', 'migrations', '20260719083000_go_listen_sec_30.sql')

describe('INSTRUM-001: depthEventsCrossed (pure)', () => {
  it('threshold is 30s (single depth event today)', () => {
    expect(GO_LISTEN_DEPTH_SECONDS).toEqual([{ event: 'sec_30', seconds: 30 }])
  })

  it('below 30s → nothing', () => {
    expect(depthEventsCrossed(0, new Set())).toEqual([])
    expect(depthEventsCrossed(29.9, new Set())).toEqual([])
  })

  it('at/past 30s → sec_30', () => {
    expect(depthEventsCrossed(30, new Set())).toEqual(['sec_30'])
    expect(depthEventsCrossed(754, new Set())).toEqual(['sec_30'])
  })

  it('already fired → excluded (latch input honored)', () => {
    expect(depthEventsCrossed(60, new Set(['sec_30']))).toEqual([])
  })

  it('junk positions → nothing, never throws', () => {
    expect(depthEventsCrossed(NaN, new Set())).toEqual([])
    expect(depthEventsCrossed(Infinity, new Set())).toEqual([]) // non-finite = junk
    expect(depthEventsCrossed(-5, new Set())).toEqual([])
  })
})

describe('INSTRUM-001: tracker emits sec_30 (at most once, isolated)', () => {
  function tracker(sent: GoListenPayload[], send?: (p: GoListenPayload) => void) {
    return createGoListenTracker({
      variant: 'bare',
      utmSource: 'meta',
      utmCampaign: 'gvl',
      send: send ?? (p => { sent.push(p) }),
    })
  }

  it('fires sec_30 once on the first timeupdate at/past 30s, then never again', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onTimeUpdate(10, 756)
    expect(sent.map(p => p.event)).toEqual([])
    t.onTimeUpdate(31, 756)
    expect(sent.map(p => p.event)).toEqual(['sec_30'])
    expect(sent[0].position_seconds).toBe(31)
    t.onTimeUpdate(45, 756)
    t.onTimeUpdate(200, 756) // also crosses pct_25 (189s)
    expect(sent.filter(p => p.event === 'sec_30').length).toBe(1)
    expect(sent.map(p => p.event)).toEqual(['sec_30', 'pct_25'])
  })

  it('duration-independent: fires even when duration is unknown/junk', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onTimeUpdate(35, NaN)
    expect(sent.map(p => p.event)).toEqual(['sec_30'])
  })

  it('existing event set + ordering unchanged apart from sec_30', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent)
    t.onPlayStart(0)
    t.onTimeUpdate(200, 756) // crosses 30s + 25% together → sec_30 first
    t.onTimeUpdate(400, 756) // 52.9% → pct_50
    t.onTimeUpdate(600, 756) // 79.4% → pct_75
    t.onEnded(756)
    t.onCtaClick(756)
    expect(sent.map(p => p.event)).toEqual(
      ['play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click'])
  })

  it('fail-quiet: a throwing transport on sec_30 cannot break later events', () => {
    const sent: GoListenPayload[] = []
    const t = tracker(sent, p => {
      if (p.event === 'sec_30') throw new Error('constraint rejected / network down')
      sent.push(p)
    })
    expect(() => t.onTimeUpdate(31, 756)).not.toThrow()
    t.onTimeUpdate(200, 756)
    t.onEnded(756)
    expect(sent.map(p => p.event)).toEqual(['pct_25', 'complete'])
  })
})

describe('INSTRUM-001: ingest (/api/go-listen)', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    // No Supabase env in tests → valid events short-circuit to a quiet 202
    // BEFORE any network call; invalid ones 400 at validation.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })
  afterAll(() => { process.env = OLD_ENV })

  function post(body: unknown) {
    // Lazy import so env deletion above applies before module init.
    const { POST } = require('@/app/api/go-listen/route')
    const { NextRequest } = require('next/server')
    const req = new NextRequest('http://localhost/api/go-listen', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
    })
    return POST(req)
  }

  const valid = {
    session_id: '4f2b8f9e-1d2c-4a5b-8c7d-9e0f1a2b3c4d',
    variant: 'bare',
    utm_source: 'meta',
    utm_campaign: 'gvl',
    position_seconds: 31,
  }

  it('sec_30 passes validation (202 quiet-accept with no Supabase env)', async () => {
    const res = await post({ ...valid, event: 'sec_30' })
    expect(res.status).toBe(202)
  })

  it('existing events still validate the same way', async () => {
    for (const event of ['play_start', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click']) {
      const res = await post({ ...valid, event })
      expect(res.status).toBe(202)
    }
  })

  it('UNKNOWN events are rejected gracefully today (400, no throw) — fail-quiet contract', async () => {
    for (const event of ['sec_60', 'pct_10', 'garbage', '']) {
      const res = await post({ ...valid, event })
      expect(res.status).toBe(400)
    }
  })

  it('whitelist includes sec_30 exactly once (source pin)', () => {
    // CTA-INSTRUMENTATION-001 (2026-07-22): cta_rendered added to VALID_EVENTS.
    expect(routeSrc).toContain("'sec_30'")
    expect(routeSrc).toContain('VALID_EVENTS')
    expect(routeSrc).toContain("'cta_rendered'")
    expect(routeSrc).toContain("'cta_click'")
  })

  it('pre-DDL window: CHECK-constraint / RLS-policy rejection is a quiet 202 (source pin)', () => {
    expect(routeSrc).toContain('violates check constraint|23514|row-level security|42501')
    const branch = routeSrc.slice(routeSrc.indexOf('violates check constraint'))
    expect(branch).toContain('status: 202')
  })
})

describe('INSTRUM-001: migration file (NOT applied — Marc pastes the DDL)', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  it('exists and is clearly marked not-applied', () => {
    expect(sql).toContain('NOT APPLIED')
    expect(sql).toContain('Marc reviews + applies manually')
  })

  it('CHECK constraint superset includes sec_30 (drop + re-add pattern)', () => {
    expect(sql).toContain('drop constraint if exists go_listen_events_event_check')
    expect(sql).toContain(
      "check (event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click'))")
  })

  it('RLS insert policy recreated with the same superset + original guards', () => {
    expect(sql).toContain('drop policy if exists go_listen_events_insert_anon')
    expect(sql).toContain(
      "and event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click')")
    // Original policy guards preserved verbatim.
    expect(sql).toContain("variant in ('a', 'b', 'bare')")
    expect(sql).toContain('position_seconds between 0 and 21600')
    expect(sql).toContain("created_at between now() - interval '1 minute' and now() + interval '1 minute'")
  })
})
