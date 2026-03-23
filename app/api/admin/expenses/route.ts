import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/expenses?year=2026&month=3
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  || '2026')
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null

  let q = supabase.from('expenses_log').select('*').eq('year', year).order('expense_date', { ascending: false })
  if (month) q = q.eq('month', month)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Roll up by vendor for the month totals
  const byVendor: Record<string, number> = {}
  const byMonth: Record<number, number> = {}
  for (const row of (data ?? [])) {
    byVendor[row.vendor] = (byVendor[row.vendor] || 0) + parseFloat(row.amount_usd)
    byMonth[row.month]   = (byMonth[row.month]   || 0) + parseFloat(row.amount_usd)
  }

  return NextResponse.json({ data, byVendor, byMonth, year, month })
}

// POST /api/admin/expenses  — add expense entry
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { vendor, category, description, amount_usd, expense_date, entry_type } = body
  if (!vendor || !amount_usd) return NextResponse.json({ error: 'vendor and amount_usd required' }, { status: 400 })

  const { data, error } = await supabase.from('expenses_log').insert({
    vendor,
    category: category || 'Other',
    description: description || '',
    amount_usd: parseFloat(amount_usd),
    expense_date: expense_date || new Date().toISOString().split('T')[0],
    entry_type: entry_type || 'manual',
  }).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/expenses?id=uuid
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('expenses_log').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
