import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const genre = searchParams.get('genre')
  const { data, error } = await supabase.from('narrator_voices').select('*').eq('is_active', true).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let narrators = data || []
  if (genre) narrators = narrators.sort((a: any, b: any) => (a.best_genres?.includes(genre) ? 0 : 1) - (b.best_genres?.includes(genre) ? 0 : 1))
  return NextResponse.json({ narrators })
}
