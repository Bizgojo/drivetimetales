// lib/goListen.ts — ATL-GO-LISTEN-001
// First-party listen analytics for the /go sample player.
//
// HARD RULE (Marc, msg 2848): analytics must NEVER degrade playback. Every
// exported function is swallow-all — no throws, no console spam, no awaits
// on the playback path. Transport is navigator.sendBeacon (survives page
// exit) with a fetch(keepalive) fallback; both fire-and-forget.
//
// session_id: crypto.randomUUID() minted once per tracker (= per page
// visit). Deliberately NOT persisted (no localStorage/cookie) — a visit is
// the unit of analysis for the Sunday zero-signup decision, and an
// unpersisted random UUID carries no PII and cannot track across days.
//
// Event model (each fired AT MOST ONCE per session, latched here; the DB
// unique index (session_id, event) backstops):
//   play_start — first 'play' from the audio element
//   sec_30     — playback position crossed 30s (INSTRUM-001: closes the
//                0–189s blind spot between play_start and pct_25 on a
//                ~12.6-min sample). PRE-DDL SAFE: until Marc applies the
//                sec_30 migration, the live CHECK constraint/RLS policy
//                rejects the row — the ingest API 202s it quietly and the
//                client is fire-and-forget, so emission can never break
//                playback or the existing events.
//   pct_25/50/75 — playback crossed 25/50/75% of the sample (timeupdate)
//   complete   — 'ended'
//   cta_click  — visitor clicked a Start-free-trial CTA
//
// Pure decision logic (variant resolution, milestone crossing, payload
// build) is exported separately so it is unit-testable without a DOM.

import { GO_LIVE_VARIANTS, GO_STORY_VARIANTS } from './landing'

export type GoListenVariant = 'a' | 'b' | 'bare'
export type GoListenEventName =
  | 'play_start'
  | 'sec_30'
  | 'pct_25'
  | 'pct_50'
  | 'pct_75'
  | 'complete'
  | 'cta_click'
  // GO-PREVIEW-001 (Marc authorization, msg 3662, 2026-07-22)
  // Preview lifecycle events — PRE-DDL SAFE: the go_listen_events CHECK
  // constraint on 'event' will reject unknown values until the CHECK is updated.
  // The API 202s them quietly; client is fire-and-forget.
  | 'preview_started'    // muted autoplay begins (position_seconds=0)
  | 'preview_completed'  // 15s clip ends naturally (position_seconds=15)
  | 'preview_unmuted'    // user taps "Tap for sound" (position_seconds=current preview pos)
  | 'preview_to_play'    // auto-continue from preview end → full episode (position_seconds=previewContinueSec)
  | 'preview_skipped'    // user tapped main play during preview, skipping to full episode (position_seconds=0)
  // CTA-INSTRUMENTATION-001 (Marc authorization, msg 3616, 2026-07-22)
  | 'cta_rendered'

export const GO_LISTEN_ENDPOINT = '/api/go-listen'

/** Milestone thresholds, ascending. */
export const GO_LISTEN_MILESTONES: ReadonlyArray<{ event: GoListenEventName; fraction: number }> = [
  { event: 'pct_25', fraction: 0.25 },
  { event: 'pct_50', fraction: 0.5 },
  { event: 'pct_75', fraction: 0.75 },
]

/** INSTRUM-001: absolute-seconds depth thresholds, ascending (duration-
 *  independent — fire even before metadata/duration is known). */
export const GO_LISTEN_DEPTH_SECONDS: ReadonlyArray<{ event: GoListenEventName; seconds: number }> = [
  { event: 'sec_30', seconds: 30 },
]

/** Server-side clamp mirror — keep in sync with the migration CHECK. */
export const GO_LISTEN_MAX_POSITION_SECONDS = 21600
export const GO_LISTEN_MAX_UTM_LENGTH = 120

export interface GoListenPayload {
  session_id: string
  variant: GoListenVariant
  utm_source: string | null
  utm_campaign: string | null
  event: GoListenEventName
  position_seconds: number
}

/**
 * Which analytics variant is actually being SERVED. Mirrors
 * lib/landing.ts resolveGoStory: only live-allowlisted ?v= values serve a
 * variant story; everything else (bare /go, junk ?v=, gated variants)
 * serves the default story = 'bare'. Never throws.
 */
export function resolveGoVariant(
  search: string,
  liveVariants: ReadonlyArray<string> = GO_LIVE_VARIANTS
): GoListenVariant {
  try {
    const v = (new URLSearchParams(search ?? '').get('v') ?? '').trim().toLowerCase()
    if ((v === 'a' || v === 'b') && liveVariants.includes(v) && GO_STORY_VARIANTS[v]) return v
    return 'bare'
  } catch {
    return 'bare'
  }
}

/** Trim + bound a utm param; empty/whitespace-only → null. Never throws. */
export function normalizeUtm(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, GO_LISTEN_MAX_UTM_LENGTH)
}

/** Clamp an audio position to the payload contract (int, 0..max). */
export function clampPositionSeconds(position: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0
  return Math.min(Math.floor(position), GO_LISTEN_MAX_POSITION_SECONDS)
}

/**
 * Milestones newly crossed at `position` of `duration`, excluding ones in
 * `alreadyFired`. Pure. Returns [] for junk inputs (0/NaN duration etc.).
 * NOTE: a resumed session (localStorage resume in GoSamplePlayer) reports
 * milestones from its resume point on first timeupdate — accepted +
 * documented; position_seconds disambiguates in analysis.
 */
