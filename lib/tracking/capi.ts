// lib/tracking/capi.ts — ATL-PIXEL-001 server-side conversion senders
//
// SERVER-ONLY (imports node:crypto). Sends events to Meta Conversions API and
// TikTok Events API. Fire-and-forget by contract:
//   - NEVER throws (money path — the Stripe webhook — must not break on ads)
//   - NEVER blocks longer than TRACKING_TIMEOUT_MS per platform
//   - Missing env config → silent skip (build/test runs without credentials)
//   - NEVER logs raw PII or token values
//
// Credentials are referenced by env var name only (Marc sets values in Vercel):
//   NEXT_PUBLIC_META_PIXEL_ID   (or META_PIXEL_ID)   — public pixel id
//   META_CAPI_TOKEN                                   — server secret
//   NEXT_PUBLIC_TIKTOK_PIXEL_ID (or TIKTOK_PIXEL_ID)  — public pixel id
//   TIKTOK_EVENTS_TOKEN                               — server secret
// Optional (Test Events tooling during verification):
//   META_TEST_EVENT_CODE, TIKTOK_TEST_EVENT_CODE

import { createHash } from 'crypto'
import {
  TrackedEventName,
  metaEventName,
  tiktokEventName,
  tiktokCompanionEventNames,
  normalizeEmailForHash,
  normalizePhoneForHash,
} from './events'

const TRACKING_TIMEOUT_MS = 4000
const META_API_VERSION = 'v21.0'
const TIKTOK_TRACK_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'

export function sha256Lower(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmailForHash(email)
  return normalized ? sha256Lower(normalized) : null
}

export function hashPhone(phone: string | null | undefined): string | null {
  const normalized = normalizePhoneForHash(phone)
  return normalized ? sha256Lower(normalized) : null
}

export function hashExternalId(id: string | null | undefined): string | null {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed ? sha256Lower(trimmed) : null
}

export interface ServerTrackingEvent {
  name: Exclude<TrackedEventName, 'PageView' | 'ViewContent' | 'InitiateCheckout'>
  /** Shared dedup key — MUST match the client-side eventID for dual-fired events. */
  eventId: string
  /** Raw email; hashed (SHA-256) before leaving this module. Never sent raw. */
  email?: string | null
  /** Raw phone; hashed before leaving this module. Never sent raw. */
  phone?: string | null
  /** Stable user id (supabase users.id); hashed before leaving this module. */
  externalId?: string | null
  value?: number
  currency?: string
  /** Page URL for event_source_url / page.url (attribution quality). */
  sourceUrl?: string
  /** Flat attribution/context props (utm_*, promo_code, plan...). Values must not contain PII. */
  customData?: Record<string, string | number | undefined | null>
  /** Unix seconds; defaults to now. Exposed for tests. */
  eventTime?: number
}

function compactCustomData(customData?: ServerTrackingEvent['customData']): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(customData || {})) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

// ── Payload builders (pure — unit-tested in __tests__/atl-pixel-001) ────────

