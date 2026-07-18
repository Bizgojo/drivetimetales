// app/api/go-listen/route.ts — ATL-GO-LISTEN-001 ingest endpoint.
//
// Thin, ANON-POSTABLE BY DESIGN: /go is a public ad landing page and events
// arrive via navigator.sendBeacon from anonymous visitors, so there is no
// auth here. Defense is validation + rate limiting + a tightly scoped RLS
// insert policy:
//
//   VALIDATION — strict whitelist of events/variants, UUID-shaped
//   session_id, position_seconds clamped to 0..21600, utm_* trimmed to
//   ≤120 chars, oversized bodies (>2 KB) rejected before JSON.parse.
//
//   RATE LIMIT — simple in-memory per-IP window: 60 events/min/IP
//   (a full legit session emits ≤6 events; 60/min tolerates NAT'd
//   coffee-shop traffic while stopping dumb floods). BEST-EFFORT on Vercel
//   serverless: each lambda instance has its own module scope, so the real
//   ceiling is 60/min × concurrent instances — acceptable for this scale
//   (documented trade-off; same posture as launch-report's live cache).
//   The map is swept when it exceeds 10k IPs so memory can't grow unbounded.
//
//   KEYS — inserts use the ANON key server-side (RLS insert policy on
//   go_listen_events only). The service key is never used here and never
//   ships client-side.
//
// Responses are advisory only — the client is fire-and-forget (sendBeacon
// can't even read them). 204 stored · 202 accepted-but-table-missing
// (pre-migration: don't fill logs with 5xx before Marc applies the DDL) ·
// 4xx invalid/flood · 500 unexpected.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 2048
const MAX_UTM_LENGTH = 120
const MAX_POSITION_SECONDS = 21600
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_EVENTS = 60
const RATE_LIMIT_MAX_IPS = 10_000

const VALID_EVENTS = new Set(['play_start', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click'])
const VALID_VARIANTS = new Set(['a', 'b', 'bare'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ── in-memory per-IP rate limit (best-effort per lambda instance) ───────────
type RateEntry = { count: number; windowStart: number }
const rateMap = new Map<string, RateEntry>()

function isRateLimited(ip: string, now: number = Date.now()): boolean {
  // Sweep stale entries when the map gets big (bounded memory).
  if (rateMap.size > RATE_LIMIT_MAX_IPS) {
    const entries = Array.from(rateMap.entries())
    for (const [key, entry] of entries) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateMap.delete(key)
    }
    if (rateMap.size > RATE_LIMIT_MAX_IPS) rateMap.clear() // pathological flood — reset
  }
  const entry = rateMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX_EVENTS
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  const first = fwd.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function normalizeUtm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_UTM_LENGTH)
}

type ValidatedEvent = {
  session_id: string
  variant: string
  utm_source: string | null
  utm_campaign: string | null
  event: string
  position_seconds: number
}

function validate(body: unknown): ValidatedEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const sessionId = typeof b.session_id === 'string' ? b.session_id.trim() : ''
  if (!UUID_RE.test(sessionId)) return null
  const variant = typeof b.variant === 'string' ? b.variant : ''
  if (!VALID_VARIANTS.has(variant)) return null
  const event = typeof b.event === 'string' ? b.event : ''
  if (!VALID_EVENTS.has(event)) return null
  const rawPos = Number(b.position_seconds)
  const position = Number.isFinite(rawPos)
    ? Math.min(Math.max(Math.floor(rawPos), 0), MAX_POSITION_SECONDS)
    : 0
  return {
    session_id: sessionId.toLowerCase(),
    variant,
    utm_source: normalizeUtm(b.utm_source),
    utm_campaign: normalizeUtm(b.utm_campaign),
    event,
    position_seconds: position,
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(clientIp(req))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Size gate BEFORE parsing (sendBeacon sends small JSON blobs; anything
    // bigger than 2 KB is not ours).
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const event = validate(parsed)
    if (!event) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      // Misconfigured env must never surface to the player — accept quietly.
      return new NextResponse(null, { status: 202 })
    }
    // ANON key on purpose: the RLS insert policy on go_listen_events is the
    // whole write surface. Service role is NOT used for ingest.
    const supabase = createClient(url, anon, { auth: { persistSession: false } })
    const { error } = await supabase.from('go_listen_events').insert(event)
    if (error) {
      const msg = error.message || ''
      // Pre-migration (table not applied yet): accept quietly, no log spam.
      if (/could not find the table|does not exist|schema cache/i.test(msg)) {
        return new NextResponse(null, { status: 202 })
      }
      // Duplicate (session_id, event) — client latch raced a retry; that's
      // the unique-index backstop doing its job. Treat as stored.
      if (/duplicate key|23505/i.test(msg)) {
        return new NextResponse(null, { status: 204 })
      }
      console.error('[go-listen] insert failed:', msg.slice(0, 300))
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[go-listen] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
