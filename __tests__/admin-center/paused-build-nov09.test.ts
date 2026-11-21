import {
  PAUSED_BUILD,
  HOOK_CREATIVES,
  validatePausedBuildInput,
  buildPromotedObject,
  buildAdSetTargeting,
} from '../../lib/marketing/pausedBuildNov09'

const goodThumbs = () => ({
  hook1: { image_hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' },
  hook2: { image_url: 'https://cdn.example.com/thumb2.jpg' },
  hook3: { image_hash: 'b1b2c3d4e5f60718293a4b5c6d7e8f901' },
  hook4: { image_url: 'https://cdn.example.com/thumb4.jpg' },
  hook5: { image_hash: 'c1b2c3d4e5f60718293a4b5c6d7e8f902' },
  hook6: { image_url: 'https://cdn.example.com/thumb6.jpg' },
})

const goodBody = () => ({
  videoIds: { hook1: '111', hook2: '222', hook3: '333', hook4: '444', hook5: '555', hook6: '666' },
  thumbnails: goodThumbs(),
  pageId: '999',
  pixelId: '888',
  gateUrl: 'https://www.drivetimetales.com/listen',
  confirmPaused: true,
})

test('budgets mirror the approval card ($4k ceiling, tranche-1 $1k-1.5k, $50/day)', () => {
  expect(PAUSED_BUILD.totalCeilingCents).toBe(400000)
  expect(PAUSED_BUILD.tranche1MinCents).toBe(100000)
  expect(PAUSED_BUILD.tranche1MaxCents).toBe(150000)
  expect(PAUSED_BUILD.dailyBudgetCents).toBe(5000)
  expect(PAUSED_BUILD.status).toBe('PAUSED')
})

test(' exactly 6 hook creatives, hook6 romance slot included', () => {
  expect(HOOK_CREATIVES.map((h) => h.hook)).toEqual(['hook1', 'hook2', 'hook3', 'hook4', 'hook5', 'hook6'])
  const h6 = HOOK_CREATIVES.find((h) => h.hook === 'hook6')!
  expect(h6.adName).toMatch(/Hook6.*_PAUSED$/)
  expect(h6.utm).toContain('hook6')
})

test('valid body passes', () => {
  const r = validatePausedBuildInput(goodBody())
  expect(r.ok).toBe(true)
})

test('missing confirmPaused is refused', () => {
  const b: any = goodBody()
  delete b.confirmPaused
  const r = validatePausedBuildInput(b)
  expect(r.ok).toBe(false)
})

test('caller-supplied budget/status/schedule/objective refused', () => {
  for (const k of ['daily_budget', 'budget', 'status', 'start_time', 'end_time', 'schedule', 'objective']) {
    const r = validatePausedBuildInput({ ...goodBody(), [k]: 'x' })
    expect(r.ok).toBe(false)
  }
})

test('hook6 accepted paused-only; refused if not paused', () => {
  // Full 6-hook body passes (hook6 wired, PAUSED-only).
  expect(validatePausedBuildInput(goodBody()).ok).toBe(true)
  // Missing hook6 video refused.
  const b: any = goodBody()
  delete b.videoIds.hook6
  expect(validatePausedBuildInput(b).ok).toBe(false)
  // Missing hook6 thumbnail refused.
  const t: any = goodBody()
  delete t.thumbnails.hook6
  expect(validatePausedBuildInput(t).ok).toBe(false)
  // Non-paused confirmation refused even with hook6 present.
  expect(validatePausedBuildInput({ ...goodBody(), confirmPaused: false }).ok).toBe(false)
  // Unknown 7th hook still refused.
  const r = validatePausedBuildInput({ ...goodBody(), videoIds: { ...goodBody().videoIds, hook7: '777' } })
  expect(r.ok).toBe(false)
})

test('fewer than 6 videos refused; non-digit video id refused', () => {
  const b: any = goodBody()
  delete b.videoIds.hook5
  expect(validatePausedBuildInput(b).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), videoIds: { ...goodBody().videoIds, hook1: 'abc' } }).ok).toBe(false)
})

test('PLACEHOLDER gate URL refused', () => {
  expect(validatePausedBuildInput({ ...goodBody(), gateUrl: 'PLACEHOLDER' }).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), gateUrl: '' }).ok).toBe(false)
})

test('customConversionId is refused (dropped per review — pixel START_TRIAL only)', () => {
  expect(validatePausedBuildInput({ ...goodBody(), customConversionId: '777' }).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), custom_conversion_id: '777' }).ok).toBe(false)
})

test('promoted_object is pixel + START_TRIAL, no customConversionId', () => {
  expect(buildPromotedObject('888')).toEqual({ pixel_id: '888', custom_event_type: 'START_TRIAL' })
  expect(PAUSED_BUILD.customEventType).toBe('START_TRIAL')
})

test('campaign spend_cap mirrors the $4k ceiling', () => {
  expect(PAUSED_BUILD.spendCapCents).toBe(400000)
})

test('targeting is Adv+ audience + Adv+ placements (no fixed lists), US 25-54 suggestions', () => {
  const t: any = buildAdSetTargeting()
  expect(t.targeting_automation).toEqual({ advantage_audience: 1 })
  expect(t.geo_locations).toEqual({ countries: ['US'] })
  expect(t.age_min).toBe(25)
  expect(t.age_max).toBe(54)
  expect(t.facebook_positions).toBeUndefined()
  expect(t.instagram_positions).toBeUndefined()
  expect(t.publisher_platforms).toBeUndefined()
})

test('thumbnails required: missing hook / both-set / neither-set refused', () => {
  const b: any = goodBody()
  delete b.thumbnails.hook5
  expect(validatePausedBuildInput(b).ok).toBe(false)
  expect(
    validatePausedBuildInput({ ...goodBody(), thumbnails: { ...goodThumbs(), hook1: {} } }).ok
  ).toBe(false)
  expect(
    validatePausedBuildInput({
      ...goodBody(),
      thumbnails: {
        ...goodThumbs(),
        hook1: { image_hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', image_url: 'https://cdn.example.com/x.jpg' },
      },
    }).ok
  ).toBe(false)
  expect(
    validatePausedBuildInput({
      ...goodBody(),
      thumbnails: { ...goodThumbs(), hook1: { image_hash: 'not-a-hash!' } },
    }).ok
  ).toBe(false)
})

test('resume IDs accepted when digits-only, refused otherwise', () => {
  const r: any = validatePausedBuildInput({ ...goodBody(), campaignId: '123', adSetId: '456' })
  expect(r.ok).toBe(true)
  expect(r.input.campaignId).toBe('123')
  expect(r.input.adSetId).toBe('456')
  expect(validatePausedBuildInput({ ...goodBody(), campaignId: 'abc' }).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), adSetId: '12x' }).ok).toBe(false)
})
