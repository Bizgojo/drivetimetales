import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AuthorRow = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  genre?: string | null
  narrative_voice?: string | null
  tone?: string | null
  pacing?: string | null
  signature?: string | null
  style_reference?: string | null
  style_description?: string | null
  style_book_type?: string | null
  style_signature_trait?: string | null
  style_author_living?: boolean | null
  style_author_death_year?: number | null
  narrator_id?: string | null
  narrator_voice_id?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

export async function GET() {
  const { data: authors, error } = await supabase
    .from('authors')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const authorRows = ((authors || []) as AuthorRow[]).filter(a => a.is_active !== false)

  const narratorIds = Array.from(
    new Set(
      authorRows
        .map(a => a.narrator_voice_id || a.narrator_id || null)
        .filter(Boolean)
    )
  ) as string[]

  let narratorMap: Record<string, string> = {}

  if (narratorIds.length > 0) {
    const { data: narrators, error: narrError } = await supabase
      .from('narrator_voices')
      .select('id,name')
      .in('id', narratorIds)

    if (narrError) {
      return NextResponse.json({ success: false, error: narrError.message }, { status: 500 })
    }

    narratorMap = Object.fromEntries((narrators || []).map((n: any) => [n.id, n.name]))
  }

  const byGenreCount: Record<string, number> = {}

  const limited = authorRows
    .sort((a, b) => {
      const ga = (a.primary_genre || a.genre || '').toLowerCase()
      const gb = (b.primary_genre || b.genre || '').toLowerCase()
      if (ga !== gb) return ga.localeCompare(gb)

      const सा = a.sort_order ?? 9999
      const sb = b.sort_order ?? 9999
      if (सा !== sb) return सा - sb

      return (a.name || '').localeCompare(b.name || '')
    })
    .filter((a) => {
      const genre = a.primary_genre || a.genre || 'Unknown'
      byGenreCount[genre] = byGenreCount[genre] || 0
      if (byGenreCount[genre] >= 3) return false
      byGenreCount[genre] += 1
      return true
    })
    .map((a) => {
      const narratorKey = a.narrator_voice_id || a.narrator_id || null
      return {
        ...a,
        narrator_name: narratorKey ? narratorMap[narratorKey] || null : null,
      }
    })

  return NextResponse.json({ success: true, authors: limited })
}
