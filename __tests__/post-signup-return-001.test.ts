import { sampleResumeHref, resolveGoStory, GO_HOOK_VARIANTS, GO_LIVE_VARIANTS, pickFreshestResumableSample, sampleProgressKey } from '../lib/landing'

describe('POST-SIGNUP-RETURN-001', () => {
  it('sends the new subscriber back to the sampled story at the saved second', () => {
    expect(sampleResumeHref({ catalogStoryId: 'abc', seconds: 93.7 })).toBe('/player/abc?resume=93&autoplay=1&playNow=1')
  })
  it('returns null when there is no sample (caller keeps old default)', () => {
    expect(sampleResumeHref(null)).toBeNull()
    expect(sampleResumeHref({ catalogStoryId: '', seconds: 10 })).toBeNull()
  })
})

describe('HOOK-LANDING-001', () => {
  it('has one landing per hook series, each tied to its catalog EP1', () => {
    expect(Object.keys(GO_HOOK_VARIANTS).sort()).toEqual(['home', 'miami', 'rerouted', 'rise', 'widow'])
    for (const v of Object.values(GO_HOOK_VARIANTS)) {
      expect(v.catalogStoryId).toBeTruthy()
      expect(v.audioUrl).toContain(`/asc3/${v.catalogStoryId}/final_mix.mp3`)
    }
  })
  it('each hook landing serves its own story', () => {
    for (const [key, v] of Object.entries(GO_HOOK_VARIANTS)) {
      expect(GO_LIVE_VARIANTS).toContain(key)
      expect(resolveGoStory(`v=${key}`).title).toBe(v.title)
    }
  })
  it('a hook sample is resumable after signup', () => {
    const v = GO_HOOK_VARIANTS.rerouted
    const store: Record<string, string> = { [sampleProgressKey(v.id)]: JSON.stringify({ storyId: v.id, seconds: 120, updatedAt: 1000 }) }
    const got = pickFreshestResumableSample(k => store[k], 2000)
    expect(got?.catalogStoryId).toBe(v.catalogStoryId)
    expect(got?.seconds).toBe(120)
  })
})
