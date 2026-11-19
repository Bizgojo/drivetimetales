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
 */

/** utm_campaign value → series id. Canon utm names come from Marc's ad rules. */
export const UTM_CAMPAIGN_TO_SERIES: Record<string, string> = {
  'weekend-wife-miami': 'd6af80a4-1ac9-48ae-8e7a-1fb71357e4ad',
  'second-rise': 'd1f90c2a-44c2-4b3c-b489-fb10882490bd',
  'widow-who-watched': '78882d57-fd50-4095-99ab-0a577472eb9a',
}

export type PostCheckoutDestination =
  | { kind: 'player'; storyId: string; source: 'param' | 'sample' | 'campaign' }
  | { kind: 'home'; storyId: null; source: 'none' }

/**
 * Decide where to send a listener after checkout.
 *
 * Precedence is intentional: an explicitly passed story beats a remembered
 * sample, which beats a campaign tag. The most specific signal wins.
 *
 * @param opts.storyParam     `?story=<uuid>` on /home (set by the ad landing page)
 * @param opts.resumeStoryId  freshest resumable sample, if any
 * @param opts.utmCampaign    utm_campaign stored on the user row
 */
export function resolvePostCheckoutDestination(opts: {
  storyParam?: string | null
  resumeStoryId?: string | null
  utmCampaign?: string | null
}): PostCheckoutDestination {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (opts.storyParam && uuid.test(opts.storyParam)) {
    return { kind: 'player', storyId: opts.storyParam, source: 'param' }
  }
  if (opts.resumeStoryId && uuid.test(opts.resumeStoryId)) {
    return { kind: 'player', storyId: opts.resumeStoryId, source: 'sample' }
  }
  const campaign = opts.utmCampaign?.trim().toLowerCase()
  if (campaign && UTM_CAMPAIGN_TO_SERIES[campaign]) {
    return { kind: 'player', storyId: UTM_CAMPAIGN_TO_SERIES[campaign], source: 'campaign' }
  }
  // Nothing to go on. Home, not a random episode.
  return { kind: 'home', storyId: null, source: 'none' }
}

/** URL a destination resolves to. Kept separate so it is trivial to test. */
export function destinationHref(dest: PostCheckoutDestination): string {
  return dest.kind === 'player' ? `/player/${dest.storyId}?autoplay=1` : '/home'
}
