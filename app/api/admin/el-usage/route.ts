import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') // YYYY-MM-DD
  const end   = searchParams.get('end')   // YYYY-MM-DD

  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start or end date' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('el_usage_log')
    .select('id, usage_date, story_title, chars_used, chars_included, chars_overage, cost_overage, model, notes')
    .gte('usage_date', start)
    .lte('usage_date', end)
    .order('usage_date', { ascending: true })

  if (error) {
    // Table may not exist yet — return empty gracefully
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
      return NextResponse.json({ rows: [], note: 'Table not yet created — run SQL in Supabase' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data || [] })
}
