// __tests__/amendment1-version-hash.test.ts — Amendment 1 Sec 4 (version lock).
import { computeVersionHash, allChecksPass, shortHash } from '@/lib/marketing/amendment1'

const base = {
  metaAdIds: ['act_ad1'],
  creativeIds: ['cr1'],
  videoAssetHash: 'vid1',
  headline: 'Head',
  primaryText: 'Body',
  ctaType: 'LEARN_MORE',
  destinationUrl: 'https://endless-tales.com/go/x?utm_source=meta',
  claims: ['claim-a'],
  budgetCeiling: '500',
}

describe('computeVersionHash', () => {
  it('is deterministic for identical input', async () => {
    expect(await computeVersionHash(base)).toBe(await computeVersionHash(base))
  })
  it('changes when headline changes (Sec 4.3 → re-approval)', async () => {
    const a = await computeVersionHash(base)
    const b = await computeVersionHash({ ...base, headline: 'Head v2' })
    expect(a).not.toBe(b)
  })
  it('changes when destination URL changes', async () => {
    const a = await computeVersionHash(base)
    const b = await computeVersionHash({ ...base, destinationUrl: 'https://endless-tales.com/go/y' })
    expect(a).not.toBe(b)
  })
  it('is order-insensitive for id arrays', async () => {
    const a = await computeVersionHash({ ...base, metaAdIds: ['a', 'b'] })
    const b = await computeVersionHash({ ...base, metaAdIds: ['b', 'a'] })
    expect(a).toBe(b)
  })
  it('shortHash is a 10-char prefix', async () => {
    const h = await computeVersionHash(base)
    expect(shortHash(h)).toBe(h.slice(0, 10))
  })
})

describe('allChecksPass', () => {
  const passing = {
    video_audio: 'pass', destination_url: 'pass', signup: 'pass',
    checkout: 'pass', tracking: 'pass', mobile: 'pass',
  } as const
  it('requires all six', () => {
    expect(allChecksPass({ ...passing })).toBe(true)
    expect(allChecksPass({ ...passing, mobile: 'not_tested' })).toBe(false)
    expect(allChecksPass({ ...passing, destination_url: 'fail' })).toBe(false)
  })
})
