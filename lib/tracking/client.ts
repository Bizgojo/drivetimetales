// lib/tracking/client.ts — ATL-PIXEL-001 browser-side event helper
//
// One call fires BOTH pixels (Meta fbq + TikTok ttq) with a shared event_id
// so server twins sent via lib/tracking/capi.ts deduplicate correctly.
// Safe everywhere: no-ops when pixels are not loaded (env-gated components)
// or when running server-side. Never throws — ads must never break the app.

import { TrackedEventName, metaEventName, tiktokEventName, tiktokCompanionEventNames } from './events'

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
    ttq?: {
      track: (event: string, props?: Record<string, any>, options?: { event_id?: string }) => void
      page?: () => void
      identify?: (props: Record<string, any>) => void
    }
  }
}

export type ClientEventParams = Record<string, string | number | undefined | null>

function compactParams(params: ClientEventParams): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

/**
 * Fire one event on both browser pixels with a shared dedup event_id.
 * For events with a server twin (CompleteRegistration, StartTrial) the caller
 * MUST pass the deterministic id builders from lib/tracking/events.ts.
 */
export function trackClientEvent(
  name: Exclude<TrackedEventName, 'PageView'>,
  params: ClientEventParams,
  eventId: string
): void {
  if (typeof window === 'undefined') return
  const props = compactParams(params)
  try {
    window.fbq?.('track', metaEventName(name), props, { eventID: eventId })
  } catch (err) {
    console.warn('[tracking] fbq track failed (non-fatal):', err)
  }
  try {
    window.ttq?.track(tiktokEventName(name), props, { event_id: eventId })
    // TikTok dual emit (e.g. StartTrial → also standard 'Subscribe').
    // Same event_id is safe: TikTok dedups per event name.
    for (const companion of tiktokCompanionEventNames(name)) {
      window.ttq?.track(companion, props, { event_id: eventId })
    }
  } catch (err) {
    console.warn('[tracking] ttq track failed (non-fatal):', err)
  }
}
