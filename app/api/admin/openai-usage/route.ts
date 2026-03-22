import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const view  = searchParams.get('view') || 'monthly'
  const year  = parseInt(searchParams.get('year') || '2026')
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

  const start = `${year}-01-01`
  const end   = `${year + 1}-01-01`

  if (view === 'monthly') {
    const { data: rows } = await supabase
      .from('openai_usage_log')
      .select('created_at, call_type, input_tokens, output_tokens, images_generated, cost_usd')
      .gte('created_at', start).lt('created_at', end)

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, dalle_images: 0, dalle_cost: 0, gpt_input: 0, gpt_output: 0, gpt_cost: 0, total_cost: 0,
    }))
    for (const r of (rows ?? [])) {
      const m = new Date(r.created_at).getMonth()
      const cost = parseFloat(r.cost_usd)
      if (r.call_type === 'image') {
        monthly[m].dalle_images += r.images_generated ?? 1
        monthly[m].dalle_cost += cost
      } else {
        monthly[m].gpt_input += r.input_tokens
        monthly[m].gpt_output += r.output_tokens
        monthly[m].gpt_cost += cost
      }
      monthly[m].total_cost += cost
    }
    return NextResponse.json({ view: 'monthly', year, data: monthly })
  }

  if (view === 'byPurpose') {
    const mStart = `${year}-${String(month).padStart(2,'0')}-01`
    const mEnd   = month < 12 ? `${year}-${String(month+1).padStart(2,'0')}-01` : `${year+1}-01-01`

    const { data: rows } = await supabase
      .from('openai_usage_log')
      .select('purpose, call_type, model, input_tokens, output_tokens, images_generated, cost_usd')
      .gte('created_at', mStart).lt('created_at', mEnd)

    const byPurpose: Record<string, { calls: number; images: number; input: number; output: number; cost: number; type: string }> = {}
    for (const r of (rows ?? [])) {
      const key = r.purpose || 'unknown'
      if (!byPurpose[key]) byPurpose[key] = { calls: 0, images: 0, input: 0, output: 0, cost: 0, type: r.call_type }
      byPurpose[key].calls += 1
      byPurpose[key].images += r.images_generated ?? 0
      byPurpose[key].input += r.input_tokens
      byPurpose[key].output += r.output_tokens
      byPurpose[key].cost += parseFloat(r.cost_usd)
    }
    return NextResponse.json({
      view: 'byPurpose', year, month,
      data: Object.entries(byPurpose)
        .map(([purpose, v]) => ({ purpose, ...v }))
        .sort((a, b) => b.cost - a.cost),
    })
  }

  return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
}
