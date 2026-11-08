// FINANCE-STATEMENT-001 — pure statement engine for Admin → Finance → Statement.
// No I/O here: the API route loads rows and passes them in, so this file is
// unit-testable and the same math serves every period view.
//
// Bases
//   cash    — money counted on the day it moved in Mercury.
//   accrual — revenue/cost spread evenly by day over the period it covers
//             (accrual_months on the vendor rule or a per-transaction override).
//             Subscription revenue on accrual is computed from paid users.
// Plow back (Marc, Nov 8 2026): 75% of a month's customer revenue is set aside
// for ads and shows up as "Plow back" revenue in the NEXT month. It is computed
// on customer revenue only, so it never compounds on itself.

export type Basis = 'cash' | 'accrual'
export type Section =
  | 'Revenue' | 'Operating Exp' | 'Production Exp' | 'Ad Spend' | 'Marketing Services' | 'R & D'
  | 'Excluded' | 'Uncategorized'
export const EXPENSE_SECTIONS: Section[] = ['Operating Exp', 'Production Exp', 'Ad Spend', 'Marketing Services', 'R & D', 'Uncategorized']

export interface Txn {
  id: string; posted_at: string; amount: number; status: string; kind: string
  counterparty: string; bank_description: string | null; card: string | null; note: string | null
}
export interface Rule {
  id: number; priority: number; match_counterparty: string | null; match_description: string | null; match_card: string | null
  section: Section; item: string; ai_service: string | null; purpose: string | null; accrual_months: number; active: boolean
}
export interface Override { txn_id: string; section: Section; item: string; accrual_months: number | null; reason: string | null }
export interface UserRow {
  id: string; is_test_account: boolean | null; trial_started_at: string | null; first_paid_date: string | null
  cancelled_at: string | null; billing_cycle: string | null; utm_campaign: string | null
}
export interface StoryRow { id: string; series_id: string | null; published_on: string | null }
export interface Campaign { id: string; name: string; platform: string; start_date: string; end_date: string | null; utm_campaign: string | null; notes: string | null }
export interface Window { label: string; start: Date; end: Date } // [start, end)

export const PRICE_MONTHLY = 9.99
export const PRICE_ANNUAL = 79.99
export const LTV_ASSUMED = 92 // $9.20/mo contribution ÷ 10% churn (assumption until churn is measured)
export const PLOW_BACK = 0.75
export const CLAUDE_PIPELINE_ITEM = 'Claude API — story pipeline'
export const CLAUDE_REST_ITEM = 'Orion, agents & dev tools — Claude'
const DAY = 86400000

// ---------- classification ----------
function like(value: string | null | undefined, pattern: string | null): boolean {
  if (!pattern) return true
  if (value == null) return false
  const re = new RegExp('^' + pattern.split('%').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
  return re.test(value)
}
export interface Classified { section: Section; item: string; ai_service: string | null; purpose: string | null; accrual_months: number; rule_id: number | null; overridden: boolean }
export function classify(t: Txn, rules: Rule[], overrides: Map<string, Override>): Classified {
  const o = overrides.get(t.id)
  const rule = [...rules].filter(r => r.active).sort((a, b) => a.priority - b.priority)
    .find(r => like(t.counterparty, r.match_counterparty) && like(t.bank_description, r.match_description) && like(t.card, r.match_card))
  if (o) return { section: o.section, item: o.item, ai_service: rule?.ai_service ?? null, purpose: o.reason ?? rule?.purpose ?? null, accrual_months: o.accrual_months ?? rule?.accrual_months ?? 1, rule_id: rule?.id ?? null, overridden: true }
  if (rule) return { section: rule.section, item: rule.item, ai_service: rule.ai_service, purpose: rule.purpose, accrual_months: Math.max(1, rule.accrual_months || 1), rule_id: rule.id, overridden: false }
  return { section: t.amount >= 0 ? 'Revenue' : 'Uncategorized', item: t.amount >= 0 ? 'Other' : (t.counterparty || 'Unknown'), ai_service: null, purpose: null, accrual_months: 1, rule_id: null, overridden: false }
}

// ---------- time helpers ----------
export function monthStart(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
export function addMonths(d: Date, n: number) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)) }
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) { return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) }
export function monthlyWindows(first: Date, now: Date): Window[] {
  const out: Window[] = []
  for (let m = monthStart(first); m <= now; m = addMonths(m, 1)) {
    const end = addMonths(m, 1)
    out.push({ label: m.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }), start: m, end: end > now ? now : end })
  }
  return out
}

