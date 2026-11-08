// FINANCE-STATEMENT-001 — GET /api/admin/finance/statement?basis=cash|accrual&period=d1|d7|d30|custom|monthly&from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin-only, read-only. Loads Mercury transactions (finance_transactions), vendor rules,
// overrides, campaigns, paid users and published episodes, then runs the pure engine.
import { NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { buildStatement, windowsFor, type Basis } from '@/lib/finance/statement'

export const dynamic = 'force-dynamic'

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

export async function GET(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  try {
    const url = new URL(request.url)
    const basis: Basis = url.searchParams.get('basis') === 'accrual' ? 'accrual' : 'cash'
    const period = ['d1', 'd7', 'd30', 'custom', 'monthly'].includes(url.searchParams.get('period') || '') ? url.searchParams.get('period')! : 'd30'
    const now = new Date()
    const windows = windowsFor(period, now, url.searchParams.get('from'), url.searchParams.get('to'))
    const [txns, rules, overrides, campaigns, users, stories, sync, pipelineClaudeDaily] = await Promise.all([
      all('finance_transactions', 'id,posted_at,amount,status,kind,counterparty,bank_description,card,note', 'posted_at'),
      all('finance_vendor_rules', '*', 'priority'),
      all('finance_txn_overrides', '*', 'txn_id'),
      all('finance_campaigns', '*', 'start_date'),
      all('users', 'id,is_test_account,trial_started_at,first_paid_date,cancelled_at,billing_cycle,utm_campaign', 'id'),
      db().from('stories').select('id,series_id,published_on').eq('status', 'published').not('published_on', 'is', null).eq('is_hidden', false).limit(20000).then(r => { if (r.error) throw new Error('stories: ' + r.error.message); return r.data || [] }),
      db().from('finance_transactions').select('synced_at').order('synced_at', { ascending: false }).limit(1).then(r => r.data?.[0]?.synced_at || null),
      all('finance_pipeline_claude_daily', 'day,usd', 'day'),
    ])
    const statement = buildStatement({ basis, windows, txns, rules, overrides, users, stories, campaigns, now, pipelineClaudeDaily })
    return NextResponse.json({ ...statement, period, lastSynced: sync, generatedAt: now.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Statement unavailable' }, { status: 503 })
  }
}
