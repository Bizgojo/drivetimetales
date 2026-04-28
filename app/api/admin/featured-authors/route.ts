import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type DbGenre = {
  id: string
  name: string
}

type DbAuthor = {
  id: string
  name: string
  genre?: string | null
  primary_genre?: string | null
  secondary_genre?: string | null
  narrative_voice?: string | null
  style_reference?: string | null
  style_description?: string | null
  narrator_id?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

type FeaturedAuthor = {
  id: string
  name: string
  primary_genre: string
  secondary_genre?: string | null
  narrative_voice?: string | null
  style_reference: string
  style_description: string
  narrator_id?: string | null
  narrator_name: string
  narrator_elevenlabs_voice_id?: string | null
  slot: number
}

type CurationRow = {
  genre?: string | null
  slot?: number | null
  style_reference?: string | null
  style_description?: string | null
  author?: DbAuthor | DbAuthor[] | null
  narrator?: { id: string; name: string; elevenlabs_voice_id?: string | null } | { id: string; name: string; elevenlabs_voice_id?: string | null }[] | null
}

const GENRE_ALIASES: Record<string, string[]> = {
  Historical: ['Historical Drama'],
  Learn: ['Get Smarter', 'Non-Fiction'],
  Mystery: ['Mystery/Crime', 'Dark Mystery', 'Noir', 'Crime'],
  Classics: ['Literary'],
}

function norm(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function valuesForGenre(genre: string) {
  return [genre, ...(GENRE_ALIASES[genre] || [])].map(norm).filter(Boolean)
}

function canonicalGenreName(value: string | null | undefined, dbGenres: string[]) {
  const normalized = norm(value)
  const exact = dbGenres.find((g) => norm(g) === normalized)
  if (exact) return exact

  return dbGenres.find((genre) => valuesForGenre(genre).includes(normalized)) || null
}

function matchesGenre(author: DbAuthor, genre: string) {
  const targets = valuesForGenre(genre)
  const authorGenres = [author.genre, author.primary_genre, author.secondary_genre].map(norm)
  return authorGenres.some((g) => targets.includes(g))
}

function buildAuthorCard(
  author: DbAuthor,
  genre: string,
  narrator: { id?: string | null; name?: string | null; elevenlabs_voice_id?: string | null } | null | undefined,
  slot: number,
  styleReference?: string | null,
  styleDescription?: string | null
): FeaturedAuthor | null {
  const reference = String(styleReference || author.style_reference || '').trim()
  const description = String(styleDescription || author.style_description || '').trim()
  const narratorName = String(narrator?.name || '').trim()

  if (!author.id || !author.name || !reference || !description || !narratorName) return null

  return {
    id: author.id,
    name: author.name,
    primary_genre: genre,
    secondary_genre: author.secondary_genre,
    narrative_voice: author.narrative_voice,
    style_reference: reference,
    style_description: description,
    narrator_id: narrator?.id || author.narrator_id || null,
    narrator_name: narratorName,
    narrator_elevenlabs_voice_id: narrator?.elevenlabs_voice_id || null,
    slot,
  }
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null
}

export async function GET() {
  const { data: genres, error: genresError } = await supabase
    .from('genres')
    .select('id,name')
    .order('name', { ascending: true })

  if (genresError) {
    return NextResponse.json({ success: false, error: genresError.message }, { status: 500 })
  }

  const genreNames = ((genres || []) as DbGenre[]).map((g) => g.name).filter(Boolean)

  const { data: curations, error: curationsError } = await supabase
    .from('genre_curations')
    .select(`
      genre,
      slot,
      style_reference,
      style_description,
      author:authors (
        id,
        name,
        genre,
        primary_genre,
        secondary_genre,
        narrative_voice,
        style_reference,
        style_description,
        narrator_id,
        sort_order,
        is_active
      ),
      narrator:narrator_voices (
        id,
        name,
        elevenlabs_voice_id
      )
    `)
    .eq('is_active', true)
    .order('genre', { ascending: true })
    .order('slot', { ascending: true })

  if (curationsError) {
    return NextResponse.json({ success: false, error: curationsError.message }, { status: 500 })
  }

  const { data: authors, error: authorsError } = await supabase
    .from('authors')
    .select('id,name,genre,primary_genre,secondary_genre,narrative_voice,style_reference,style_description,narrator_id,sort_order,is_active')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (authorsError) {
    return NextResponse.json({ success: false, error: authorsError.message }, { status: 500 })
  }

  const activeAuthors = ((authors || []) as DbAuthor[]).filter((author) => author.is_active !== false)
  const narratorIds = Array.from(new Set(activeAuthors.map((author) => author.narrator_id).filter(Boolean))) as string[]
  let narratorMap: Record<string, { id: string; name: string; elevenlabs_voice_id?: string | null }> = {}

  if (narratorIds.length > 0) {
    const { data: narrators, error: narratorsError } = await supabase
      .from('narrator_voices')
      .select('id,name,elevenlabs_voice_id')
      .in('id', narratorIds)

    if (narratorsError) {
      return NextResponse.json({ success: false, error: narratorsError.message }, { status: 500 })
    }

    narratorMap = Object.fromEntries((narrators || []).map((n: any) => [n.id, n]))
  }

  const grouped: Record<string, FeaturedAuthor[]> = Object.fromEntries(genreNames.map((genre) => [genre, []]))

  for (const row of (curations || []) as CurationRow[]) {
    const genre = canonicalGenreName(row.genre, genreNames)
    const author = firstRelation(row.author)
    const narrator = firstRelation(row.narrator)
    if (!genre || grouped[genre].length >= 3 || !author || author.is_active === false) continue

    const card = buildAuthorCard(
      author,
      genre,
      narrator || (author.narrator_id ? narratorMap[author.narrator_id] : null),
      row.slot || grouped[genre].length + 1,
      row.style_reference,
      row.style_description
    )

    if (card && !grouped[genre].some((author) => author.id === card.id)) {
      grouped[genre].push(card)
    }
  }

  for (const genre of genreNames) {
    const matchingAuthors = activeAuthors.filter((author) => matchesGenre(author, genre))
    const fallbackAuthors = activeAuthors.filter((author) => !matchesGenre(author, genre))

    for (const author of [...matchingAuthors, ...fallbackAuthors]) {
      if (grouped[genre].length >= 3) break
      if (grouped[genre].some((existing) => existing.id === author.id)) continue

      const card = buildAuthorCard(
        author,
        genre,
        author.narrator_id ? narratorMap[author.narrator_id] : null,
        grouped[genre].length + 1
      )

      if (card) grouped[genre].push(card)
    }
  }

  return NextResponse.json({
    success: true,
    genres: genreNames,
    grouped,
  })
}