// Amount of a transaction that falls in a window, on the chosen basis.
export function amountIn(t: Txn, c: Classified, w: Window, basis: Basis): number {
  const at = Date.parse(t.posted_at)
  if (basis === 'cash' || c.accrual_months <= 1) return at >= w.start.getTime() && at < w.end.getTime() ? t.amount : 0
  const s = monthStart(new Date(at)).getTime(), e = addMonths(new Date(s), c.accrual_months).getTime()
  return t.amount * overlap(s, e, w.start.getTime(), w.end.getTime()) / (e - s)
}

// ---------- subscriber math ----------
function inWin(iso: string | null, w: Window) { if (!iso) return false; const x = Date.parse(iso); return x >= w.start.getTime() && x < w.end.getTime() }
function activeAt(u: UserRow, at: number) { return !!u.first_paid_date && Date.parse(u.first_paid_date) <= at && (!u.cancelled_at || Date.parse(u.cancelled_at) > at) }
export function subscriberStats(users: UserRow[], w: Window) {
  const real = users.filter(u => !u.is_test_account)
  const end = w.end.getTime() - 1
  const active = real.filter(u => activeAt(u, end))
  const annual = active.filter(u => (u.billing_cycle || '').toLowerCase().startsWith('ann') || (u.billing_cycle || '').toLowerCase().startsWith('year'))
  const monthly = active.length - annual.length
  // accrual revenue: price per day of paid coverage inside the window
  let accMonthly = 0, accAnnual = 0
  for (const u of real) {
    if (!u.first_paid_date) continue
    const s = Date.parse(u.first_paid_date), e = u.cancelled_at ? Date.parse(u.cancelled_at) : Infinity
    const days = overlap(s, e, w.start.getTime(), w.end.getTime()) / DAY
    if (!days) continue
    const isAnnual = (u.billing_cycle || '').toLowerCase().startsWith('ann') || (u.billing_cycle || '').toLowerCase().startsWith('year')
    if (isAnnual) accAnnual += days * PRICE_ANNUAL / 365; else accMonthly += days * PRICE_MONTHLY * 12 / 365
  }
  return {
    trials: real.filter(u => inWin(u.trial_started_at, w)).length,
    newSubs: real.filter(u => inWin(u.first_paid_date, w)).length,
    cancels: real.filter(u => inWin(u.cancelled_at, w)).length,
    activeMonthly: monthly, activeAnnual: annual.length,
    runRate: monthly * PRICE_MONTHLY * 12 + annual.length * PRICE_ANNUAL,
    accrualMonthly: accMonthly, accrualAnnual: accAnnual,
  }
}

export const FIRST_MONTH = new Date(Date.UTC(2026, 3, 1)) // April 2026: first month with Mercury records
export function windowsFor(period: string, now: Date, from?: string | null, to?: string | null): Window[] {
  if (period === 'monthly') return monthlyWindows(FIRST_MONTH, now)
  if (period === 'custom') {
    const s = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(from + 'T00:00:00Z') : new Date(now.getTime() - 30 * DAY)
    const e = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(Date.parse(to + 'T00:00:00Z') + DAY) : now
    if (!(e > s)) throw new Error('The end date must be after the start date')
    return [{ label: `${s.toISOString().slice(0, 10)} → ${new Date(e.getTime() - DAY).toISOString().slice(0, 10)}`, start: s, end: e }]
  }
  const days = period === 'd1' ? 1 : period === 'd7' ? 7 : 30
  return [{ label: period === 'd1' ? 'Last 24 hours' : `Last ${days} days`, start: new Date(now.getTime() - days * DAY), end: now }]
}


// ---------- statement ----------
export interface ItemCell { section: Section; item: string; ai_service: string | null; purpose: string | null; cards: string[]; values: number[] }
export interface CampaignDetail { name: string; platform: string; dates: string; days: number; trials: number; subs: number; cost: number; costPerTrial: number | null; cac: number | null; status: string }
export interface Statement {
  basis: Basis; columns: string[]
  vp: Record<string, (number | null)[]>
  revenue: Record<string, number[]>
  items: ItemCell[]
  sections: Record<string, number[]>
  totals: { revenue: number[]; expenses: number[]; result: number[]; plowBack: number[]; retained: number[] }
  campaigns: CampaignDetail[]
  uncategorizedCount: number
  notes: string[]
}

