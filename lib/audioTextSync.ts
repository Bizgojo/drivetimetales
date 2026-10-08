/**
 * EBOOK-AUDIO-SYNC-001 (Phase 1): pure audio-time ↔ ebook-paragraph mapping.
 *
 * Backend foundation lives in PR #307 (content_start_ms/content_end_ms on
 * stories, computed in render-final-mix/core.ts — where the story body sits
 * inside the final mixed file, excluding Belle B's intro/sting and outro,
 * which the ebook prose never includes).
 *
 * This module is the client-side counterpart: null-safe pure functions that
 * translate between audio clock time and prose paragraph index using those
 * bounds. When bounds are absent (back-catalog rows rendered before #307 —
 * no backfill), every function returns null and callers fall back to existing
 * behavior. No UI lives here; the reader/player UI consumes these in a
 * follow-up cycle ("one objective per cycle").
 *
 * Convention: all times in seconds (audio clock), bounds in ms (DB unit).
 * Content fraction 0..1 spans the story body only, mapped linearly onto
 * paragraph indices (uniform-distribution assumption — documented
 * approximation until per-paragraph timing exists).
 */

export type ContentBounds = {
  contentStartMs: number | null | undefined
  contentEndMs: number | null | undefined
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Normalize raw story-row bounds; null unless both ends are sane. */
export function normalizeContentBounds(
  raw: ContentBounds | null | undefined,
  durationSecs: number | null | undefined
): { startSecs: number; endSecs: number } | null {
  if (!raw) return null
  const startMs = toFiniteNumber(raw.contentStartMs)
  const endMs = toFiniteNumber(raw.contentEndMs)
  const duration = toFiniteNumber(durationSecs)
  if (startMs === null || endMs === null || duration === null) return null
  if (duration <= 0) return null
  if (startMs < 0 || endMs <= startMs) return null
  const startSecs = startMs / 1000
  const endSecs = Math.min(endMs / 1000, duration)
  if (endSecs <= startSecs) return null
  return { startSecs, endSecs }
}

/**
 * Audio clock time → content fraction (0..1 within the story body).
 * Returns null when bounds are unavailable; clamps out-of-body times
 * (intro/outro regions) to 0/1 so callers can still place the reader
 * at the start/end instead of showing nothing.
 */
export function audioTimeToContentFraction(
  currentTimeSecs: number,
  rawBounds: ContentBounds | null | undefined,
  durationSecs: number | null | undefined
): number | null {
  const bounds = normalizeContentBounds(rawBounds, durationSecs)
  if (!bounds) return null
  const t = toFiniteNumber(currentTimeSecs)
  if (t === null) return null
  if (t <= bounds.startSecs) return 0
  if (t >= bounds.endSecs) return 1
  return (t - bounds.startSecs) / (bounds.endSecs - bounds.startSecs)
}

/** Content fraction (0..1) → audio clock time in seconds. Null w/o bounds. */
export function contentFractionToAudioTime(
  fraction: number,
  rawBounds: ContentBounds | null | undefined,
  durationSecs: number | null | undefined
): number | null {
  const bounds = normalizeContentBounds(rawBounds, durationSecs)
  if (!bounds) return null
  const f = toFiniteNumber(fraction)
  if (f === null) return null
  const clamped = Math.max(0, Math.min(1, f))
  return bounds.startSecs + clamped * (bounds.endSecs - bounds.startSecs)
}

/** Content fraction → paragraph index for a body of totalParagraphs. */
export function contentFractionToParagraph(
  fraction: number,
  totalParagraphs: number
): number | null {
  const f = toFiniteNumber(fraction)
  const total = toFiniteNumber(totalParagraphs)
  if (f === null || total === null || total <= 0) return null
  const clamped = Math.max(0, Math.min(1, f))
  return Math.max(0, Math.min(Math.floor(total) - 1, Math.floor(clamped * Math.floor(total))))
}

/** Paragraph index → content fraction (paragraph start edge). */
export function paragraphToContentFraction(
  paragraphIndex: number,
  totalParagraphs: number
): number | null {
  const idx = toFiniteNumber(paragraphIndex)
  const total = toFiniteNumber(totalParagraphs)
  if (idx === null || total === null || total <= 0) return null
  const clamped = Math.max(0, Math.min(Math.floor(total) - 1, Math.floor(idx)))
  return clamped / Math.floor(total)
}

/** Audio clock time → paragraph index. Null when bounds unavailable. */
export function audioTimeToParagraph(
  currentTimeSecs: number,
  rawBounds: ContentBounds | null | undefined,
  durationSecs: number | null | undefined,
  totalParagraphs: number
): number | null {
  const fraction = audioTimeToContentFraction(currentTimeSecs, rawBounds, durationSecs)
  if (fraction === null) return null
  return contentFractionToParagraph(fraction, totalParagraphs)
}

/** Paragraph index → audio clock time. Null when bounds unavailable. */
export function paragraphToAudioTime(
  paragraphIndex: number,
  totalParagraphs: number,
  rawBounds: ContentBounds | null | undefined,
  durationSecs: number | null | undefined
): number | null {
  const fraction = paragraphToContentFraction(paragraphIndex, totalParagraphs)
  if (fraction === null) return null
  return contentFractionToAudioTime(fraction, rawBounds, durationSecs)
}
