/**
 * FIX-1 §10 POLICY HELPERS — lib/storage/section10.ts
 *
 * Pure, unit-tested encodings of Marc's §10 answers (2026-10-03, logged as
 * fix1-section10-answers-oct3). No I/O. No Supabase calls.
 *
 * Logged answers:
 *  1. Playback conflicts: last-write-wins by timestamp
 *  2. Retention: 14 days grace / 90-day archive
 *  3. Cache eviction: server can force deletion
 *  4. Cross-device position: syncs by default
 *  5. Correction files: become canonical
 *  6. story_body_with_outro failure: fatal
 *
 * Scope note: (1) last-write-wins applies to PLAYBACK POSITION / device sync
 * conflicts only — it does NOT authorize storage clobber. Live storage keys
 * keep throw-if-divergent (see supabaseAdapter promoteToLive). (4) syncs-by-
 * default is a product default; pipeline code only needs to not break it
 * (never strip position fields). (3) server-force-delete is the authority
 * behind recast/rerecord removes — allowed, but must be verified + logged.
 */

export const RETENTION_GRACE_DAYS = 14
export const RETENTION_ARCHIVE_DAYS = 90

export const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Days elapsed between two epoch-ms timestamps. */
export function daysBetween(earlierMs: number, laterMs: number): number {
  return (laterMs - earlierMs) / MS_PER_DAY
}

/**
 * Retention decision for a backup/orphan object created at createdAtMs,
 * evaluated at nowMs.
 * - age < 14d → 'retain' (grace window, never GC)
 * - 14d ≤ age < 90d → 'archive_candidate' (may move to cold/archive, never hard-delete)
 * - age ≥ 90d → 'purge_candidate' (eligible for hard delete, still requires explicit sweep)
 */
export type RetentionDecision = 'retain' | 'archive_candidate' | 'purge_candidate'

export function decideRetention(createdAtMs: number, nowMs: number): RetentionDecision {
  const ageDays = daysBetween(createdAtMs, nowMs)
  if (ageDays < RETENTION_GRACE_DAYS) return 'retain'
  if (ageDays < RETENTION_ARCHIVE_DAYS) return 'archive_candidate'
  return 'purge_candidate'
}

/**
 * Last-write-wins for playback-position conflicts (§10 Q1).
 * Returns the winning record ('a' | 'b' | 'tie'). Tie → keep existing ('a').
 * Caller passes updated_at epoch-ms for each side.
 */
export function lastWriteWins(aUpdatedAtMs: number, bUpdatedAtMs: number): 'a' | 'b' | 'tie' {
  if (bUpdatedAtMs > aUpdatedAtMs) return 'b'
  if (aUpdatedAtMs > bUpdatedAtMs) return 'a'
  return 'tie'
}

/** story_body_with_outro failure is FATAL (§10 Q6). Throw, never warn. */
export function sbwoFatalError(detail: string): Error {
  return new Error(`FIX1_SBWO_FATAL: story_body_with_outro upload failed — ${detail}`)
}

/**
 * Correction artifacts are canonical (§10 Q5). Given a live key and its
 * corrected variant key, the canonical key is the corrected one when it
 * exists and verifies; otherwise the live key.
 */
export function canonicalKeyFor(liveKey: string, correctedKey: string | null, correctedVerified: boolean): string {
  if (correctedKey && correctedVerified) return correctedKey
  return liveKey
}
