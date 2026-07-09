/**
 * PERS-FIX-002 — publish-time personalization guard.
 *
 * Evidence (PERS-DIAG-001, 2026-07-09): "Weight of the Water" was published
 * with a legacy [LISTENER_NAME] intro. generate-voices takes the legacy split
 * path for such intros and explicitly sets announcement_url = NULL, which
 * hard-disables the personalized branch in /api/asc3/story-playlist
 * (buildPersonalizedQueue returns null). 33 of 44 published stories shipped
 * that way; listeners silently got the generic final_mix.
 *
 * Rule: a story may NOT be published while
 *   1. announcement_url is NULL/empty (personalization hard-disabled), or
 *   2. [LISTENER_NAME] survives in its announcement_text or script (phase-3
 *      forbids the token — the shared name-opener pool handles the greeting).
 *
 * Used by every publish writer (see lib/workflowTransitions.ts governance):
 *  - app/api/admin/publish-story  (single + series)
 *  - app/api/asc3/publish-story
 *  - app/api/admin/content-approval (workflow transitions to 'published')
 */

export const LISTENER_NAME_TOKEN = '[LISTENER_NAME]'

export type PublishGuardStory = {
  announcement_url?: string | null
  announcement_text?: string | null
  script?: string | null
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Returns the list of personalization publish blockers for a story.
 * Empty array = publishable (from a personalization standpoint).
 */
export function personalizationPublishBlockers(story: PublishGuardStory): string[] {
  const blockers: string[] = []

  if (!clean(story?.announcement_url)) {
    blockers.push(
      'announcement_url is missing — personalized playback is hard-disabled for this story; ' +
      'generate a name-free Belle announcement before publishing'
    )
  }

  if (clean(story?.announcement_text).includes(LISTENER_NAME_TOKEN)) {
    blockers.push(
      'announcement_text still contains the legacy [LISTENER_NAME] token — ' +
      'regenerate a name-free announcement (the shared name-opener pool handles the greeting)'
    )
  }

  if (clean(story?.script).includes(LISTENER_NAME_TOKEN)) {
    blockers.push(
      'script still contains the legacy [LISTENER_NAME] token — ' +
      'strip it before publishing (the shared name-opener pool handles the greeting)'
    )
  }

  return blockers
}

/** Columns a publish writer must select to run the guard. */
export const PUBLISH_GUARD_COLUMNS = 'announcement_url,announcement_text,script'