export function buildStatement(input: {
  basis: Basis; windows: Window[]; txns: Txn[]; rules: Rule[]; overrides: Override[]
  users: UserRow[]; stories: StoryRow[]; campaigns: Campaign[]; now?: Date
  /** Daily cost the story pipeline logged itself (anthropic_usage_log). Used to split Anthropic charges. */
  pipelineClaudeDaily?: { day: string; usd: number }[]
}): Statement {
  const { basis, windows } = input
  const ov = new Map(input.overrides.map(o => [o.txn_id, o]))
  const txns = input.txns.filter(t => t.status !== 'cancelled' && t.status !== 'failed' && t.status !== 'reversed')
  const cls = txns.map(t => ({ t, c: classify(t, input.rules, ov) }))
  const n = windows.length, zero = () => Array(n).fill(0)

  // Ad Spend transactions are assigned to the campaign running on that date.
  const campaignFor = (iso: string) => {
    const x = Date.parse(iso)
    return input.campaigns.find(c => x >= Date.parse(c.start_date) && (!c.end_date || x < Date.parse(c.end_date) + DAY))
  }

  const itemMap = new Map<string, ItemCell>()
  const revenueCash: Record<string, number[]> = { 'Subscriptions (Stripe payouts)': zero(), 'Custom stories': zero(), 'Other': zero() }
  for (const { t, c } of cls) {
    if (c.section === 'Excluded') continue
    let item = c.item
    if (c.section === 'Ad Spend') item = campaignFor(t.posted_at)?.name || 'Ads outside any campaign'
    if (c.section === 'Revenue') {
      const key = revenueCash[item] ? item : 'Other'
      windows.forEach((w, i) => { revenueCash[key][i] += amountIn(t, c, w, basis) })
      continue
    }
    const k = c.section + '|' + item
    const cell: ItemCell = itemMap.get(k) || { section: c.section, item, ai_service: c.ai_service, purpose: c.purpose, cards: [] as string[], values: zero() }
    if (t.card && !cell.cards.includes(t.card)) cell.cards.push(t.card)
    windows.forEach((w, i) => { cell.values[i] += -amountIn(t, c, w, basis) }) // expenses shown positive
    itemMap.set(k, cell)
  }

  // Revenue lines
  const subs = windows.map(w => subscriberStats(input.users, w))
  const revenue: Record<string, number[]> = basis === 'cash'
    ? { 'Annual subs': zero(), 'Monthly subs': zero(), 'Subscriptions (Stripe payouts)': revenueCash['Subscriptions (Stripe payouts)'] }
    : { 'Annual subs': subs.map(s => s.accrualAnnual), 'Monthly subs': subs.map(s => s.accrualMonthly), 'Subscriptions (Stripe payouts)': zero() }
  revenue['Custom stories'] = revenueCash['Custom stories']
  revenue['Other'] = revenueCash['Other']
  const customer = windows.map((_, i) => Object.values(revenue).reduce((a, r) => a + r[i], 0))
  // plow back: previous calendar month's customer revenue × 75%
  revenue['Plow back'] = windows.map(w => {
    const prev: Window = { label: '', start: addMonths(monthStart(w.start), -1), end: monthStart(w.start) }
    const frac = (w.end.getTime() - w.start.getTime()) / (addMonths(monthStart(w.start), 1).getTime() - monthStart(w.start).getTime())
    const prevCustomer = customerRevenue(prev)
    return prevCustomer * PLOW_BACK * Math.min(1, frac)
  })
  function customerRevenue(w: Window) {
    const s = subscriberStats(input.users, w)
    let r = basis === 'cash' ? 0 : s.accrualAnnual + s.accrualMonthly
    for (const { t, c } of cls) if (c.section === 'Revenue') r += amountIn(t, c, w, basis)
    return r
  }

  // Anthropic charges cover every Claude API key on the account. The pipeline logs its own
  // usage, so that part stays in Production; the rest (agent fleet, dev tools) goes to Operating.
  const claude = itemMap.get('Production Exp|' + CLAUDE_PIPELINE_ITEM)
  if (claude && input.pipelineClaudeDaily) {
    const logged = windows.map(w => input.pipelineClaudeDaily!.reduce((a, d) => { const x = Date.parse(d.day + 'T12:00:00Z'); return a + (x >= w.start.getTime() && x < w.end.getTime() ? Number(d.usd) : 0) }, 0))
    const restKey = 'Operating Exp|' + CLAUDE_REST_ITEM
    const rest: ItemCell = itemMap.get(restKey) || { section: 'Operating Exp' as Section, item: CLAUDE_REST_ITEM, ai_service: 'Claude API (keys other than the app server)', purpose: 'Orion and the agent fleet, Claude Code and other tools. Charges above what the pipeline logged.', cards: claude.cards.slice(), values: zero() }
    claude.values = claude.values.map((v, i) => { const keep = Math.max(0, Math.min(v, logged[i])); rest.values[i] += v - keep; return keep })
    if (rest.values.some(v => v)) itemMap.set(restKey, rest)
  }
  const items = Array.from(itemMap.values()).sort((a, b) => EXPENSE_SECTIONS.indexOf(a.section) - EXPENSE_SECTIONS.indexOf(b.section) || b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0))
  const sections: Record<string, number[]> = {}
  for (const s of EXPENSE_SECTIONS) sections[s] = windows.map((_, i) => items.filter(it => it.section === s).reduce((a, it) => a + it.values[i], 0))
  const totalRevenue = windows.map((_, i) => Object.values(revenue).reduce((a, r) => a + r[i], 0))
  const totalExpenses = windows.map((_, i) => EXPENSE_SECTIONS.reduce((a, s) => a + sections[s][i], 0))

  // Volume & productivity
  const pub = windows.map(w => input.stories.filter(s => inWin(s.published_on, w)))
  const adSpend = sections['Ad Spend']
  const vp: Record<string, (number | null)[]> = {
    'Stories published': pub.map(p => new Set(p.map(s => s.series_id || s.id)).size),
    'Episodes published': pub.map(p => p.length),
    'Production cost per episode': pub.map((p, i) => p.length ? sections['Production Exp'][i] / p.length : null),
    'Meta campaigns': windows.map(w => input.campaigns.filter(c => Date.parse(c.start_date) < w.end.getTime() && (!c.end_date || Date.parse(c.end_date) + DAY > w.start.getTime())).length),
    'Ad spend': adSpend,
    'New trials': subs.map(s => s.trials),
    'Cost per trial': subs.map((s, i) => s.trials ? adSpend[i] / s.trials : null),
    'New subs': subs.map(s => s.newSubs),
    'CAC': subs.map((s, i) => s.newSubs ? adSpend[i] / s.newSubs : null),
    'Cancellations': subs.map(s => s.cancels),
    'Net subs': subs.map(s => s.newSubs - s.cancels),
    'LTV (assumed)': windows.map(() => LTV_ASSUMED),
    'Net LTV-CAC %': subs.map((s, i) => s.newSubs && adSpend[i] ? (LTV_ASSUMED - adSpend[i] / s.newSubs) / (adSpend[i] / s.newSubs) : null),
    'Net LTV-CAC $': subs.map((s, i) => s.newSubs ? LTV_ASSUMED - adSpend[i] / s.newSubs : null),
    'Run rate (yearly)': subs.map(s => s.runRate),
  }

  // Campaign details over each campaign's whole life (not just the window)
  const allCash = cls.filter(x => x.c.section === 'Ad Spend')
  const now = input.now || new Date()
  const campaigns: CampaignDetail[] = input.campaigns.map(c => {
    const s = Date.parse(c.start_date), e = c.end_date ? Date.parse(c.end_date) + DAY : now.getTime()
    const cost = -allCash.filter(x => { const t = Date.parse(x.t.posted_at); return t >= s && t < e }).reduce((a, x) => a + x.t.amount, 0)
    const real = input.users.filter(u => !u.is_test_account && c.utm_campaign && u.utm_campaign === c.utm_campaign)
    const trials = real.filter(u => u.trial_started_at).length, paid = real.filter(u => u.first_paid_date).length
    const live = !c.end_date || e > now.getTime()
    return { name: c.name, platform: c.platform, dates: `${c.start_date.slice(0, 10)} – ${c.end_date ? c.end_date.slice(0, 10) : 'running'}`, days: Math.max(1, Math.round((Math.min(e, now.getTime()) - s) / DAY)), trials, subs: paid, cost, costPerTrial: trials ? cost / trials : null, cac: paid ? cost / paid : null, status: live ? 'Live' : 'Ended' }
  })

  return {
    basis, columns: windows.map(w => w.label), vp, revenue, items, sections,
    totals: {
      revenue: totalRevenue, expenses: totalExpenses, result: totalRevenue.map((r, i) => r - totalExpenses[i]),
      plowBack: customer.map(r => r * PLOW_BACK), retained: customer.map(r => r * (1 - PLOW_BACK)),
    },
    campaigns,
    uncategorizedCount: cls.filter(x => x.c.section === 'Uncategorized').length,
    notes: [
      basis === 'cash' ? 'Cash basis matches Mercury: money counted the day it moved.' : 'Accrual basis spreads annual plans and yearly purchases over the months they cover; subscription revenue comes from paid subscribers.',
      'Prepaid AI credits (Anthropic, OpenAI, DeepSeek, Google) are counted when bought on both bases until vendor usage feeds are connected.',
      'Owner deposits, card payments and transfers between Mercury accounts are excluded: they are not revenue or expense.',
    ],
  }
}
