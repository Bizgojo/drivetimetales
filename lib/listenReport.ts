// lib/listenReport.ts — ATL-GO-LISTEN-001 aggregation logic for
// /api/admin/listen-report, extracted pure so it is unit-testable
// (__tests__/listen-report-001.test.ts).
//
// SESSION MODEL: session_id = random per-visit UUID from the /go sample
// player. Each event type appears at most once per session (client latch +
// DB unique index), so a session collapses to the set of events it reached
// plus the furthest audio position seen.
//
// WINDOWS (final revisions, Marc msg 2868): every metric is reported twice —
// Last 24h (rolling) and All-time. A session belongs to the 24h window when
// its FIRST event's created_at is >= now-24h. Sessions span minutes at most
// (one sample play), so windowing whole sessions by their start avoids
// phantom partial funnels (e.g. a pct_75 with no play_start) at the boundary
// while matching the created_at >= now-24h cut for all practical purposes.

export type ListenEventRow = {
  session_id: string
  variant: string
  utm_source: string | null
  event: string
  position_seconds: number
  created_at: string
}

export type SessionAgg = {
  variant: string
  utmSource: string | null
  events: Set<string>
  maxListenSeconds: number
  /** Epoch ms of the session's earliest event (0 if created_at unparseable). */
  firstEventMs: number
}

export type ListenGroupStats = {
  key: string
  starts: number
  totalSessions: number
  medianListenSeconds: number | null
  pct25Rate: number | null
  pct50Rate: number | null
  pct75Rate: number | null
  completionRate: number | null
  ctaClickRate: number | null
  listenedFullyNoCta: number
  clickedCta: number
}

/** One group (variant / utm_source) with both reporting windows. */
export type ListenGroupWindows = {
  key: string
  /** Sessions whose first event is within the rolling last 24 hours. */
  h24: ListenGroupStats
  /** All sessions ever recorded. */
  total: ListenGroupStats
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function buildSessions(rows: ListenEventRow[]): Map<string, SessionAgg> {
  const sessions = new Map<string, SessionAgg>()
  for (const row of rows) {
    let s = sessions.get(row.session_id)
    if (!s) {
      s = { variant: row.variant, utmSource: row.utm_source, events: new Set(), maxListenSeconds: 0, firstEventMs: 0 }
      sessions.set(row.session_id, s)
    }
    if (s.utmSource === null && row.utm_source !== null) s.utmSource = row.utm_source
    s.events.add(row.event)
    const at = Date.parse(row.created_at)
    if (Number.isFinite(at) && (s.firstEventMs === 0 || at < s.firstEventMs)) s.firstEventMs = at
    const pos = Number(row.position_seconds)
    // cta_click position is where they clicked, not how far they listened —
    // exclude it from the listen-depth measure.
    if (row.event !== 'cta_click' && Number.isFinite(pos) && pos > s.maxListenSeconds) {
      s.maxListenSeconds = pos
    }
  }
  return sessions
}

export function computeStats(key: string, group: SessionAgg[]): ListenGroupStats {
  const started = group.filter(s => s.events.has('play_start'))
  const starts = started.length
  const withEvent = (event: string) => started.filter(s => s.events.has(event)).length
  const rate = (n: number) => (starts > 0 ? (n / starts) * 100 : null)
  const reached75 = group.filter(s => s.events.has('pct_75') || s.events.has('complete'))
  return {
    key,
    starts,
    totalSessions: group.length,
    medianListenSeconds: median(started.map(s => s.maxListenSeconds)),
    pct25Rate: rate(withEvent('pct_25')),
    pct50Rate: rate(withEvent('pct_50')),
    pct75Rate: rate(withEvent('pct_75')),
    completionRate: rate(withEvent('complete')),
    ctaClickRate: rate(group.filter(s => s.events.has('cta_click')).length),
    listenedFullyNoCta: reached75.filter(s => !s.events.has('cta_click')).length,
    clickedCta: group.filter(s => s.events.has('cta_click')).length,
  }
}

/** True when the session's first event falls inside the rolling 24h window. */
export function inLast24h(s: SessionAgg, cutoffMs: number): boolean {
  return s.firstEventMs >= cutoffMs
}

/**
 * Group sessions by key and compute BOTH windows per group. Groups that have
 * no sessions in the last 24h still appear (their h24 stats are the graceful
 * zero/em-dash shape: starts 0, rates null). Sorted by all-time starts desc.
 */
export function groupWindows(
  sessions: SessionAgg[],
  cutoffMs: number,
  keyOf: (s: SessionAgg) => string
): ListenGroupWindows[] {
  const groups = new Map<string, SessionAgg[]>()
  for (const s of sessions) {
    const key = keyOf(s)
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      h24: computeStats(key, group.filter(s => inLast24h(s, cutoffMs))),
      total: computeStats(key, group),
    }))
    .sort((a, b) => b.total.starts - a.total.starts || a.key.localeCompare(b.key))
}
