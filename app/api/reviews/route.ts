import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { story_id, user_id, rating, review_text } = await req.json()
    if (!story_id || !user_id || !rating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const { error } = await supabase.from('reviews').insert({ story_id, user_id, rating, review_text: review_text || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
