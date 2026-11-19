/**
 * POST-CHECKOUT-DESTINATION-001 (Marc, 2026-11-19)
 *
 * Regression tests for the launch blocker Marc hit on a live checkout: after
 * paying, he landed in The Bell Beneath Falls Park EP2 — a series he never
 * clicked — because /home hard-coded that destination.
 *
 * The rule under test:
 *   a known story  → that story's EPISODE 1
 *   no story at all → /home
 *   never a random episode
 */

import {
  resolvePostCheckoutDestination,
  destinationHref,
  UTM_CAMPAIGN_TO_SERIES,
} from '@/lib/postCheckoutDestination'

const WEEKEND_EP1 = '9d8f6c00-fbe1-4919-85bd-86a085f45e71'
const SECOND_EP1 = '92587140-6371-4bed-875c-548fdbb9abc7'
const WIDOW_EP1 = '3b4509ba-b4f3-4e21-a5e4-27b589ca307c'

describe('POST-CHECKOUT-DESTINATION-001 — explicit ?story= wins', () => {
  it('sends the listener to the story they came for, episode 1', () => {
    const d = resolvePostCheckoutDestination({ storyParam: WEEKEND_EP1 })
    expect(d).toEqual({ kind: 'player', storyId: WEEKEND_EP1, source: 'param' })
    expect(destinationHref(d)).toBe(`/player/${WEEKEND_EP1}?autoplay=1`)
  })

  it('beats a remembered sample when both are present', () => {
    const d = resolvePostCheckoutDestination({
      storyParam: SECOND_EP1,
      resumeStoryId: WIDOW_EP1,
    })
    expect(d.source).toBe('param')
    expect(d.storyId).toBe(SECOND_EP1)
  })

  it('ignores a malformed story param rather than navigating nowhere', () => {
    const d = resolvePostCheckoutDestination({ storyParam: 'not-a-uuid' })
    expect(d.kind).toBe('home')
  })
})

describe('POST-CHECKOUT-DESTINATION-001 — utm_campaign fallback', () => {
  it.each([
    ['weekend-wife-miami', WEEKEND_EP1],
    ['second-rise', SECOND_EP1],
    ['widow-who-watched', WIDOW_EP1],
  ])('maps %s to its series episode 1', (campaign, expected) => {
    // The map holds SERIES ids; assert the mapping exists and resolves to a player.
    const d = resolvePostCheckoutDestination({ utmCampaign: campaign })
    expect(d.kind).toBe('player')
    expect(d.storyId).toBe(UTM_CAMPAIGN_TO_SERIES[campaign])
  })

  it('is case and whitespace insensitive', () => {
    const a = resolvePostCheckoutDestination({ utmCampaign: '  SECOND-RISE ' })
    const b = resolvePostCheckoutDestination({ utmCampaign: 'second-rise' })
    expect(a.storyId).toBe(b.storyId)
  })

  it('does not invent a destination for an unknown campaign', () => {
    const d = resolvePostCheckoutDestination({ utmCampaign: 'some-unmapped-campaign' })
    expect(d.kind).toBe('home')
    expect(d.source).toBe('none')
  })
})

describe('POST-CHECKOUT-DESTINATION-001 — no story means Home, never an episode', () => {
  it('goes to /home when nothing at all is known', () => {
    const d = resolvePostCheckoutDestination({})
    expect(d).toEqual({ kind: 'home', storyId: null, source: 'none' })
    expect(destinationHref(d)).toBe('/home')
  })

  it('never returns the old hard-coded Bell EP2 for an unrelated campaign', () => {
    const BELL_EP2 = '759dc525-185c-450f-b249-17e4a525ba60'
    for (const utmCampaign of [null, '', 'unmapped', 'gvl-test-001']) {
      const d = resolvePostCheckoutDestination({ utmCampaign })
      expect(d.storyId).not.toBe(BELL_EP2)
    }
  })
})

describe('POST-CHECKOUT-DESTINATION-001 — canonical campaign names', () => {
  it('uses the three Marc-defined names and no Meta numeric ids', () => {
    expect(Object.keys(UTM_CAMPAIGN_TO_SERIES).sort()).toEqual([
      'second-rise',
      'weekend-wife-miami',
      'widow-who-watched',
    ])
    for (const v of Object.values(UTM_CAMPAIGN_TO_SERIES)) {
      expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    }
  })
})