export function buildMetaCapiPayload(evt: ServerTrackingEvent, testEventCode?: string) {
  const em = hashEmail(evt.email)
  const ph = hashPhone(evt.phone)
  const externalId = hashExternalId(evt.externalId)
  const userData: Record<string, string[]> = {}
  if (em) userData.em = [em]
  if (ph) userData.ph = [ph]
  if (externalId) userData.external_id = [externalId]

  const customData: Record<string, string | number> = compactCustomData(evt.customData)
  if (typeof evt.value === 'number') customData.value = evt.value
  if (evt.currency) customData.currency = evt.currency

  return {
    data: [
      {
        event_name: metaEventName(evt.name),
        event_time: evt.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: evt.eventId,
        action_source: 'website' as const,
        ...(evt.sourceUrl ? { event_source_url: evt.sourceUrl } : {}),
        user_data: userData,
        ...(Object.keys(customData).length ? { custom_data: customData } : {}),
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  }
}

export function buildTikTokPayload(evt: ServerTrackingEvent, pixelId: string, testEventCode?: string) {
  const em = hashEmail(evt.email)
  const ph = hashPhone(evt.phone)
  const externalId = hashExternalId(evt.externalId)
  const user: Record<string, string> = {}
  if (em) user.email = em
  if (ph) user.phone = ph
  if (externalId) user.external_id = externalId

  const properties: Record<string, string | number> = compactCustomData(evt.customData)
  if (typeof evt.value === 'number') properties.value = evt.value
  if (evt.currency) properties.currency = evt.currency.toUpperCase()

  // Primary event + any TikTok companion emits (e.g. StartTrial also sends
  // standard 'Subscribe') share time/id/user/properties — one API request.
  const eventNames = [tiktokEventName(evt.name), ...tiktokCompanionEventNames(evt.name)]
  const eventTime = evt.eventTime ?? Math.floor(Date.now() / 1000)

  return {
    event_source: 'web' as const,
    event_source_id: pixelId,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    data: eventNames.map(eventName => ({
      event: eventName,
      event_time: eventTime,
      event_id: evt.eventId,
      user,
      ...(Object.keys(properties).length ? { properties } : {}),
      ...(evt.sourceUrl ? { page: { url: evt.sourceUrl } } : {}),
    })),
  }
}

// ── Env resolution (defensive .trim() per 2026-07-11 Stripe env lesson) ─────

function metaConfig() {
  const pixelId = (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim()
  const token = (process.env.META_CAPI_TOKEN || '').trim()
  const testEventCode = (process.env.META_TEST_EVENT_CODE || '').trim() || undefined
  return pixelId && token ? { pixelId, token, testEventCode } : null
}

function tiktokConfig() {
  const pixelId = (process.env.TIKTOK_PIXEL_ID || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || '').trim()
  const token = (process.env.TIKTOK_EVENTS_TOKEN || '').trim()
  const testEventCode = (process.env.TIKTOK_TEST_EVENT_CODE || '').trim() || undefined
  return pixelId && token ? { pixelId, token, testEventCode } : null
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, label: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRACKING_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      // Response body can carry diagnostic codes; log status + first bytes only.
      const text = (await res.text().catch(() => '')).slice(0, 300)
      console.error(`[tracking] ${label} responded ${res.status}: ${text}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function sendMeta(evt: ServerTrackingEvent): Promise<void> {
  const cfg = metaConfig()
  if (!cfg) return
  const payload = buildMetaCapiPayload(evt, cfg.testEventCode)
  const url = `https://graph.facebook.com/${META_API_VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`
  await postJson(url, payload, {}, `meta capi ${evt.name}`)
}

async function sendTikTok(evt: ServerTrackingEvent): Promise<void> {
  const cfg = tiktokConfig()
  if (!cfg) return
  const payload = buildTikTokPayload(evt, cfg.pixelId, cfg.testEventCode)
  await postJson(TIKTOK_TRACK_URL, payload, { 'Access-Token': cfg.token }, `tiktok events ${evt.name}`)
}

/**
 * Send one conversion event to both platforms in parallel.
 * Never throws; per-platform failures are logged (no PII, no tokens) and
 * swallowed. Callers on the money path may `await` this safely — worst case
 * is TRACKING_TIMEOUT_MS, and platform sends run concurrently.
 */
export async function sendServerEvent(evt: ServerTrackingEvent): Promise<void> {
  try {
    const results = await Promise.allSettled([sendMeta(evt), sendTikTok(evt)])
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        const platform = i === 0 ? 'meta' : 'tiktok'
        console.error(`[tracking] ${platform} send failed (non-fatal) for ${evt.name}/${evt.eventId}:`, result.reason?.message || result.reason)
      }
    }
  } catch (err: any) {
    console.error('[tracking] sendServerEvent threw (non-fatal):', err?.message || err)
  }
}
