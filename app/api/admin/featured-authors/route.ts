import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('genre_curations')
    .select(`
      genre,
      slot,
      style_reference,
      style_description,
      author:authors (
        id,
        name,
        primary_genre,
        secondary_genre,
        narrative_voice
      ),
      narrator:narrator_voices (
        id,
        name
      )
    `)
    .eq('is_active', true)
    .order('genre', { ascending: true })
    .order('slot', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const grouped: Record<string, any[]> = {}

  for (const row of data || []) {
    const genre = row.genre || 'Unknown'
    if (!grouped[genre]) grouped[genre] = []
    grouped[genre].push({
      id: row.author?.id,
      name: row.author?.name,
      primary_genre: row.genre,
      secondary_genre: row.author?.secondary_genre,
      narrative_voice: row.author?.narrative_voice,
      style_reference: row.style_reference,
      style_description: row.style_description,
      narrator_name: row.narrator?.name || null,
      slot: row.slot,
    })
  }

  return NextResponse.json({
    success: true,
    genres: Object.keys(grouped).sort(),
    grouped,
  })
}
