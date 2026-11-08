// FINANCE-STATEMENT-001 — pure statement engine for Admin → Finance → Statement.
// No I/O here: the API route loads rows and passes them in, so this file is
// unit-testable and the same math serves every period view.
//
// Bases
//   cash    — money counted on the day it moved in Mercury.
//   accrual — revenue/cost spread evenly by day over the period it covers
//             (accrual_months on the vendor rule or a per-transaction override).
//             Subscription revenue comes from the Stripe ledger (finance_stripe_txns):
//             every charge, refund and fee, test accounts included (they were real money).
//             On accrual an annual charge is spread over 12 months, a monthly one over 1.
//             Stripe payouts landing in Mercury are transfers, not revenue.
// Plow back (Marc, Nov 8 2026, revised): 75% of a month's PROFIT (positive cash
// flow) is set aside for ads and shows next month as "Available for ads". A loss
// month plows back $0. It is not revenue and never enters totals.

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
/** One Stripe balance transaction (finance_stripe_txns). Amounts in dollars. */
export interface StripeTxn {
  id: string; created_at: string; type: string; reporting_category: string | null
  amount: number; fee: number; net: number; description: string | null
  interval: string | null; customer_email: string | null
}
export interface StoryRow { id: string; series_id: string | null; published_on: string | null; title?: string | null; series_title?: string | null }
/** Every story row with its pipeline status (for the published vs in-pipeline split). */
export interface PipelineRow { id: string; series_id: string | null; status: string | null; is_hidden: boolean | null; title?: string | null; series_title?: string | null; series_total?: number | null }
export interface PipelineStage { stage: string; series: { title: string; episodes: number; live: number; total: number }[]; episodes: number }

// Pipeline stages, in production order. Statuses not listed fall under "Other status".
export const PIPELINE_STAGES: [string, string[]][] = [
  ['Idea & brief', ['pending', 'queued', 'draft', 'active', 'brief_complete']],
  ['Script being written or fixed', ['script_drafted', 'script_revised', 'script_ready', 'scripts_ready', 'validator_failed', 'repair_queue']],
  ['Script approved, waiting for voices', ['validator_passed']],
  ['Voiced, not released', ['in_production', 'mixed_locally', 'audio_ready']],
  ['Waiting for your review', ['ready_for_review']],
  ['Published but hidden', ['published']],
]
/** Snapshot of everything not yet live, grouped by stage and series. Cold storage is left out. */
export function pipelineSnapshot(rows: PipelineRow[]): { stages: PipelineStage[]; coldStorage: number } {
  const live = (r: PipelineRow) => r.status === 'published' && !r.is_hidden
  const bySeries = new Map<string, PipelineRow[]>()
  for (const r of rows) { const k = r.series_id || r.id; bySeries.set(k, [...(bySeries.get(k) || []), r]) }
  const stageOf = (status: string | null) => (PIPELINE_STAGES.find(([, ss]) => ss.includes(status || '')) || ['Other status'])[0]
  const out = new Map<string, PipelineStage>()
  for (const r of rows) {
    if (live(r) || r.status === 'cold_storage') continue
    const st = stageOf(r.status), k = r.series_id || r.id
    const group = bySeries.get(k) || [r]
    const title = r.series_title || r.title || 'Untitled'
    const stage = out.get(st) || { stage: st, series: [], episodes: 0 }
    stage.episodes++
    let s = stage.series.find(x => x.title === title)
    if (!s) { s = { title, episodes: 0, live: group.filter(live).length, total: Math.max(group.length, r.series_total || 0) }; stage.series.push(s) }
    s.episodes++
    out.set(st, stage)
  }
  const order = [...PIPELINE_STAGES.map(([n]) => n), 'Other status']
  return {
    stages: Array.from(out.values()).sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage)).map(x => ({ ...x, series: x.series.sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title)) })),
    coldStorage: rows.filter(r => r.status === 'cold_storage').length,
  }
}
export interface StoryDetail { title: string; episodes: number; voiceCost: number | null; complete?: boolean }
/** ElevenLabs credits used per day, and the plan's price per credit over time. */
export interface ElDay { day: string; credits: number }
export interface ElPlan { captured_on: string; tier: string | null; credit_limit: number | null; monthly_price_usd: number | null }
export interface CostDetail { item: string; ai_service: string | null; total: number; perEpisode: number | null }
export interface Campaign { id: string; name: string; platform: string; start_date: string; end_date: string | null; utm_campaign: string | null; notes: string | null }
export interface Window { label: string; start: Date; end: Date } // [start, end)