export function milestonesCrossed(
  position: number,
  duration: number,
  alreadyFired: ReadonlySet<string>
): GoListenEventName[] {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return []
  const fraction = position / duration
  const out: GoListenEventName[] = []
  for (const m of GO_LISTEN_MILESTONES) {
    if (fraction >= m.fraction && !alreadyFired.has(m.event)) out.push(m.event)
  }
  return out
}

/**
 * INSTRUM-001: absolute-seconds depth events newly crossed at `position`,
 * excluding ones in `alreadyFired`. Pure; duration-independent (works before
 * loadedmetadata). Returns [] for junk positions. Same resume caveat as
 * milestonesCrossed: a localStorage-resumed session past 30s reports sec_30
 * on its first timeupdate — accepted; position_seconds disambiguates.
 */
export function depthEventsCrossed(
  position: number,
  alreadyFired: ReadonlySet<string>
): GoListenEventName[] {
  if (!Number.isFinite(position) || position <= 0) return []
  const out: GoListenEventName[] = []
  for (const d of GO_LISTEN_DEPTH_SECONDS) {
    if (position >= d.seconds && !alreadyFired.has(d.event)) out.push(d.event)
  }
  return out
}

/** RFC4122-shaped random id; crypto.randomUUID with a Math.random fallback
 *  (old WebViews) — still random, still no PII. Never throws. */
export function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fall through */ }
  // Fallback v4 shape (non-crypto randomness is acceptable for analytics ids)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Fire-and-forget transport: sendBeacon first (survives page exit), fetch
 *  keepalive fallback. All failures silent — never blocks, never throws. */
export function sendGoListenPayload(payload: GoListenPayload): void {
  if (typeof window === 'undefined') return
  let body: string
  try {
    body = JSON.stringify(payload)
  } catch {
    return
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Blob with explicit content-type so the API can JSON-parse it.
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(GO_LISTEN_ENDPOINT, blob)) return
    }
  } catch { /* fall through to fetch */ }
  try {
    void fetch(GO_LISTEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* silent */ })
  } catch { /* silent — analytics never degrade playback */ }
}

export interface GoListenTracker {
  /** From the audio element's 'play' — fires play_start once. */
  onPlayStart(positionSeconds: number): void
  /** From 'timeupdate' while playing — fires pct_25/50/75, each once. */
  onTimeUpdate(positionSeconds: number, durationSeconds: number): void
  /** From 'ended' — fires complete once. */
  onEnded(positionSeconds: number): void
  /** From CTA click handlers — fires cta_click once. */
  onCtaClick(positionSeconds: number): void
  // GO-PREVIEW-001 preview lifecycle — each latched to fire at most once.
  /** Fires when muted autoplay begins (position_seconds=0). */
  onPreviewStarted(): void
  /** Fires when the 15s preview clip ends naturally (position_seconds=15). */
  onPreviewCompleted(): void
  /** Fires when user taps "Tap for sound" (position_seconds=current preview position). */
  onPreviewUnmuted(positionSeconds: number): void
  /** CTA-INSTRUMENTATION-001: fired once when the bottom sheet first becomes
   *  visible (ctaRevealed transitions false→true via the 45s listen latch).
   *  Does NOT fire on completion-pulse or heading changes — only initial reveal. */
  onCtaRendered(positionSeconds: number): void
  /** Exposed for tests/debugging only. */
  readonly sessionId: string
}

export interface GoListenTrackerInit {
  variant: GoListenVariant
  utmSource: string | null | undefined
  utmCampaign: string | null | undefined
  /** Injectable transport for tests; defaults to sendGoListenPayload. */
  send?: (payload: GoListenPayload) => void
}

/**
 * Per-visit tracker: one session id, one latch set. Every method is
 * wrapped so a bug here can never reach the player's event handlers.
 */
export function createGoListenTracker(init: GoListenTrackerInit): GoListenTracker {
  const sessionId = newSessionId()
  const send = init.send ?? sendGoListenPayload
  const fired = new Set<GoListenEventName>()
  const utmSource = normalizeUtm(init.utmSource)
  const utmCampaign = normalizeUtm(init.utmCampaign)

  const fireOnce = (event: GoListenEventName, positionSeconds: number) => {
    try {
      if (fired.has(event)) return
      fired.add(event)
      send({
        session_id: sessionId,
        variant: init.variant,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        event,
        position_seconds: clampPositionSeconds(positionSeconds),
      })
    } catch { /* silent — analytics never degrade playback */ }
  }

  return {
    sessionId,
    onPlayStart(positionSeconds: number) {
      fireOnce('play_start', positionSeconds)
    },
    onTimeUpdate(positionSeconds: number, durationSeconds: number) {
      try {
        // INSTRUM-001: absolute-depth events first (duration-independent),
        // then percentage milestones. Each latched independently by fireOnce
        // — a sec_30 send can never affect the existing events.
        for (const event of depthEventsCrossed(positionSeconds, fired)) {
          fireOnce(event, positionSeconds)
        }
        for (const event of milestonesCrossed(positionSeconds, durationSeconds, fired)) {
          fireOnce(event, positionSeconds)
        }
      } catch { /* silent */ }
    },
    onEnded(positionSeconds: number) {
      fireOnce('complete', positionSeconds)
    },
    onCtaClick(positionSeconds: number) {
      fireOnce('cta_click', positionSeconds)
    },
    // GO-PREVIEW-001 preview lifecycle events
    onPreviewStarted() {
      fireOnce('preview_started', 0)
    },
    onPreviewCompleted() {
      fireOnce('preview_completed', 15)
    },
    onPreviewUnmuted(positionSeconds: number) {
      fireOnce('preview_unmuted', positionSeconds)
    },
    // CTA-INSTRUMENTATION-001
    onCtaRendered(positionSeconds: number) {
      fireOnce('cta_rendered', positionSeconds)
    },
  }
}
