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
 *   2. [LISTENER_NAME] survives in its script OUTSIDE the Belle intro line.
 *
 * Standing approval — Marc 2026-10-16 (msg 19041): [LISTENER_NAME] in the
 * Belle announcement position is an approved personalization token,
 * resolved downstream by the shared name-opener pool — not a legacy
 * leftover. Token-detection therefore treats the approved pattern as a
 * standing pass (not a per-story override): announcement_text IS the
 * Belle announcement position (a token there never blocks), and in script
 * only the leading Belle intro line (first `BELLE…:` speaker line) is the
 * announcement position. A token anywhere else in the script body still
 * blocks, and the announcement_url requirement is unchanged.
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
 * First `BELLE…:` speaker line = the Belle announcement (intro) position
 * within a script. Only this line is covered by the Marc 2026-10-16
 * standing personalization-token pass; every later line is script body.
 */
const BELLE_INTRO_LINE_RE = /^BELLE\b[^:\n]*:.*$/m

function withoutBelleIntro(script: string): string {
  return script.replace(BELLE_INTRO_LINE_RE, '')
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

  // Standing pass (Marc 2026-10-16): announcement_text IS the Belle
  // announcement position, so [LISTENER_NAME] there is the approved
  // personalization token — never a blocker. (The announcement_url check
  // above remains the hard gate against unpersonalizable publishes.)

  if (withoutBelleIntro(clean(story?.script)).includes(LISTENER_NAME_TOKEN)) {
    blockers.push(
      'script still contains the legacy [LISTENER_NAME] token outside the Belle intro line — ' +
      'strip it before publishing (the shared name-opener pool handles the greeting; ' +
      'only the leading Belle intro line may carry the approved token)'
    )
  }

  return blockers
}

/** Columns a publish writer must select to run the guard. */
export const PUBLISH_GUARD_COLUMNS = 'announcement_url,announcement_text,script'
