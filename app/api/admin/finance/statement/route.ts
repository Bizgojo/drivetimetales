// FINANCE-STATEMENT-001 — GET /api/admin/finance/statement?basis=cash|accrual&period=d1|d7|d30|custom|monthly&from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin-only, read-only. Loads Mercury transactions (finance_transactions), vendor rules,
// overrides, campaigns, paid users, published episodes and the Stripe ledger, then runs the pure engine.
import { NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { buildStatement, windowsFor, type Basis } from '@/lib/finance/statement'

export const dynamic = 'force-dynamic'

async function allWhere(table: string, columns: string, order: string, where: (q: any) => any) {
  const out: any[] = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await where(db().from(table).select(columns)).order(order, { ascending: true }).order('id', { ascending: true }).range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if ((data || []).length < 1000) return out
  }
  throw new Error(`${table}: more than 50,000 rows`)
}

async function all(table: string, columns: string, order: string) {
  const out: any[] = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db().from(table).select(columns).order(order, { ascending: true }).range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if ((data || []).length < 1000) return out
  }
  throw new Error(`${table}: more than 50,000 rows`)
}

// Tables added after launch: until their migration and first sync run, show the statement without them.
async function optional(p: Promise<any[]>) { try { return await p } catch { return [] as any[] } }

export async function GET(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  try {
    const url = new URL(request.url)
    const basis: Basis = url.searchParams.get('basis') === 'accrual' ? 'accrual' : 'cash'
    const period = ['d1', 'd7', 'd30', 'custom', 'monthly'].includes(url.searchParams.get('period') || '') ? url.searchParams.get('period')! : 'd30'
    const now = new Date()
    const windows = windowsFor(period, now, url.searchParams.get('from'), url.searchParams.get('to'))
    const [txns, rules, overrides, campaigns, users, storyRows, series, sync, pipelineClaudeDaily, elDaily, elPlans, storyCharRows, stripe] = await Promise.all([
      all('finance_transactions', 'id,posted_at,amount,status,kind,counterparty,bank_description,card,note', 'posted_at'),
      all('finance_vendor_rules', '*', 'priority'),
      all('finance_txn_overrides', '*', 'txn_id'),
      all('finance_campaigns', '*', 'start_date'),
      all('users', 'id,is_test_account,trial_started_at,first_paid_date,cancelled_at,billing_cycle,utm_campaign', 'id'),
      allWhere('stories', 'id,series_id,published_on,title', 'published_on', q => q.eq('status', 'published').not('published_on', 'is', null).eq('is_hidden', false)),
      all('series', 'id,title', 'id'),
      db().from('finance_transactions').select('synced_at').order('synced_at', { ascending: false }).limit(1).then(r => r.data?.[0]?.synced_at || null),
      all('finance_pipeline_claude_daily', 'day,usd', 'day'),
      optional(all('finance_el_daily', 'day,credits', 'day')),
      optional(all('finance_el_plan', 'captured_on,tier,credit_limit,monthly_price_usd', 'captured_on')),
      optional(all('finance_story_chars', 'id,chars', 'id')),
      optional(all('finance_stripe_txns', 'id,created_at,type,reporting_category,amount,fee,net,description,interval,customer_email', 'created_at')),
    ])
    const seriesTitle = new Map(series.map((x: any) => [x.id, x.title]))
    const stories = storyRows.map((x: any) => ({ ...x, series_title: x.series_id ? seriesTitle.get(x.series_id) ?? null : null }))
    const statement = buildStatement({ basis, windows, txns, rules, overrides, users, stories, campaigns, now, pipelineClaudeDaily, stripe: stripe.map((x: any) => ({ ...x, amount: Number(x.amount), fee: Number(x.fee), net: Number(x.net) })),
      elDaily: elDaily.map((x: any) => ({ day: x.day, credits: Number(x.credits) })),
      elPlans: elPlans.map((x: any) => ({ ...x, credit_limit: x.credit_limit == null ? null : Number(x.credit_limit), monthly_price_usd: x.monthly_price_usd == null ? null : Number(x.monthly_price_usd) })),
      storyChars: Object.fromEntries(storyCharRows.map((x: any) => [x.id, Number(x.chars)])) })
    return NextResponse.json({ ...statement, period, lastSynced: sync, generatedAt: now.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof RangeError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Statement unavailable' }, { status: 503 })
  }
}