export const PRICE_MONTHLY = 9.99
export const PRICE_ANNUAL = 79.99
export const LTV_ASSUMED = 92 // $9.20/mo contribution ÷ 10% churn (assumption until churn is measured)
export const PLOW_BACK = 0.75
export const STRIPE_ITEM = 'Subscriptions (Stripe payouts)' // Mercury rule name for Stripe payouts (treated as transfers)
export const ANNUAL_ITEM = 'Annual subs'
export const MONTHLY_ITEM = 'Monthly subs'
export const ONE_TIME_ITEM = 'Custom stories & one-time purchases'
export const REFUND_ITEM = 'Refunds & disputes'
export const INTEREST_ITEM = 'Interest income (Mercury)'
export const CASHBACK_ITEM = 'Card cashback rewards'
export const OTHER_ITEM = 'Other (not yet categorized)'
export const STRIPE_FEE_ITEM = 'Payment processing (Stripe fees)'
export const PAYOUT_TRANSFER_ITEM = 'Stripe payouts (transfer)'
export const EL_ITEM = 'Voices (ElevenLabs)'
export const PAYOUT_MEMO = 'Stripe payouts received in Mercury'
const LEGACY_CASHBACK = ['Interest income (card cashback)', 'Other']
export const AVAILABLE_ITEM = 'Available for ads this month (75% of last month\'s profit)'
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
export interface Classified { section: Section; item: string; ai_service: string | null; purpose: string | null; accrual_months: number; rule_id: number | null; overridden: boolean; spread?: boolean }
export function classify(t: Txn, rules: Rule[], overrides: Map<string, Override>): Classified {
  const o = overrides.get(t.id)
  const rule = [...rules].filter(r => r.active).sort((a, b) => a.priority - b.priority)
    .find(r => like(t.counterparty, r.match_counterparty) && like(t.bank_description, r.match_description) && like(t.card, r.match_card))
  if (o) return { section: o.section, item: o.item, ai_service: rule?.ai_service ?? null, purpose: o.reason ?? rule?.purpose ?? null, accrual_months: o.accrual_months ?? rule?.accrual_months ?? 1, rule_id: rule?.id ?? null, overridden: true }
  if (rule) return { section: rule.section, item: rule.item, ai_service: rule.ai_service, purpose: rule.purpose, accrual_months: Math.max(1, rule.accrual_months || 1), rule_id: rule.id, overridden: false }
  // No rule: never assume incoming money is revenue (could be owner capital, a refund, interest).
  return { section: 'Uncategorized', item: (t.counterparty || 'Unknown') + (t.amount >= 0 ? ' (money in)' : ''), ai_service: null, purpose: 'No vendor rule yet', accrual_months: 1, rule_id: null, overridden: false }
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
  if (basis === 'cash' || (c.accrual_months <= 1 && !c.spread)) return at >= w.start.getTime() && at < w.end.getTime() ? t.amount : 0
  const d = new Date(at), s = at
  const e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + c.accrual_months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
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
    const ok = (v: string | null | undefined, d: Date) => !v || d.toISOString().slice(0, 10) === v
    if (!ok(from, s) || (to && !ok(to, new Date(e.getTime() - DAY))) || !(e > s)) throw new RangeError('Choose a valid start and end date, with the end on or after the start')
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
  /** Shown below the statement; not part of revenue or the result. */
  memo: Record<string, number[]>
  /** Click-through detail for V&P rows, one list per column. */
  vpDetail: { stories: StoryDetail[][]; costPerEpisode: CostDetail[][] }
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
  /** internal: skip the previous-month plow-back lookup (prevents recursion) */
  noPlowBack?: boolean
  /** Stripe ledger: charges, refunds, fees (finance_stripe_txns). */
  stripe?: StripeTxn[]
  /** ElevenLabs credits used per day and plan snapshots (price per credit). */
  elDaily?: ElDay[]
  elPlans?: ElPlan[]
  /** All story rows with status, for complete vs partly-published series. */
  pipeline?: PipelineRow[]
  /** Voiced script length per story id (for splitting voice cost across stories). */
  storyChars?: Record<string, number>
}): Statement {
  const { basis, windows } = input
  const ov = new Map(input.overrides.map(o => [o.txn_id, o]))
  const txns = input.txns.filter(t => !['cancelled', 'failed', 'reversed', 'blocked'].includes(t.status))
  const cls = txns.map(t => ({ t, c: classify(t, input.rules, ov) }))
  // Mercury side: Stripe payouts are transfers from the Stripe balance (revenue is counted from
  // Stripe itself); cashback has its own line; unmatched money in shows as Other so it gets spotted.
  const PAYOUT_ITEMS = [STRIPE_ITEM, PAYOUT_TRANSFER_ITEM]
  const payouts = cls.filter(x => (PAYOUT_ITEMS.includes(x.c.item) || (x.c.section === 'Uncategorized' && /^stripe\b/i.test(x.t.counterparty))) && x.t.amount > 0)
  for (const x of cls) {
    if (((x.c.section === 'Revenue' && x.c.item === STRIPE_ITEM) || (x.c.section === 'Uncategorized' && /^stripe\b/i.test(x.t.counterparty))) && x.t.amount > 0) x.c = { ...x.c, section: 'Excluded', item: PAYOUT_TRANSFER_ITEM }
    else if (x.c.section === 'Revenue' && /cashback/i.test(x.t.counterparty) && LEGACY_CASHBACK.includes(x.c.item)) x.c = { ...x.c, item: CASHBACK_ITEM }
    else if (x.c.section === 'Uncategorized' && x.t.amount > 0) x.c = { ...x.c, section: 'Revenue', item: OTHER_ITEM }
  }
  // Stripe side, turned into the same shape so both bases share one path.
  const stripeCls: { t: Txn; c: Classified }[] = []
  const mk = (st: StripeTxn, amount: number, section: Section, item: string, months = 1, spread = false) => stripeCls.push({
    t: { id: 'stripe:' + st.id + ':' + item, posted_at: st.created_at, amount, status: 'sent', kind: 'stripe', counterparty: 'Stripe', bank_description: st.description, card: null, note: st.customer_email },
    c: { section, item, ai_service: section === 'Revenue' ? null : 'Stripe', purpose: section === 'Revenue' ? null : 'Card processing fees Stripe keeps from each payment.', accrual_months: months, rule_id: null, overridden: false, spread },
  })
  for (const st of input.stripe || []) {
    const cat = st.reporting_category || st.type
    // Money moving between Stripe and the bank, or held in reserve, is not revenue.
    if (['payout', 'payout_reversal', 'transfer', 'transfer_reversal', 'topup', 'topup_reversal', 'risk_reserved_funds', 'connect_reserved_funds'].includes(cat) || /^(payout|topup|transfer)/.test(st.type)) continue
    const annual = /^(year|ann)/i.test(st.interval || ''), monthly = /^month/i.test(st.interval || '')
    const months = annual ? 12 : 1, spread = annual || monthly
    if (cat === 'charge') {
      mk(st, st.amount, 'Revenue', annual ? ANNUAL_ITEM : monthly ? MONTHLY_ITEM : ONE_TIME_ITEM, months, spread)
    } else if (['refund', 'dispute', 'dispute_reversal', 'partial_capture_reversal', 'charge_failure', 'refund_failure'].includes(cat)) {
      mk(st, st.amount, 'Revenue', REFUND_ITEM, months, spread) // spread like the charge it reverses
    } else if (cat === 'fee' || st.type === 'stripe_fee') {
      mk(st, st.net, 'Operating Exp', STRIPE_FEE_ITEM); continue
    } else {
      mk(st, st.amount, 'Revenue', OTHER_ITEM)
    }
    if (st.fee) mk(st, -st.fee, 'Operating Exp', STRIPE_FEE_ITEM, months, spread)
  }
  cls.push(...stripeCls)
  const n = windows.length, zero = () => Array(n).fill(0)

  // Ad Spend transactions are assigned to the campaign running on that date.
  const campaignFor = (iso: string) => {
    const x = Date.parse(iso)
    return input.campaigns.find(c => x >= Date.parse(c.start_date) && (!c.end_date || x < Date.parse(c.end_date) + DAY))
  }

  const itemMap = new Map<string, ItemCell>()
  const REVENUE_LINES = [ANNUAL_ITEM, MONTHLY_ITEM, ONE_TIME_ITEM, REFUND_ITEM, INTEREST_ITEM, CASHBACK_ITEM, OTHER_ITEM]
  const revenue: Record<string, number[]> = Object.fromEntries(REVENUE_LINES.map(k => [k, zero()]))
  for (const { t, c } of cls) {
    if (c.section === 'Excluded') continue
    let item = c.item
    if (c.section === 'Ad Spend') item = campaignFor(t.posted_at)?.name || 'Ads outside any campaign'
    if (c.section === 'Revenue') {
      const key = revenue[item] ? item : (/custom stor/i.test(item) ? ONE_TIME_ITEM : OTHER_ITEM)
      windows.forEach((w, i) => { revenue[key][i] += amountIn(t, c, w, basis) })
      continue
    }
    const k = c.section + '|' + item
    const cell: ItemCell = itemMap.get(k) || { section: c.section, item, ai_service: c.ai_service, purpose: c.purpose, cards: [] as string[], values: zero() }
    if (t.card && !cell.cards.includes(t.card)) cell.cards.push(t.card)
    windows.forEach((w, i) => { cell.values[i] += -amountIn(t, c, w, basis) }) // expenses shown positive
    itemMap.set(k, cell)
  }

  const subs = windows.map(w => subscriberStats(input.users, w))

  // Anthropic charges cover every Claude API key on the account. The pipeline logs its own
  // usage, so that part stays in Production; the rest (agent fleet, dev tools) goes to Operating.
  const claude = itemMap.get('Production Exp|' + CLAUDE_PIPELINE_ITEM)
  if (claude && input.pipelineClaudeDaily) {
    // Credits are bought in lumps and used later, so compare against usage over the 90 days before
    // each window ends: pipeline share = pipeline-logged usage ÷ Anthropic charges in that span.
    const claudeTx = cls.filter(x => x.c.section === 'Production Exp' && x.c.item === CLAUDE_PIPELINE_ITEM)
    const span = (from: number, to: number) => ({
      logged: input.pipelineClaudeDaily!.reduce((a, d) => { const x = Date.parse(d.day + 'T12:00:00Z'); return a + (x >= from && x < to ? Number(d.usd) : 0) }, 0),
      charged: claudeTx.reduce((a, x) => { const t = Date.parse(x.t.posted_at); return a + (t >= from && t < to ? -x.t.amount : 0) }, 0),
    })
    const restKey = 'Operating Exp|' + CLAUDE_REST_ITEM
    const rest: ItemCell = itemMap.get(restKey) || { section: 'Operating Exp' as Section, item: CLAUDE_REST_ITEM, ai_service: 'Claude API (keys other than the app server)', purpose: 'Orion and the agent fleet, Claude Code and other tools. Estimated: Anthropic charges minus the pipeline\'s share of logged usage over the trailing 90 days.', cards: claude.cards.slice(), values: zero() }
    claude.values = claude.values.map((v, i) => {
      const end = windows[i].end.getTime(), { logged, charged } = span(end - 90 * DAY, end)
      const share = charged > 0 ? Math.min(1, logged / charged) : 1
      const keep = v * share; rest.values[i] += v - keep; return keep
    })
    if (rest.values.some(v => v)) itemMap.set(restKey, rest)
  }
  // ElevenLabs is billed as a subscription (not on a Mercury card). Its cost is usage-based:
  // credits used each day × the plan's price per credit (monthly price ÷ monthly credits).
  const plans = (input.elPlans || []).filter(p => p.credit_limit && p.monthly_price_usd).sort((a, b) => a.captured_on.localeCompare(b.captured_on))
  const perCredit = (day: string) => {
    const p = [...plans].reverse().find(x => x.captured_on <= day) || plans[0]
    return p ? Number(p.monthly_price_usd) / Number(p.credit_limit) : 0
  }
  const elCost = windows.map(w => (input.elDaily || []).reduce((a, d) => {
    const x = Date.parse(d.day + 'T00:00:00Z'), share = overlap(x, x + DAY, w.start.getTime(), w.end.getTime()) / DAY
    return a + (share ? Number(d.credits) * perCredit(d.day) * share : 0)
  }, 0))
  if (elCost.some(v => v)) itemMap.set('Production Exp|' + EL_ITEM, {
    section: 'Production Exp', item: EL_ITEM, ai_service: 'ElevenLabs text-to-speech' + (plans.length ? ` (${plans[plans.length - 1].tier || 'plan'})` : ''),
    purpose: 'Every voiced line. Usage-based: credits used × plan price per credit. Paid outside Mercury.', cards: ['outside Mercury'], values: elCost,
  })

  const items = Array.from(itemMap.values()).sort((a, b) => EXPENSE_SECTIONS.indexOf(a.section) - EXPENSE_SECTIONS.indexOf(b.section) || b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0))
  const sections: Record<string, number[]> = {}
  for (const s of EXPENSE_SECTIONS) sections[s] = windows.map((_, i) => items.filter(it => it.section === s).reduce((a, it) => a + it.values[i], 0))
  const totalRevenue = windows.map((_, i) => Object.values(revenue).reduce((a, r) => a + r[i], 0))
  const totalExpenses = windows.map((_, i) => EXPENSE_SECTIONS.reduce((a, s) => a + sections[s][i], 0))
  const result = totalRevenue.map((r, i) => r - totalExpenses[i])

  // Plow back: 75% of the PREVIOUS calendar month's profit (cash flow on cash basis), and only
  // when that month made money. A loss month plows back $0. It is money available for ads,
  // not revenue, so it sits below the statement and is never added to totals.
  // Each column shows the full amount for the calendar month it ends in (no proration), so the
  // current month shows all of last month's plow back from day one.
  const available = input.noPlowBack ? zero() : windows.map(w => {
    const m = monthStart(new Date(w.end.getTime() - 1))
    const prev = buildStatement({ ...input, windows: [{ label: '', start: addMonths(m, -1), end: m }], noPlowBack: true })
    return Math.max(0, prev.totals.result[0]) * PLOW_BACK
  })

  // Volume & productivity
  const pub = windows.map(w => input.stories.filter(s => inWin(s.published_on, w)))
  // Per-episode cost always uses spread-out costs (a yearly purchase counts 1/12 a month),
  // whatever basis the statement is on; otherwise a $1,500 yearly library lands on one month.
  const unitItems = basis === 'accrual' || input.noPlowBack ? items
    : buildStatement({ ...input, basis: 'accrual', noPlowBack: true }).items
  const unitProd = windows.map((_, i) => unitItems.filter(it => it.section === 'Production Exp').reduce((a, it) => a + it.values[i], 0))
  const adSpend = sections['Ad Spend']
  // A story counts as published only when every episode of its series is live. A series with
  // some episodes live and others not breaks the publishing rule and is counted separately.
  const allRows = input.pipeline || []
  const seriesComplete = (key: string) => {
    const eps = allRows.filter(r => (r.series_id || r.id) === key)
    if (!eps.length) return true // no pipeline data: treat as complete
    const total = Math.max(eps.length, eps[0].series_total || 0)
    return eps.filter(r => r.status === 'published' && !r.is_hidden).length >= total
  }
  const seriesKeys = (p: StoryRow[]) => Array.from(new Set(p.map(s => s.series_id || s.id)))
  const vp: Record<string, (number | null)[]> = {
    'Stories published': pub.map(p => seriesKeys(p).filter(seriesComplete).length),
    'Partly published (rule break)': pub.map(p => seriesKeys(p).filter(k => !seriesComplete(k)).length),
    'Episodes published': pub.map(p => p.length),
    'Production cost per episode': pub.map((p, i) => p.length ? unitProd[i] / p.length : null),
    'Meta campaigns': windows.map(w => input.campaigns.filter(c => Date.parse(c.start_date) < w.end.getTime() && (!c.end_date || Date.parse(c.end_date) + DAY > w.start.getTime())).length),
    'Ad spend': adSpend,
    'New trials': subs.map(s => s.trials),
    'Blended cost per trial': subs.map((s, i) => s.trials ? adSpend[i] / s.trials : null),
    'New subs': subs.map(s => s.newSubs),
    'Blended CAC': subs.map((s, i) => s.newSubs ? adSpend[i] / s.newSubs : null),
    'Cancellations': subs.map(s => s.cancels),
    'Net subs': subs.map(s => s.newSubs - s.cancels),
    'LTV (assumed)': windows.map(() => LTV_ASSUMED),
    'Net LTV-CAC %': subs.map((s, i) => s.newSubs && adSpend[i] ? (LTV_ASSUMED - adSpend[i] / s.newSubs) / (adSpend[i] / s.newSubs) : null),
    'Net LTV-CAC $': subs.map((s, i) => s.newSubs ? LTV_ASSUMED - adSpend[i] / s.newSubs : null),
    'Run rate (yearly)': subs.map(s => s.runRate),
  }

  // Click-through detail: which stories (episodes each), and what each production line cost per episode
  const vpDetail = {
    stories: pub.map((p, i) => {
      // Voice cost split across the period's episodes by script length (longer script → more credits).
      const chars = (st: StoryRow) => input.storyChars?.[st.id] ?? 0
      const totalChars = p.reduce((a, st) => a + chars(st), 0)
      const by = new Map<string, StoryDetail>()
      for (const st of p) {
        const k = st.series_id || st.id
        const d = by.get(k) || { title: st.series_title || st.title || 'Untitled', episodes: 0, voiceCost: elCost[i] && totalChars ? 0 : null, complete: seriesComplete(k) }
        d.episodes++
        if (d.voiceCost != null) d.voiceCost += elCost[i] * chars(st) / totalChars
        by.set(k, d)
      }
      return Array.from(by.values()).sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title))
    }),
    costPerEpisode: pub.map((p, i) => unitItems.filter(it => it.section === 'Production Exp' && Math.abs(it.values[i]) > 0.004)
      .map(it => ({ item: it.item, ai_service: it.ai_service, total: it.values[i], perEpisode: p.length ? it.values[i] / p.length : null }))
      .sort((a, b) => b.total - a.total)),
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
    vpDetail,
    memo: {
      [AVAILABLE_ITEM]: available,
      [PAYOUT_MEMO]: windows.map(w => payouts.reduce((a, x) => a + amountIn(x.t, x.c, w, 'cash'), 0)),
    },
    totals: {
      revenue: totalRevenue, expenses: totalExpenses, result,
      plowBack: result.map(r => Math.max(0, r) * PLOW_BACK), retained: result.map(r => Math.max(0, r) * (1 - PLOW_BACK)),
    },
    campaigns,
    uncategorizedCount: cls.filter(x => x.c.section === 'Uncategorized' || x.c.item === OTHER_ITEM).length,
    notes: [
      basis === 'cash' ? 'Cash basis matches Mercury: money counted the day it moved.' : 'Accrual basis spreads annual plans and yearly purchases over the months they cover; Stripe charges, their refunds and fees follow the plan length (12 months annual, 1 month monthly).',
      'Prepaid AI credits (Anthropic, OpenAI, DeepSeek, Google) are counted when bought on both bases until vendor usage feeds are connected.',
      'Owner deposits, card payments and transfers between Mercury accounts are excluded: they are not revenue or expense.',
      'Subscription revenue comes straight from Stripe: every charge, refund and fee. Stripe payouts into Mercury are transfers, shown below for reconciliation (payouts ≈ charges − refunds − fees, a few days later).',
      'Other (not yet categorized) is money that came in with no rule yet. Anything there needs a category.',
      'Plow back is 75% of a month\'s profit and only when the month made money. It shows next month as money available for ads, not as revenue.',
    ],
  }
}
