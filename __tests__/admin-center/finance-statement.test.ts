import { buildStatement, pipelineSnapshot, classify, windowsFor, monthlyWindows, CLAUDE_PIPELINE_ITEM, CLAUDE_REST_ITEM, AVAILABLE_ITEM, ANNUAL_ITEM, MONTHLY_ITEM, REFUND_ITEM, INTEREST_ITEM, CASHBACK_ITEM, OTHER_ITEM, STRIPE_FEE_ITEM, PAYOUT_MEMO, type StripeTxn, type Rule, type Txn } from '@/lib/finance/statement'
import { lastFour, toRow } from '@/lib/finance/mercury-sync'

const rule = (id: number, priority: number, cp: string, section: any, item: string, accrual = 1): Rule =>
  ({ id, priority, match_counterparty: cp, match_description: null, match_card: null, section, item, ai_service: null, purpose: null, accrual_months: accrual, active: true })
const RULES: Rule[] = [
  rule(1, 1, 'Mercury Credit', 'Excluded', 'Card payments (internal)'),
  rule(2, 2, 'SouthState Bank%', 'Excluded', 'Owner capital'),
  rule(3, 5, 'Stripe', 'Revenue', 'Subscriptions (Stripe payouts)'),
  rule(4, 10, 'Facebook', 'Ad Spend', 'Meta ads'),
  rule(5, 20, 'Anthropic', 'Production Exp', CLAUDE_PIPELINE_ITEM),
  rule(6, 25, 'Sound Ideas%', 'Production Exp', 'Sound effects library', 12),
  rule(7, 6, 'Mercury IO Cashback', 'Revenue', 'Card cashback rewards'),
  rule(8, 7, '%Interest%', 'Revenue', 'Interest income (Mercury)'),
]
const tx = (id: string, at: string, amount: number, cp: string, kind = 'creditCardTransaction'): Txn =>
  ({ id, posted_at: at, amount, status: 'sent', kind, counterparty: cp, bank_description: null, card: null, note: null })
const NOW = new Date('2026-11-08T12:00:00Z')
const base = { rules: RULES, overrides: [], users: [], stories: [], campaigns: [], now: NOW }

