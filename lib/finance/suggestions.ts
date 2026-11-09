// FINANCE-STATEMENT-007 — Claude's monthly profit suggestions for Admin → Finance → Statement.
// Rule from Marc: every suggestion must keep story quality the same (no cheaper voices, no weaker
// script model, no shorter episodes).
import type { Statement } from './statement'

export interface Suggestion { title: string; detail: string; impact: string }

const money = (v: number | null | undefined) => v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2)

/** Compact, plain-text view of the monthly statement (last few months) for the prompt. */
export function summarize(st: Statement, lastN = 4): string {
  const n = st.columns.length, from = Math.max(0, n - lastN)
  const cols = st.columns.slice(from)
  const line = (label: string, vals: (number | null)[], f: (v: number | null) => string = money) => `${label}: ${vals.slice(from).map(f).join(' | ')}`
  const out: string[] = [`Months: ${cols.join(' | ')} (${st.basis} basis; last month is month-to-date)`, '', 'VOLUME & PRODUCTIVITY']
  for (const [k, v] of Object.entries(st.vp)) out.push(line(k, v, x => x == null ? '—' : /cost|CAC|spend|LTV|Run rate/i.test(k) ? money(x) : String(Math.round(x * 100) / 100)))
  out.push('', 'REVENUE')
  for (const [k, v] of Object.entries(st.revenue)) out.push(line(k, v))
  out.push(line('Net revenue (sales)', st.totals.revenue), '', 'COST OF REVENUE AND OPERATING EXPENSES (section / item — AI/service)')
  for (const it of st.items) out.push(line(`${it.section} / ${it.item}${it.ai_service ? ' — ' + it.ai_service : ''}`, it.values))
  out.push(line('Cost of revenue', st.totals.costOfRevenue), line('Gross profit', st.totals.grossProfit),
    line('Gross margin', st.totals.grossMargin, x => x == null ? '—' : Math.round(x * 100) + '%'),
    line('Operating expenses', st.totals.opex), line('Operating profit', st.totals.result))
  if (st.outsideOps) {
    out.push('', 'MONEY OUTSIDE OPERATIONS (not profit)')
    for (const p of st.outsideOps.investors) out.push(line(`Put in by ${p.name}`, p.values))
    out.push(line('Owner withdrawals', st.outsideOps.withdrawals))
    for (const [k, v] of Object.entries(st.outsideOps.lines)) out.push(line(k, v))
  }
  return out.join('\n')
}

export function buildPrompt(summary: string): string {
  return `You are the CFO advisor for Endless Tales, an AI-produced audio drama subscription app for drive-time listeners (monthly and annual plans, Meta ads for acquisition). Below is the company's financial statement by month.

Write 5 to 7 concrete suggestions to improve profitability. HARD RULE: story quality must not drop. Never suggest cheaper or fewer voices, a weaker script-writing model, shorter episodes, fewer quality checks, or less sound design. Prefer: removing waste and duplicate tools, pricing and plan mix, retention, ad efficiency, using credits already paid for, batching and caching on the same models, timing purchases, and fixing anything the numbers show is wrong or unexplained.

Base every suggestion on numbers in the statement and name them. Estimate the monthly dollar impact when you can; otherwise say what to measure. Plain English, no jargon, short.

Answer ONLY with a JSON array, no other text: [{"title": "...", "detail": "one or two sentences", "impact": "e.g. ≈ $120/mo or 'measure: ...'"}]

STATEMENT
${summary}`
}

/** Pull the JSON array out of the model's reply; tolerate code fences or stray text. */
export function parseSuggestions(text: string): Suggestion[] {
  const start = text.indexOf('['), end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('No suggestions in the reply')
  const arr = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(arr)) throw new Error('Suggestions were not a list')
  return arr.filter((x: any) => x && typeof x.title === 'string' && typeof x.detail === 'string')
    .slice(0, 8).map((x: any) => ({ title: String(x.title).slice(0, 160), detail: String(x.detail).slice(0, 600), impact: String(x.impact ?? '').slice(0, 120) }))
}
