/**
 * READY-PUBLISH-URLS-001 — Publish-readiness rule (shared, pure)
 *
 * Problem (Marc, 2026-10-05): the admin "Ready to Publish" badge counted script
 * rows (workflow_state === 'approved_ready'), not finished production. An approved
 * script with no rendered audio read as publish-ready. The Alderton Inheritance
 * (3 eps) slipped through this exact gap.
 *
 * Rule: an episode is only publish-ready when ALL THREE rendered-production
 * artifacts actually exist in the DB:
 *   - audio_url          (the final mix)
 *   - cover_url          (the cover art)
 *   - announcement_url   (the Belle intro announcement)
 *
 * This module is pure and dependency-free so it can be unit-tested and reused by
 * both the client approval page and server-side guards.
 */

export interface PublishReadinessInput {
  /** rendered final-mix audio URL */
  audio_url?: string | null
  /** cover art URL */
  cover_url?: string | null
  /** Belle intro announcement URL */
  announcement_url?: string | null
  /** optional readiness booleans (derived server-side) as a fallback signal */
  audio_ready?: boolean | null
  cover_ready?: boolean | null
  announcement_ready?: boolean | null
}

function present(url?: string | null, ready?: boolean | null): boolean {
  return Boolean((url && String(url).trim().length > 0) || ready)
}

/**
 * True only when all three rendered-production artifacts are present.
 * This is the single source of truth for "the audio/packaging actually exists".
 */
export function hasRenderedProduction(story: PublishReadinessInput): boolean {
  const audioOk = present(story.audio_url, story.audio_ready)
  const coverOk = present(story.cover_url, story.cover_ready)
  const announcementOk = present(story.announcement_url, story.announcement_ready)
  return audioOk && coverOk && announcementOk
}

/** List of which rendered-production URLs are missing (for UI/messaging). */
export function missingProductionUrls(story: PublishReadinessInput): string[] {
  const missing: string[] = []
  if (!present(story.audio_url, story.audio_ready)) missing.push('audio_url')
  if (!present(story.cover_url, story.cover_ready)) missing.push('cover_url')
  if (!present(story.announcement_url, story.announcement_ready)) missing.push('announcement_url')
  return missing
}