describe('FINANCE-STATEMENT-001', () => {
  test('classify uses priority, % wildcards and case-insensitive match; unknown spend is Uncategorized', () => {
    expect(classify(tx('a', '2026-10-01T00:00:00Z', 10, 'STRIPE', 'other'), RULES, new Map()).section).toBe('Revenue')
    expect(classify(tx('b', '2026-10-01T00:00:00Z', 5000, 'SouthState Bank - Checking ••7042', 'externalTransfer'), RULES, new Map()).section).toBe('Excluded')
    expect(classify(tx('c', '2026-10-01T00:00:00Z', -9, 'Mystery Vendor'), RULES, new Map())).toMatchObject({ section: 'Uncategorized', item: 'Mystery Vendor' })
  })

  test('cash expenses equal card spend; owner capital and card payments are excluded', () => {
    const txns = [tx('1', '2026-10-03T00:00:00Z', -100, 'Anthropic'), tx('2', '2026-10-04T00:00:00Z', -50, 'Facebook'),
      tx('3', '2026-10-05T00:00:00Z', 5000, 'SouthState Bank x', 'externalTransfer'), tx('4', '2026-10-06T00:00:00Z', -150, 'Mercury Credit', 'other')]
    const st = buildStatement({ ...base, basis: 'cash', windows: windowsFor('monthly', NOW), txns })
    const oct = st.columns.indexOf('Oct 2026')
    expect(st.totals.expenses[oct]).toBeCloseTo(150)
    expect(st.totals.revenue[oct]).toBeCloseTo(0)
  })

  test('accrual spreads a 12-month purchase; cash books it on the day', () => {
    const txns = [tx('s', '2026-11-06T08:00:00Z', -1500, 'Sound Ideas')]
    const w = [{ label: 'Nov', start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-12-01T00:00:00Z') }]
    expect(buildStatement({ ...base, basis: 'cash', windows: w, txns }).totals.expenses[0]).toBeCloseTo(1500)
    expect(buildStatement({ ...base, basis: 'accrual', windows: w, txns }).totals.expenses[0]).toBeCloseTo(1500 * (24 + 16 / 24) / 365, 0) // spread from the purchase day, not the 1st
  })

  const realUser = (id: string, paid: string, test = false) => ({ id, is_test_account: test, trial_started_at: null, first_paid_date: paid, cancelled_at: null, billing_cycle: 'monthly', utm_campaign: null })
  const SEP_OCT = monthlyWindows(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-31T23:00:00Z'))

  const sx = (id: string, at: string, cat: string, amount: number, fee: number, interval: string | null = null): StripeTxn =>
    ({ id, created_at: at, type: cat, reporting_category: cat, amount, fee, net: amount - fee, description: null, interval, customer_email: 'm+test@x.com' })

  test('revenue comes from the Stripe ledger: charges by plan, refunds negative, fees are an expense, payouts are transfers', () => {
    const stripe = [sx('a', '2026-09-03T00:00:00Z', 'charge', 79.99, 2.62, 'year'), sx('m', '2026-09-05T00:00:00Z', 'charge', 9.99, 0.59, 'month'),
      sx('r', '2026-09-08T00:00:00Z', 'refund', -9.99, 0), sx('p', '2026-09-10T00:00:00Z', 'payout', -77.38, 0)]
    const txns = [tx('po', '2026-09-10T00:00:00Z', 77.38, 'Stripe', 'other')]
    const st = buildStatement({ ...base, stripe, txns, basis: 'cash', windows: SEP_OCT })
    expect(st.revenue[ANNUAL_ITEM][0]).toBeCloseTo(79.99)
    expect(st.revenue[MONTHLY_ITEM][0]).toBeCloseTo(9.99)
    expect(st.revenue[REFUND_ITEM][0]).toBeCloseTo(-9.99)
    expect(st.totals.revenue[0]).toBeCloseTo(79.99) // net: payout not counted again
    expect(st.items.find(i => i.item === STRIPE_FEE_ITEM)!.values[0]).toBeCloseTo(3.21)
    expect(st.memo[PAYOUT_MEMO][0]).toBeCloseTo(77.38)
    expect(st.revenue['Subscriptions (Stripe payouts)']).toBeUndefined()
  })

  test('payout reversals and top-ups are not revenue; a Mercury STRIPE deposit with no rule is still a transfer', () => {
    const stripe = [sx('pr', '2026-09-03T00:00:00Z', 'payout_reversal', 50, 0), sx('tu', '2026-09-04T00:00:00Z', 'topup', 100, 0)]
    const st = buildStatement({ ...base, rules: RULES.filter(r => r.match_counterparty !== 'Stripe'), stripe, basis: 'cash', windows: SEP_OCT, txns: [tx('po', '2026-09-10T00:00:00Z', 30, 'STRIPE TRANSFER', 'other')] })
    expect(st.totals.revenue[0]).toBeCloseTo(0)
    expect(st.memo[PAYOUT_MEMO][0]).toBeCloseTo(30)
  })

  test('an annual refund on accrual is spread like its charge', () => {
    const stripe = [sx('a', '2026-09-01T00:00:00Z', 'charge', 120, 0, 'year'), sx('r', '2026-09-01T00:00:00Z', 'refund', -120, 0, 'year')]
    const st = buildStatement({ ...base, stripe, txns: [], basis: 'accrual', windows: SEP_OCT })
    expect(st.totals.revenue[0]).toBeCloseTo(0)
    expect(st.totals.revenue[1]).toBeCloseTo(0)
  })

  test('accrual spreads an annual charge over 12 months and a monthly one over its month', () => {
    const stripe = [sx('a', '2026-09-01T00:00:00Z', 'charge', 120, 0, 'year'), sx('m', '2026-09-16T00:00:00Z', 'charge', 10, 0, 'month')]
    const st = buildStatement({ ...base, stripe, txns: [], basis: 'accrual', windows: SEP_OCT })
    expect(st.revenue[ANNUAL_ITEM][0]).toBeCloseTo(120 * 30 / 365, 1)
    expect(st.revenue[MONTHLY_ITEM][0]).toBeCloseTo(5, 0)
    expect(st.revenue[MONTHLY_ITEM][1]).toBeCloseTo(5, 0)
  })

  test("plow back: 75% of last month's PROFIT shows next month as available for ads, not revenue", () => {
    const stripe = [sx('m', '2026-09-10T00:00:00Z', 'charge', 100, 0, 'month')]
    const txns = [tx('e', '2026-09-11T00:00:00Z', -20, 'Anthropic')]
    const st = buildStatement({ ...base, stripe, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.totals.result[0]).toBeCloseTo(80)
    expect(st.totals.plowBack[0]).toBeCloseTo(60)
    expect(st.totals.retained[0]).toBeCloseTo(20)
    expect(st.memo[AVAILABLE_ITEM][0]).toBeCloseTo(0)
    expect(st.memo[AVAILABLE_ITEM][1]).toBeCloseTo(60, 0)
    expect(st.totals.revenue[1]).toBeCloseTo(0)
  })

  test('current month shows the full plow back from day one (no proration)', () => {
    const stripe = [sx('m', '2026-10-10T00:00:00Z', 'charge', 100, 0, 'month')]
    const st = buildStatement({ ...base, stripe, txns: [], basis: 'cash', windows: windowsFor('monthly', NOW) })
    expect(st.memo[AVAILABLE_ITEM][st.columns.indexOf('Nov 2026')]).toBeCloseTo(75)
    expect(buildStatement({ ...base, stripe, txns: [], basis: 'cash', windows: windowsFor('d1', NOW) }).memo[AVAILABLE_ITEM][0]).toBeCloseTo(75)
  })

  test('a loss month plows back nothing', () => {
    const stripe = [sx('m', '2026-09-10T00:00:00Z', 'charge', 100, 0, 'month')]
    const st = buildStatement({ ...base, stripe, basis: 'cash', windows: SEP_OCT, txns: [tx('e', '2026-09-11T00:00:00Z', -500, 'Anthropic')] })
    expect(st.totals.plowBack[0]).toBe(0)
    expect(st.totals.retained[0]).toBe(0)
    expect(st.memo[AVAILABLE_ITEM][1]).toBe(0)
  })

  test('cashback has its own line, interest is Mercury interest only, unmatched money in lands in Other', () => {
    const txns = [tx('c', '2026-09-10T00:00:00Z', 3.5, 'Mercury IO Cashback', 'other'), tx('i', '2026-09-11T00:00:00Z', 1.25, 'Mercury Interest', 'other'),
      tx('x', '2026-09-12T00:00:00Z', 40, 'Unknown Co', 'externalTransfer'), tx('o', '2026-09-13T00:00:00Z', 5000, 'SouthState Bank x', 'externalTransfer')]
    const st = buildStatement({ ...base, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.revenue[CASHBACK_ITEM][0]).toBeCloseTo(3.5)
    expect(st.revenue[INTEREST_ITEM][0]).toBeCloseTo(1.25)
    expect(st.revenue[OTHER_ITEM][0]).toBeCloseTo(40)
    expect(st.totals.revenue[0]).toBeCloseTo(44.75) // owner capital excluded
    expect(st.uncategorizedCount).toBe(1)
  })

  test('a story counts as published only when every episode is live; partial series are flagged; pipeline groups by stage', () => {
    const stories = [
      { id: 'a1', series_id: 'A', published_on: '2026-10-02', series_title: 'Complete' },
      { id: 'b1', series_id: 'B', published_on: '2026-10-02', series_title: 'Hook' },
    ]
    const pipeline = [
      { id: 'a1', series_id: 'A', status: 'published', is_hidden: false, series_title: 'Complete', series_total: 1 },
      { id: 'b1', series_id: 'B', status: 'published', is_hidden: false, series_title: 'Hook', series_total: 7 },
      { id: 'b2', series_id: 'B', status: 'audio_ready', is_hidden: true, series_title: 'Hook', series_total: 7 },
      { id: 'c1', series_id: 'C', status: 'brief_complete', is_hidden: true, series_title: 'New', series_total: 3 },
      { id: 'd1', series_id: 'D', status: 'cold_storage', is_hidden: true, series_title: 'Old', series_total: 1 },
    ]
    const st = buildStatement({ ...base, stories, pipeline, basis: 'cash', windows: SEP_OCT, txns: [] })
    expect(st.vp['Stories published'][1]).toBe(1)
    expect(st.vp['Partly published (rule break)'][1]).toBe(1)
    expect(st.vpDetail.stories[1].find(x => x.title === 'Hook')!.complete).toBe(false)
    const snap = pipelineSnapshot(pipeline)
    expect(snap.coldStorage).toBe(1)
    expect(snap.stages.map(x => x.stage)).toEqual(['Idea & brief', 'Voiced, not released'])
    expect(snap.stages[1].series[0]).toEqual({ title: 'Hook', episodes: 1, live: 1, total: 7 })
  })

  test('cost per episode uses episodes FINISHED (published or not); voice cost per story; yearly purchases spread', () => {
    const stories = [
      { id: 'e1', series_id: 's1', published_on: '2026-10-02', title: 'Ep 1', series_title: 'Rerouted' },
      { id: 'e3', series_id: null, published_on: '2026-10-12', title: 'The Bell', series_title: null },
    ]
    const pipeline = [
      { id: 'e1', series_id: 's1', status: 'published', is_hidden: false, series_title: 'Rerouted', series_total: 2, has_audio: true, finished_at: '2026-10-01T00:00:00Z' },
      { id: 'e2', series_id: 's1', status: 'audio_ready', is_hidden: true, series_title: 'Rerouted', series_total: 2, has_audio: true, finished_at: '2026-10-08T00:00:00Z' },
      { id: 'e3', series_id: null, status: 'published', is_hidden: false, title: 'The Bell', series_total: null, has_audio: true, finished_at: '2026-10-10T00:00:00Z' },
      { id: 'e4', series_id: 's9', status: 'brief_complete', is_hidden: true, series_title: 'Idea', series_total: 3, has_audio: false, finished_at: '2026-10-10T00:00:00Z' },
    ]
    const txns = [tx('a', '2026-10-03T00:00:00Z', -90, 'Anthropic'), tx('s', '2026-10-01T00:00:00Z', -365, 'Sound Ideas')]
    const elDaily = [{ day: '2026-10-05', credits: 100000 }]
    const elPlans = [{ captured_on: '2026-09-01', tier: 'pro', credit_limit: 500000, monthly_price_usd: 99 }]
    const storyChars = { e1: 10000, e2: 10000, e3: 20000 }
    const st = buildStatement({ ...base, stories, pipeline, basis: 'cash', windows: SEP_OCT, txns, elDaily, elPlans, storyChars })
    expect(st.vp['Episodes published'][1]).toBe(2)
    expect(st.vp['Episodes finished (voiced)'][1]).toBe(3) // includes the hidden, finished EP2
    expect(st.vpDetail.finished[1]).toEqual([
      { title: 'Rerouted', episodes: 2, live: 1, voiceCost: expect.closeTo(9.9, 2) },
      { title: 'The Bell', episodes: 1, live: 1, voiceCost: expect.closeTo(9.9, 2) },
    ])
    const c = st.vpDetail.costPerEpisode[1]
    expect(c.find(x => x.item === 'Voices (ElevenLabs)')!.total).toBeCloseTo(19.8)
    expect(c.find(x => x.item === 'Sound effects library')!.total).toBeCloseTo(31, 0) // 31 of 365 days, not the whole $365
    expect(st.items.find(i => i.item === 'Sound effects library')!.values[1]).toBeCloseTo(365) // cash statement still shows the payment
    expect(st.vp['Production cost per finished episode'][1]).toBeCloseTo((90 + 31 + 19.8) / 3, 0)
    expect(st.vp['Stories published'][1]).toBe(1) // The Bell; Rerouted is partly published
    expect(st.vp['Partly published (rule break)'][1]).toBe(1)
  })

  test('Mercury reconciliation: every dollar accounted for, statement matches Mercury to the cent, Stripe in transit shown', () => {
    const txns = [
      tx('a', '2026-09-03T00:00:00Z', -100, 'Anthropic'), tx('f', '2026-09-04T00:00:00Z', -50, 'Facebook'), tx('v', '2026-09-05T00:00:00Z', 0.02, 'Sound Ideas'),
      tx('o', '2026-09-06T00:00:00Z', 5000, 'SouthState Bank x', 'externalTransfer'), tx('p', '2026-09-07T00:00:00Z', -150, 'Mercury Credit', 'other'),
      tx('c', '2026-09-08T00:00:00Z', 2.25, 'Mercury IO Cashback', 'other'), tx('s', '2026-09-20T00:00:00Z', 9.40, 'Stripe', 'other'),
      tx('u', '2026-09-21T00:00:00Z', -12, 'Mystery Vendor'),
    ]
    const stripe = [sx('ch', '2026-09-10T00:00:00Z', 'charge', 9.99, 0.59, 'month'), sx('po', '2026-09-30T00:00:00Z', 'payout', -9.40, 0)]
    const st = buildStatement({ ...base, stripe, txns, basis: 'cash', windows: SEP_OCT })
    expect(st.recon.check[0]).toBe(0)
    expect(st.recon.mercury['Unexplained'][0]).toBeCloseTo(0)
    expect(st.recon.mercury['Expenses paid from Mercury'][0]).toBeCloseTo(-162)
    expect(st.recon.mercury['Owner money in (capital)'][0]).toBeCloseTo(5000)
    expect(st.recon.mercury['Net change across Mercury accounts'][0]).toBeCloseTo(-100 - 50 + 0.02 + 5000 - 150 + 2.25 + 9.40 - 12)
    expect(st.recon.stripe['Stripe: charges − refunds − fees'][0]).toBeCloseTo(9.40)
    expect(st.recon.stripe['Stripe: in transit (paid out, not yet in Mercury)'][0]).toBeCloseTo(0)
    expect(buildStatement({ ...base, stripe, txns, basis: 'accrual', windows: SEP_OCT }).recon.check[0]).toBeNull()
  })

  test('LTV is blank without real CAC and churn; measured once both exist', () => {
    const txns = [tx('f', '2026-10-05T00:00:00Z', -100, 'Facebook')]
    const none = buildStatement({ ...base, basis: 'cash', windows: SEP_OCT, txns })
    expect(none.vp['LTV (measured)']).toEqual([null, null])
    expect(none.vp['Net LTV-CAC $']).toEqual([null, null])
    const u = (id: string, paid: string, cancelled: string | null, test = false) => ({ id, is_test_account: test, trial_started_at: null, first_paid_date: paid, cancelled_at: cancelled, billing_cycle: 'monthly', utm_campaign: null })
    const users = [
      ...Array.from({ length: 9 }, (_, k) => u('r' + k, '2026-08-01T00:00:00Z', null)),
      u('c1', '2026-08-01T00:00:00Z', '2026-10-10T00:00:00Z'),
      u('n1', '2026-10-06T00:00:00Z', null), u('n2', '2026-10-07T00:00:00Z', null),
      u('t1', '2026-10-06T00:00:00Z', '2026-10-08T00:00:00Z', true), // test account: ignored
    ]
    const st = buildStatement({ ...base, users, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.vp['Blended CAC'][1]).toBeCloseTo(50) // $100 ÷ 2 real new subs
    expect(st.vp['Monthly churn (measured)'][1]).toBeGreaterThan(0)
    expect(st.vp['LTV (measured)'][1]).toBeCloseTo(9.99 / (st.vp['Monthly churn (measured)'][1] as number), 1)
    expect(st.vp['LTV (measured)'][0]).toBeNull() // no ad spend in September → no CAC → blank
  })

  test('blocked and cancelled charges are ignored', () => {
    const txns = [{ ...tx('b', '2026-10-03T00:00:00Z', -100, 'Anthropic'), status: 'blocked' }, { ...tx('c', '2026-10-03T00:00:00Z', -40, 'Anthropic'), status: 'cancelled' }]
    const st = buildStatement({ ...base, basis: 'cash', windows: windowsFor('monthly', NOW), txns })
    expect(st.totals.expenses.reduce((a, b) => a + b, 0)).toBeCloseTo(0)
  })

  test('Anthropic charges above the pipeline log move to Operating', () => {
    const txns = [tx('a', '2026-11-05T00:00:00Z', -500, 'Anthropic')]
    const w = [{ label: 'Nov', start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-08T00:00:00Z') }]
    const st = buildStatement({ ...base, basis: 'cash', windows: w, txns, pipelineClaudeDaily: [{ day: '2026-11-03', usd: 35 }] })
    expect(st.items.find(i => i.item === CLAUDE_PIPELINE_ITEM)!.values[0]).toBeCloseTo(35)
    expect(st.items.find(i => i.item === CLAUDE_REST_ITEM)!.values[0]).toBeCloseTo(465)
    expect(st.totals.expenses[0]).toBeCloseTo(500)
  })

  test('ad spend is assigned to the campaign running that day; CAC uses paid subs from the campaign tag', () => {
    const txns = [tx('f', '2026-08-20T00:00:00Z', -200, 'Facebook')]
    const users = [
      { id: 'u1', is_test_account: false, trial_started_at: '2026-08-18T00:00:00Z', first_paid_date: '2026-09-01T00:00:00Z', cancelled_at: null, billing_cycle: 'monthly', utm_campaign: 'bell' },
      { id: 'u2', is_test_account: true, trial_started_at: '2026-08-18T00:00:00Z', first_paid_date: '2026-09-01T00:00:00Z', cancelled_at: null, billing_cycle: 'monthly', utm_campaign: 'bell' },
    ]
    const campaigns = [{ id: 'c', name: 'Bell', platform: 'Meta', start_date: '2026-08-06', end_date: '2026-09-11', utm_campaign: 'bell', notes: null }]
    const st = buildStatement({ ...base, users, campaigns, basis: 'cash', windows: windowsFor('monthly', NOW), txns })
    expect(st.items.find(i => i.section === 'Ad Spend')!.item).toBe('Bell')
    expect(st.campaigns[0]).toMatchObject({ trials: 1, subs: 1, cost: 200, cac: 200, status: 'Ended' })
  })

  test('custom window validates dates; single-window periods have one column', () => {
    expect(windowsFor('d7', NOW)).toHaveLength(1)
    expect(() => windowsFor('custom', NOW, '2026-11-05', '2026-11-01')).toThrow()
  })

  test('mercury sync row keeps only the last four card digits', () => {
    expect(lastFour('Credit Card ••3396')).toBe('••3396')
    const r = toRow({ id: 'x', postedAt: '2026-11-01T00:00:00Z', amount: -5, status: 'sent', kind: 'creditCardTransaction', counterpartyName: 'Kie', details: { creditCardInfo: { paymentMethod: 'Credit Card ••9424' } } }, new Map([['••9424', 'ET-ElevenLabs']]))
    expect(r).toMatchObject({ card: '••9424', card_nickname: 'ET-ElevenLabs', amount: -5 })
  })
})

describe('FINANCE-STATEMENT-007 suggestions', () => {
  const { parseSuggestions, buildPrompt } = require('@/lib/finance/suggestions')
  test('parses a JSON array even with fences or stray text; drops malformed items', () => {
    const items = parseSuggestions('Here you go:\n```json\n[{"title":"Push annual","detail":"More annual plans.","impact":"≈ $50/mo"},{"nope":1}]\n```')
    expect(items).toEqual([{ title: 'Push annual', detail: 'More annual plans.', impact: '≈ $50/mo' }])
    expect(() => parseSuggestions('no list here')).toThrow()
  })
  test('prompt carries the quality rule', () => {
    expect(buildPrompt('X')).toMatch(/story quality must not drop/)
  })
})
