import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'monthly'    // monthly | daily | byRoute
  const year = parseInt(searchParams.get('year') || '2026')

  if (view === 'monthly') {
    // Total cost + tokens per calendar month
    const { data, error } = await supabase.rpc('anthropic_monthly_summary', { p_year: year })
    if (error) {
      // Fallback: raw query via REST
      const start = `${year}-01-01`
      const end   = `${year + 1}-01-01`
      const { data: rows } = await supabase
        .from('anthropic_usage_log')
        .select('created_at, input_tokens, output_tokens, cost_usd')
        .gte('created_at', start)
        .lt('created_at', end)

      // Aggregate by month in JS
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        calls: 0,
      }))
      for (const r of (rows ?? [])) {
        const m = new Date(r.created_at).getMonth()
        monthly[m].input_tokens += r.input_tokens
        monthly[m].output_tokens += r.output_tokens
        monthly[m].cost_usd += parseFloat(r.cost_usd)
        monthly[m].calls += 1
      }
      return NextResponse.json({ view: 'monthly', year, data: monthly })
    }
    return NextResponse.json({ view: 'monthly', year, data })
  }

  if (view === 'daily') {
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const end   = month < 12
      ? `${year}-${String(month + 1).padStart(2,'0')}-01`
      : `${year + 1}-01-01`

    const { data: rows } = await supabase
      .from('anthropic_usage_log')
      .select('created_at, input_tokens, output_tokens, cost_usd, route, purpose')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })

    return NextResponse.json({ view: 'daily', year, month, data: rows ?? [] })
  }

  if (view === 'byRoute') {
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const end   = month < 12
      ? `${year}-${String(month + 1).padStart(2,'0')}-01`
      : `${year + 1}-01-01`

    const { data: rows } = await supabase
      .from('anthropic_usage_log')
      .select('route, purpose, model, input_tokens, output_tokens, cost_usd')
      .gte('created_at', start)
      .lt('created_at', end)

    // Aggregate by route
    const byRoute: Record<string, { calls: number; input: number; output: number; cost: number }> = {}
    for (const r of (rows ?? [])) {
      const key = r.purpose || r.route || 'unknown'
      if (!byRoute[key]) byRoute[key] = { calls: 0, input: 0, output: 0, cost: 0 }
      byRoute[key].calls += 1
      byRoute[key].input += r.input_tokens
      byRoute[key].output += r.output_tokens
      byRoute[key].cost += parseFloat(r.cost_usd)
    }
    return NextResponse.json({
      view: 'byRoute', year, month,
      data: Object.entries(byRoute)
        .map(([purpose, v]) => ({ purpose, ...v }))
        .sort((a, b) => b.cost - a.cost),
    })
  }

  return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
}
