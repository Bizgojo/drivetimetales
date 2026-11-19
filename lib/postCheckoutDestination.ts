/**
 * POST-CHECKOUT-DESTINATION-001 (Marc, 2026-11-19)
 *
 * Where a listener lands after paying, and which story they land in.
 *
 * The bug this fixes: after checkout the success URL is `/home?welcome=true`,
 * and `/home`'s welcome card hard-coded the destination to The Bell Beneath
 * Falls Park EP2 (`759dc525-…`). So an ad visitor who clicked a Weekend Wife
 * ad, signed up and paid landed in the Bell story at episode 2 — a series they
 * never asked for, halfway through. Two independent defects: the hard-coded
 * Bell fallback, and the fact that nothing carried the ad's story through the
 * funnel in the first place.
 *
 * The rule now:
 *   1. A story is known (explicit `story` param, or a resumable sample, or the
 *      utm_campaign mapping below) → land on THAT story's EPISODE 1.
 *   2. No story is known at all → `/home`. Never a random episode.
 *
 * Rule 1's "episode 1" is deliberate: a paying listener starts a story at the
 * beginning. Resuming a half-heard *sample* would drop them mid-story, which is
 * the exact complaint this change exists to fix.
 *
 * POST-CHECKOUT-DESTINATION-004 (Marc, 2026-11-19, after phone test #3): that
 * last paragraph was wrong about the sample case. Marc ruled the opposite — a
 * listener who played 60 s of the ad sample must be returned INTO that story at
 * the spot they stopped, not restarted at 0:00, and must never be left on Home.
 * The /go sample audio IS the catalog EP1 audio (`hookVariant` uses the EP1
 * final_mix), so the sample position maps 1:1 onto the player — the same
 * guarantee `sampleResumeHref` has always relied on.
 */

/**
 * utm_campaign value → series id. Canon utm names come from Marc's ad rules.
 *
 * NOTE: these are SERIES ids, not episode ids. `resolvePostCheckoutDestination`
 * therefore returns `seriesId` for the campaign source and the caller must
 * resolve the series' episode 1. See destinationHref below.
 */
export const UTM_CAMPAIGN_TO_SERIES: Record<string, string> = {
  'weekend-wife-miami': 'd6af80a4-1ac9-48ae-8e7a-1fb71357e4ad',
  'second-rise': 'd1f90c2a-44c2-4b3c-b489-fb10882490bd',
  'widow-who-watched': '78882d57-fd50-4095-99ab-0a577472eb9a',
}

export type PostCheckoutDestination =
  | { kind: 'player'; storyId: string; source: 'param' | 'sample'; resumeSeconds?: number }
  | { kind: 'series'; seriesId: string; source: 'campaign' }
  | { kind: 'home'; storyId: null; source: 'none' }

/**
 * Decide where to send a listener after checkout.
 *
 * Precedence is intentional: an explicitly passed story beats a remembered
 * sample, which beats a campaign tag. The most specific signal wins.
 *
 * @param opts.storyParam     `?story=<uuid>` on /home (set by the ad landing page)
 * @param opts.resumeStoryId  freshest resumable sample, if any
 * @param opts.resumeSeconds  where the sample stopped, when known
 * @param opts.utmCampaign    utm_campaign stored on the user row
 */
export function resolvePostCheckoutDestination(opts: {
  storyParam?: string | null
  resumeStoryId?: string | null
  resumeSeconds?: number | null
  utmCampaign?: string | null
}): PostCheckoutDestination {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (opts.storyParam && uuid.test(opts.storyParam)) {
    return { kind: 'player', storyId: opts.storyParam, source: 'param' }
  }
  if (opts.resumeStoryId && uuid.test(opts.resumeStoryId)) {
    // Carry the stop position. Losing it was phone test #3's failure: the
    // listener was sent to EP1 at 0:00 instead of the spot they left.
    const secs = Number.isFinite(opts.resumeSeconds)
      ? Math.max(0, Math.floor(opts.resumeSeconds as number))
      : 0
    return { kind: 'player', storyId: opts.resumeStoryId, source: 'sample', resumeSeconds: secs }
  }
  const campaign = opts.utmCampaign?.trim().toLowerCase()
  const seriesId = campaign ? UTM_CAMPAIGN_TO_SERIES[campaign] : undefined
  if (seriesId) {
    // DELIBERATE: a series id is NOT a story id. `/player/<series-id>` renders
    // an empty player and plays nothing — which is exactly what happened on
    // Marc's 2026-11-19 phone test. The caller resolves the series' episode 1
    // before navigating; `destinationHref` returns null until it does.
    return { kind: 'series', seriesId, source: 'campaign' }
  }
  // Nothing to go on. Home, not a random episode.
  return { kind: 'home', storyId: null, source: 'none' }
}

/**
 * URL a destination resolves to. Kept separate so it is trivial to test.
 *
 * Returns `null` for a `series` destination: the caller must first resolve the
 * series' episode 1 (`episodeOneHref`). Returning `/player/<series-id>` here is
 * what shipped silently on 2026-11-19 and played nothing.
 */
export function destinationHref(dest: PostCheckoutDestination): string | null {
  if (dest.kind === 'player') {
    // A sampled listener resumes; everyone else starts at 0:00. Both open the
    // player — neither is allowed to leave the listener on /home.
    if (dest.source === 'sample' && Number(dest.resumeSeconds) > 0) {
      return `/player/${dest.storyId}?resume=${Math.floor(dest.resumeSeconds as number)}&autoplay=1&playNow=1`
    }
    return `/player/${dest.storyId}?autoplay=1&playNow=1`
  }
  if (dest.kind === 'series') return null
  return '/home'
}

/** Player href for an episode id. One place, so autoplay semantics cannot drift. */
export function episodeOneHref(storyId: string): string {
  return `/player/${storyId}?autoplay=1`
}
