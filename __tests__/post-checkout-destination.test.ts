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
  episodeOneHref,
  UTM_CAMPAIGN_TO_SERIES,
} from '@/lib/postCheckoutDestination'
import { pickEpisodeOne } from '@/lib/seriesEpisodeOne'

const WEEKEND_EP1 = '9d8f6c00-fbe1-4919-85bd-86a085f45e71'
const SECOND_EP1 = '92587140-6371-4bed-875c-548fdbb9abc7'
const WIDOW_EP1 = '3b4509ba-b4f3-4e21-a5e4-27b589ca307c'

describe('POST-CHECKOUT-DESTINATION-001 — explicit ?story= wins', () => {
  it('sends the listener to the story they came for, episode 1', () => {
    const d = resolvePostCheckoutDestination({ storyParam: WEEKEND_EP1 })
    expect(d).toEqual({ kind: 'player', storyId: WEEKEND_EP1, source: 'param' })
    // POST-CHECKOUT-DESTINATION-004: autoplay alone was not enough — phone test
    // #3 heard Belle and then silence because nothing pressed play. playNow=1
    // is what makes the player actually start.
    expect(destinationHref(d)).toBe(`/player/${WEEKEND_EP1}?autoplay=1&playNow=1`)
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
  ])('maps %s to its SERIES, never directly to a story', (campaign) => {
    // POST-CHECKOUT-DESTINATION-002 (Marc, 2026-11-19): the map holds SERIES
    // ids. Returning them as a story id produced /player/<series-id>, which
    // played nothing — Belle said "back to your story" and then silence.
    const d = resolvePostCheckoutDestination({ utmCampaign: campaign })
    expect(d.kind).toBe('series')
    expect(d.kind === 'series' && d.seriesId).toBe(UTM_CAMPAIGN_TO_SERIES[campaign])
  })

  it('never returns a series id as a story id, and never builds a player href from one', () => {
    for (const campaign of Object.keys(UTM_CAMPAIGN_TO_SERIES)) {
      const d = resolvePostCheckoutDestination({ utmCampaign: campaign })
      expect(d.kind).not.toBe('player')
      // destinationHref must refuse to build a URL the caller has to guess at.
      expect(destinationHref(d)).toBeNull()
    }
  })

  it('is case and whitespace insensitive', () => {
    const a = resolvePostCheckoutDestination({ utmCampaign: '  SECOND-RISE ' })
    const b = resolvePostCheckoutDestination({ utmCampaign: 'second-rise' })
    expect(a.kind).toBe('series')
    expect(a.kind === 'series' && a.seriesId).toBe(b.kind === 'series' && b.seriesId)
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

describe('POST-CHECKOUT-DESTINATION-002 — series → episode 1 resolution', () => {
  it('picks the row with episode_number 1', () => {
    const id = pickEpisodeOne([
      { id: 'ep-3', episode_number: 3 },
      { id: 'ep-1', episode_number: 1 },
      { id: 'ep-2', episode_number: 2 },
    ])
    expect(id).toBe('ep-1')
  })

  it('falls back to the lowest episode_number when nothing is numbered 1', () => {
    expect(pickEpisodeOne([
      { id: 'ep-5', episode_number: 5 },
      { id: 'ep-2', episode_number: 2 },
    ])).toBe('ep-2')
  })

  it('returns a lone row when the series has exactly one episode', () => {
    expect(pickEpisodeOne([{ id: 'only', episode_number: null }])).toBe('only')
  })

  it('returns null when the series has nothing playable — caller goes to /home, not a broken player', () => {
    expect(pickEpisodeOne([])).toBeNull()
    expect(pickEpisodeOne(null)).toBeNull()
    // Two rows with no usable numbering: ambiguous, so refuse to guess.
    expect(pickEpisodeOne([{ id: 'a' }, { id: 'b' }])).toBeNull()
  })

  it('episodeOneHref targets the episode, never the series', () => {
    expect(episodeOneHref(WEEKEND_EP1)).toBe(`/player/${WEEKEND_EP1}?autoplay=1`)
  })

  it('end-to-end: a miami campaign resolves to a series, then to Weekend Wife EP1', () => {
    const dest = resolvePostCheckoutDestination({ utmCampaign: 'weekend-wife-miami' })
    expect(dest.kind).toBe('series')
    // Marc's phone test: the player must be given a STORY id, not a series id.
    const seriesId = dest.kind === 'series' ? dest.seriesId : ''
    expect(seriesId).toBe(UTM_CAMPAIGN_TO_SERIES['weekend-wife-miami'])
    const storyId = pickEpisodeOne([{ id: WEEKEND_EP1, episode_number: 1 }])
    expect(storyId).toBe(WEEKEND_EP1)
  })
})

describe('POST-CHECKOUT-DESTINATION-003 — Belle must not say "back to your story" on an EP1 start', () => {
  // The line is chosen from the resolver's `source`, never from a separate guess,
  // so the words cannot disagree with the audio that follows.
  function welcomeVariantFor(opts: { storyParam?: string | null; sample?: string | null; campaign?: string | null }) {
    const d = resolvePostCheckoutDestination({
      storyParam: opts.storyParam ?? null,
      resumeStoryId: opts.sample ?? null,
      utmCampaign: opts.campaign ?? null,
    })
    if (d.source === 'sample') return 'story'
    if (d.source === 'param' || d.source === 'campaign') return 'episode'
    return null
  }

  it('an ad campaign start gets the episode line, not the resume line', () => {
    expect(welcomeVariantFor({ campaign: 'weekend-wife-miami' })).toBe('episode')
  })

  it('an explicit ?story= start gets the episode line', () => {
    expect(welcomeVariantFor({ storyParam: WEEKEND_EP1 })).toBe('episode')
  })

  it('a genuine sample resume keeps the resume line', () => {
    expect(welcomeVariantFor({ sample: WEEKEND_EP1 })).toBe('story')
  })

  it('no story info gets the legacy line', () => {
    expect(welcomeVariantFor({})).toBeNull()
  })

  it('an EP1 start is never classified as a resume, even in the same tab as a sample', () => {
    // Marc's phone test: a sample was played, then an ad campaign signup. With no
    // resumable position written, this is an EP1 start — the resume line is wrong.
    expect(welcomeVariantFor({ sample: null, campaign: 'weekend-wife-miami' })).toBe('episode')
  })
})

describe('POST-CHECKOUT-DESTINATION-004 — a sampled listener resumes, never lands on Home', () => {
  const SAMPLE_ID = WEEKEND_EP1
  const SECONDS = 63

  it('sample → player on that story with the stop position', () => {
    const d = resolvePostCheckoutDestination({ resumeStoryId: SAMPLE_ID, resumeSeconds: SECONDS })
    expect(d.kind).toBe('player')
    expect(d.source).toBe('sample')
    expect(d.storyId).toBe(SAMPLE_ID)
    expect(d.kind === 'player' && d.resumeSeconds).toBe(SECONDS)
  })

  it('builds a resume href carrying the position', () => {
    const d = resolvePostCheckoutDestination({ resumeStoryId: SAMPLE_ID, resumeSeconds: SECONDS })
    const href = destinationHref(d)
    expect(href).toBe(`/player/${SAMPLE_ID}?resume=${SECONDS}&autoplay=1&playNow=1`)
  })

  it('sample with no readable position starts at 0:00 and still opens the player', () => {
    for (const secs of [0, null, undefined, NaN]) {
      const d = resolvePostCheckoutDestination({ resumeStoryId: SAMPLE_ID, resumeSeconds: secs as any })
      expect(d.kind).toBe('player')
      const href = destinationHref(d)
      expect(href).toContain(`/player/${SAMPLE_ID}`)
      expect(href).not.toContain('resume=')
    }
  })

  it('a sample outranks the campaign tag — the listener resumes, not restarts the ad story', () => {
    const d = resolvePostCheckoutDestination({
      resumeStoryId: SAMPLE_ID,
      resumeSeconds: SECONDS,
      utmCampaign: 'weekend-wife-miami',
    })
    expect(d.source).toBe('sample')
    expect(destinationHref(d)).toContain('resume=63')
  })

  it('the exact phone-test #3 shape never yields /home', () => {
    // Sample played in the /go landing player, same tab, then signup.
    const d = resolvePostCheckoutDestination({
      resumeStoryId: SAMPLE_ID,
      resumeSeconds: 60,
      utmCampaign: 'weekend-wife-miami',
    })
    expect(destinationHref(d)).not.toBe('/home')
    expect(destinationHref(d)).toContain('/player/')
  })

  it('floors fractional positions so the query stays integral', () => {
    const d = resolvePostCheckoutDestination({ resumeStoryId: SAMPLE_ID, resumeSeconds: 62.87 })
    expect(destinationHref(d)).toContain('resume=62&')
  })
})

describe('POST-CHECKOUT-DESTINATION-005 — the ReferenceError-class fence', () => {
  // The 2026-11-19 regression was NOT a logic error in the resolver: the
  // resolver was never reached. `storyParam` was declared inside a useEffect
  // and read inside onDismiss, so every dismissal threw before router.push.
  // Pure-function tests cannot catch that, and this repo has no React test
  // harness (jest testEnvironment: 'node'). So the fence is structural: the
  // handler must read its inputs from state/URL, never from an effect-local.
  const fs = require('fs')
  const path = require('path')
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'home', 'page.tsx'),
    'utf8'
  )

  it('storyParam is declared at component scope, not inside an effect', () => {
    const decl = SRC.match(/^\s*const storyParam = searchParams\.get\('story'\)/m)
    expect(decl).not.toBeNull()
    // component-scope declarations in this file use exactly two spaces
    const line = SRC.split('\n').find((l) => l.includes("const storyParam = searchParams.get('story')"))!
    expect(line.startsWith('  const storyParam')).toBe(true)
  })

  it('onDismiss reads only identifiers that exist outside the effect', () => {
    const start = SRC.indexOf('onDismiss={() => {')
    expect(start).toBeGreaterThan(-1)
    const end = SRC.indexOf('}', SRC.indexOf('welcome_dismissed', start))
    const body = SRC.slice(start, end)
    // every name the handler destructures off its own scope must be declared
    // at component scope above the JSX
    // Locals must be component-scope consts or state destructures.
    // `supabase` is a module import (line 9) — checked separately below.
    for (const name of ['storyParam', 'dbCampaign', 'router']) {
      expect(body).toContain(name)
      const declared = new RegExp(
        `^  const (?:${name}\\b|\\[[^\\]]*\\b${name}\\b[^\\]]*\\])`,
        'm'
      )
      expect(SRC).toMatch(declared)
    }
    expect(SRC).toMatch(/^import \{ supabase \} from '@\/lib\/supabase'$/m)
  })

  it('the welcome card waits for both the campaign answer and the clip', () => {
    expect(SRC).toMatch(/if \(!campaignLoaded \|\| !seg1Url\) return/)
    expect(SRC).toMatch(/if \(startedRef\.current\) return/)
  })
})
