import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns all stories from the main stories table suitable for the landing library
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('id, title, genre, author, duration_mins, cover_url, audio_url, status')
      .order('published_on', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ success: true, stories: data || [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
