import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// MARC-PUBLISHED-GENRE-001 (2026-10-05): the Published Stories admin page
// (app/admin/stories/page.tsx) needs to fix a wrong genre (e.g. "The
// Seedlight" showing "Learn" instead of "Sci-Fi") without routing through
// the production workflow-state machine — genre is plain metadata on
// `stories`, not a governed transition. This is a narrow, single-purpose
// writer: it only ever touches stories.genre.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

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

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const body = await req.json()
    const storyId = String(body.storyId || '').trim()
    const genre = String(body.genre || '').trim()

    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    if (!genre) return NextResponse.json({ success: false, error: 'genre required' }, { status: 400 })

    // Only allow genres from the live taxonomy (prevents another stray
    // value like "Learn" from slipping back in through this path).
    const { data: genreRows, error: genreError } = await supabase
      .from('genres')
      .select('name')
      .eq('active', true)

    if (genreError) return NextResponse.json({ success: false, error: genreError.message }, { status: 500 })

    const validNames = new Set((genreRows || []).map((row: any) => String(row.name || '').trim()))
    if (!validNames.has(genre)) {
      return NextResponse.json({ success: false, error: `"${genre}" is not an active genre` }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('stories')
      .update({ genre })
      .eq('id', storyId)
      .select('id,genre')
      .maybeSingle()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 })

    return NextResponse.json({ success: true, story: data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to update genre' }, { status: 500 })
  }
}
