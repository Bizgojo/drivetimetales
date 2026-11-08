// FINANCE-STATEMENT-001 — GET /api/admin/finance/statement?basis=cash|accrual&period=d1|d7|d30|custom|monthly&from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin-only, read-only. Loads Mercury transactions (finance_transactions), vendor rules,
// overrides, campaigns, paid users, published episodes and the Stripe ledger, then runs the pure engine.
import { NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { type Basis } from '@/lib/finance/statement'
import { loadStatement } from '@/lib/finance/load-statement'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  try {
    const url = new URL(request.url)
    const basis: Basis = url.searchParams.get('basis') === 'accrual' ? 'accrual' : 'cash'
    const period = ['d1', 'd7', 'd30', 'custom', 'monthly'].includes(url.searchParams.get('period') || '') ? url.searchParams.get('period')! : 'd30'
    const data = await loadStatement({ basis, period, from: url.searchParams.get('from'), to: url.searchParams.get('to') })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof RangeError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Statement unavailable' }, { status: 503 })
  }
}
