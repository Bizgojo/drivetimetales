import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set(['marc@endless-tales.com', 'm.postlewaite@gmail.com'])

type GenreRow = {
  id: string
  name: string
  slug?: string | null
  description?: string | null
  color_hex?: string | null
  active?: boolean | null
  display_order?: number | null
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sortGenres(a: GenreRow, b: GenreRow) {
  const ao = Number(a.display_order ?? 0)
  const bo = Number(b.display_order ?? 0)
  if (ao !== bo) return ao - bo
  return String(a.name || '').localeCompare(String(b.name || ''))
}

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user?.email || !ADMIN_EMAILS.has(user.email)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

async function loadStoriesForCounts() {
  const { data, error } = await supabase
    .from('stories')
    .select('genre, genre_secondary, genre_third, status, published_on')

  if (error) throw error
  return data || []
}

function buildCounts(genres: GenreRow[], stories: any[]) {
  const counts: Record<string, { primary: number; secondary: number; tertiary: number; publishedPrimary: number }> = {}
  for (const genre of genres) counts[genre.name] = { primary: 0, secondary: 0, tertiary: 0, publishedPrimary: 0 }

  for (const story of stories) {
    const isPublished = story.status === 'published' || Boolean(story.published_on)
    if (story.genre && counts[story.genre]) {
      counts[story.genre].primary++
      if (isPublished) counts[story.genre].publishedPrimary++
    }
    if (story.genre_secondary && counts[story.genre_secondary]) counts[story.genre_secondary].secondary++
    if (story.genre_third && counts[story.genre_third]) counts[story.genre_third].tertiary++
  }

  return counts
}

async function loadGenres() {
  const { data, error } = await supabase.from('genres').select('*')
  if (error) throw error
  return ((data || []) as GenreRow[])
    .map((genre) => ({
      ...genre,
      slug: genre.slug || slugify(genre.name),
      active: genre.active !== false,
      display_order: Number(genre.display_order ?? 0),
    }))
    .sort(sortGenres)
}

export async function GET(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const activeOnly = req.nextUrl.searchParams.get('active') === 'true'
    const genres = await loadGenres()
    const visibleGenres = activeOnly ? genres.filter((genre) => genre.active !== false) : genres
    const stories = await loadStoriesForCounts()
    const counts = buildCounts(visibleGenres, stories)

    return NextResponse.json({
      success: true,
      genres: visibleGenres,
      counts,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to load genres' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const body = await req.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })

    const current = await loadGenres()
    if (current.some((genre) => genre.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Genre already exists' }, { status: 409 })
    }

    const nextOrder = current.reduce((max, genre) => Math.max(max, Number(genre.display_order || 0)), 0) + 1
    const payload = {
      name,
      slug: slugify(name),
      active: true,
      display_order: nextOrder,
    }

    let result = await supabase.from('genres').insert(payload).select('*').single()
    if (result.error && result.error.message.toLowerCase().includes('slug')) {
      const fallbackPayload = { name, active: true, display_order: nextOrder }
      result = await supabase.from('genres').insert(fallbackPayload).select('*').single()
    }

    if (result.error) throw result.error
    return NextResponse.json({ success: true, genre: result.data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to create genre' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const body = await req.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

    const update: Record<string, any> = {}
    if (typeof body.name === 'string' && body.name.trim()) {
      update.name = body.name.trim()
      update.slug = slugify(body.name)
    }
    if (typeof body.active === 'boolean') update.active = body.active
    if (body.display_order != null) update.display_order = Number(body.display_order)
    update.updated_at = new Date().toISOString()

    let result = await supabase.from('genres').update(update).eq('id', id).select('*').single()
    if (result.error && result.error.message.toLowerCase().includes('slug')) {
      const { slug, ...fallbackUpdate } = update
      result = await supabase.from('genres').update(fallbackUpdate).eq('id', id).select('*').single()
    }

    if (result.error) throw result.error
    return NextResponse.json({ success: true, genre: result.data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to update genre' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

    const genres = await loadGenres()
    const genre = genres.find((item) => item.id === id)
    if (!genre) return NextResponse.json({ success: false, error: 'Genre not found' }, { status: 404 })

    const stories = await loadStoriesForCounts()
    const counts = buildCounts(genres, stories)
    const count = counts[genre.name] || { primary: 0, secondary: 0, tertiary: 0, publishedPrimary: 0 }
    if (count.publishedPrimary > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete "${genre.name}" because it is the primary genre for ${count.publishedPrimary} published stories.` },
        { status: 409 }
      )
    }
    const total = count.primary + count.secondary + count.tertiary

    if (total > 0) {
      const { error } = await supabase
        .from('genres')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return NextResponse.json({ success: true, deactivated: true })
    }

    const { error } = await supabase.from('genres').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true, deleted: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to delete genre' }, { status: 500 })
  }
}
