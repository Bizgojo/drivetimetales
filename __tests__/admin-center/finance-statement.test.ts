import { buildStatement, classify, windowsFor, monthlyWindows, CLAUDE_PIPELINE_ITEM, CLAUDE_REST_ITEM, STRIPE_ITEM, TEST_ITEM, AVAILABLE_ITEM, INTEREST_ITEM, type Rule, type Txn } from '@/lib/finance/statement'
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
  rule(7, 6, 'Mercury IO Cashback', 'Revenue', 'Interest income (card cashback)'),
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

  test("plow back: 75% of last month's PROFIT shows next month as available for ads, not revenue", () => {
    const users = [realUser('r1', '2026-08-01T00:00:00Z')]
    const txns = [tx('r', '2026-09-10T00:00:00Z', 100, 'Stripe', 'other'), tx('e', '2026-09-11T00:00:00Z', -20, 'Anthropic')]
    const st = buildStatement({ ...base, users, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.totals.result[0]).toBeCloseTo(80)
    expect(st.totals.plowBack[0]).toBeCloseTo(60)
    expect(st.totals.retained[0]).toBeCloseTo(20)
    expect(st.memo[AVAILABLE_ITEM][0]).toBeCloseTo(0)
    expect(st.memo[AVAILABLE_ITEM][1]).toBeCloseTo(60, 0)
    expect(st.totals.revenue[1]).toBeCloseTo(0) // not revenue
    expect(st.revenue['Plow back']).toBeUndefined()
  })

  test('current month shows the full plow back from day one (no proration)', () => {
    const users = [realUser('r1', '2026-08-01T00:00:00Z')]
    const txns = [tx('r', '2026-10-10T00:00:00Z', 100, 'Stripe', 'other')]
    const st = buildStatement({ ...base, users, basis: 'cash', windows: windowsFor('monthly', NOW), txns })
    expect(st.memo[AVAILABLE_ITEM][st.columns.indexOf('Nov 2026')]).toBeCloseTo(75)
    expect(buildStatement({ ...base, users, basis: 'cash', windows: windowsFor('d1', NOW), txns }).memo[AVAILABLE_ITEM][0]).toBeCloseTo(75)
  })

  test('a payout with nobody paying is not revenue; a subscriber who just cancelled still counts', () => {
    const txns = [tx('r', '2026-10-10T00:00:00Z', 9.99, 'Stripe', 'other')]
    const none = buildStatement({ ...base, basis: 'cash', windows: SEP_OCT, txns })
    expect(none.revenue[STRIPE_ITEM][1]).toBeCloseTo(0)
    expect(none.memo[TEST_ITEM][1]).toBeCloseTo(9.99)
    const users = [{ ...realUser('r1', '2026-09-08T00:00:00Z'), cancelled_at: '2026-10-08T00:00:00Z' }]
    expect(buildStatement({ ...base, users, basis: 'cash', windows: SEP_OCT, txns }).revenue[STRIPE_ITEM][1]).toBeCloseTo(9.99)
  })

  test('drill-down: stories with episode counts and production cost per episode by AI', () => {
    const stories = [
      { id: 'e1', series_id: 's1', published_on: '2026-10-02', title: 'Ep 1', series_title: 'Rerouted' },
      { id: 'e2', series_id: 's1', published_on: '2026-10-09', title: 'Ep 2', series_title: 'Rerouted' },
      { id: 'e3', series_id: null, published_on: '2026-10-12', title: 'The Bell', series_title: null },
    ]
    const txns = [tx('a', '2026-10-03T00:00:00Z', -90, 'Anthropic'), tx('s', '2026-10-04T00:00:00Z', -30, 'Sound Ideas')]
    const st = buildStatement({ ...base, stories, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.vpDetail.stories[1]).toEqual([{ title: 'Rerouted', episodes: 2 }, { title: 'The Bell', episodes: 1 }])
    const c = st.vpDetail.costPerEpisode[1]
    expect(c.map(x => x.item)).toEqual([CLAUDE_PIPELINE_ITEM, 'Sound effects library'])
    expect(c[0].perEpisode).toBeCloseTo(30)
    expect(st.vpDetail.stories[0]).toEqual([])
  })

  test('a loss month plows back nothing', () => {
    const users = [realUser('r1', '2026-08-01T00:00:00Z')]
    const txns = [tx('r', '2026-09-10T00:00:00Z', 100, 'Stripe', 'other'), tx('e', '2026-09-11T00:00:00Z', -500, 'Anthropic')]
    const st = buildStatement({ ...base, users, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.totals.plowBack[0]).toBe(0)
    expect(st.totals.retained[0]).toBe(0)
    expect(st.memo[AVAILABLE_ITEM][1]).toBe(0)
  })

  test('Stripe payouts from test accounts are a memo line, not revenue', () => {
    const users = [realUser('r1', '2026-08-01T00:00:00Z'), realUser('t1', '2026-08-01T00:00:00Z', true), realUser('t2', '2026-08-01T00:00:00Z', true), realUser('t3', '2026-08-01T00:00:00Z', true)]
    const txns = [tx('r', '2026-09-10T00:00:00Z', 40, 'Stripe', 'other'), tx('o', '2026-09-12T00:00:00Z', 30, 'Stripe', 'other')]
    const st = buildStatement({ ...base, users: users.slice(1), basis: 'cash', windows: SEP_OCT, txns: txns.slice(1) })
    expect(st.revenue[STRIPE_ITEM][0]).toBeCloseTo(0)
    expect(st.memo[TEST_ITEM][0]).toBeCloseTo(30)
    const mixed = buildStatement({ ...base, users, basis: 'cash', windows: SEP_OCT, txns: txns.slice(0, 1) })
    expect(mixed.revenue[STRIPE_ITEM][0]).toBeCloseTo(10)
    expect(mixed.memo[TEST_ITEM][0]).toBeCloseTo(30)
  })

  test('card cashback is interest income; Other stays empty; unmatched money in is not revenue', () => {
    const txns = [tx('c', '2026-09-10T00:00:00Z', 3.5, 'Mercury IO Cashback', 'other'), tx('x', '2026-09-12T00:00:00Z', 7000, 'Unknown Bank', 'externalTransfer')]
    const st = buildStatement({ ...base, basis: 'cash', windows: SEP_OCT, txns })
    expect(st.revenue[INTEREST_ITEM][0]).toBeCloseTo(3.5)
    expect(st.revenue['Other'][0]).toBeCloseTo(0)
    expect(st.totals.revenue[0]).toBeCloseTo(3.5)
    expect(st.uncategorizedCount).toBe(1)
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
