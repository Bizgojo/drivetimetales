import { PAUSED_BUILD, HOOK_CREATIVES, validatePausedBuildInput } from '../../lib/marketing/pausedBuildNov09'

const goodBody = () => ({
  videoIds: { hook1: '111', hook2: '222', hook3: '333', hook4: '444', hook5: '555' },
  pageId: '999',
  pixelId: '888',
  customConversionId: '777',
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

test(' exactly 5 hook creatives, Hook-6 excluded', () => {
  expect(HOOK_CREATIVES.map((h) => h.hook)).toEqual(['hook1', 'hook2', 'hook3', 'hook4', 'hook5'])
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

test('Hook-6 wiring refused', () => {
  const r = validatePausedBuildInput({ ...goodBody(), videoIds: { ...goodBody().videoIds, hook6: '666' } })
  expect(r.ok).toBe(false)
})

test('fewer than 5 videos refused; non-digit video id refused', () => {
  const b: any = goodBody()
  delete b.videoIds.hook5
  expect(validatePausedBuildInput(b).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), videoIds: { ...goodBody().videoIds, hook1: 'abc' } }).ok).toBe(false)
})

test('PLACEHOLDER gate URL refused', () => {
  expect(validatePausedBuildInput({ ...goodBody(), gateUrl: 'PLACEHOLDER' }).ok).toBe(false)
  expect(validatePausedBuildInput({ ...goodBody(), gateUrl: '' }).ok).toBe(false)
})
