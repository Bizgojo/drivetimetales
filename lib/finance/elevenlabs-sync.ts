// FINANCE-STATEMENT-004 — copy ElevenLabs credit usage (per day) and the plan's price into
// finance_el_daily / finance_el_plan. Read-only against ElevenLabs.
import type { SupabaseClient } from '@supabase/supabase-js'

const BASE = 'https://api.elevenlabs.io/v1'
async function get(path: string, key: string) {
  const r = await fetch(BASE + path, { headers: { 'xi-api-key': key, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`ElevenLabs ${path.split('?')[0]} → HTTP ${r.status}`)
  return r.json()
}

/** Daily credits from GET /v1/usage/character-stats: { time: [ms…], usage: { <breakdown>: [n…] } } */
export function dailyFromStats(stats: any): { day: string; credits: number }[] {
  const times: number[] = stats?.time || []
  const series: number[][] = Object.values(stats?.usage || {}) as number[][]
  return times.map((t, i) => ({ day: new Date(t).toISOString().slice(0, 10), credits: series.reduce((a, s) => a + Number(s?.[i] || 0), 0) }))
}

/** Monthly price from the subscription: the next invoice (÷12 when billed yearly), or null if not shown. */
export function planFromSubscription(sub: any, manualMonthlyPrice?: number | null) {
  const cents = sub?.next_invoice?.amount_due_cents
  const yearly = /year|annual/i.test(sub?.billing_period || '')
  const fromInvoice = typeof cents === 'number' && cents > 0 ? (cents / 100) / (yearly ? 12 : 1) : null
  const price = manualMonthlyPrice ?? fromInvoice
  return {
    tier: sub?.tier ?? null,
    credit_limit: sub?.character_limit ?? null,
    monthly_price_usd: price,
    billing_period: sub?.billing_period ?? null,
    price_source: manualMonthlyPrice != null ? 'manual' : fromInvoice != null ? 'next_invoice' : null,
  }
}

export async function syncElevenLabs(supabase: SupabaseClient, opts: { key: string; since: string; monthlyPrice?: number | null; dryRun?: boolean; log?: (s: string) => void }) {
  const log = opts.log || (() => {})
  const start = Date.parse(opts.since + 'T00:00:00Z'), end = Date.now()
  const stats = await get(`/usage/character-stats?start_unix=${start}&end_unix=${end}&aggregation_interval=day`, opts.key)
  const days = dailyFromStats(stats).map(d => ({ ...d, synced_at: new Date().toISOString() }))
  const sub = await get('/user/subscription', opts.key)
  const plan = { captured_on: new Date().toISOString().slice(0, 10), ...planFromSubscription(sub, opts.monthlyPrice), synced_at: new Date().toISOString() }
  log(`${days.length} days of credit usage since ${opts.since}; plan ${plan.tier} ${plan.credit_limit} credits at ${plan.monthly_price_usd ?? 'UNKNOWN'} $/month (${plan.price_source ?? 'no price'})`)
  if (opts.dryRun) return { days: days.length, plan }
  const a = await supabase.from('finance_el_daily').upsert(days, { onConflict: 'day' })
  if (a.error) throw new Error('finance_el_daily upsert: ' + a.error.message)
  const b = await supabase.from('finance_el_plan').upsert(plan, { onConflict: 'captured_on' })
  if (b.error) throw new Error('finance_el_plan upsert: ' + b.error.message)
  return { days: days.length, plan }
}
