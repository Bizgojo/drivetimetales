import { buildStatement, classify, windowsFor, monthlyWindows, CLAUDE_PIPELINE_ITEM, CLAUDE_REST_ITEM, type Rule, type Txn } from '@/lib/finance/statement'
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
    expect(buildStatement({ ...base, basis: 'accrual', windows: w, txns }).totals.expenses[0]).toBeCloseTo(1500 * 30 / 365, 0)
  })

  test("plow back: 75% of last month's customer revenue appears as revenue next month", () => {
    const txns = [tx('r', '2026-09-10T00:00:00Z', 100, 'Stripe', 'other')]
    const st = buildStatement({ ...base, basis: 'cash', windows: monthlyWindows(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-31T23:00:00Z')), txns })
    expect(st.revenue['Plow back'][0]).toBeCloseTo(0)
    expect(st.revenue['Plow back'][1]).toBeCloseTo(75, 0)
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
