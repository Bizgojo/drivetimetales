import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { geographicMatch, normalizeState } from '@/lib/geographicRecommendations'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'private, no-store' }

/** Read-only: return relevance scores, never scripts or profile details. */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const db = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )
    const { data: { user }, error: authError } = await db.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

    const body = await req.json().catch(() => null)
    if (!Array.isArray(body?.storyIds) || body.storyIds.length > 100 ||
      body.storyIds.some((id: unknown) => typeof id !== 'string' || !UUID.test(id))) {
      return NextResponse.json({ error: 'Expected up to 100 story UUIDs' }, { status: 400, headers })
    }
    const storyIds = Array.from(new Set(body.storyIds as string[]))
    if (!storyIds.length) return NextResponse.json({ matches: {} }, { headers })

    // Identity always comes from validated auth, never a supplied user ID.
    const { data: profile, error: profileError } = await db.from('users').select('state').eq('id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (!normalizeState(profile?.state)) return NextResponse.json({ matches: {} }, { headers })

    const { data: stories, error } = await db.from('stories')
      .select('id,title,description,script')
      .in('id', storyIds).eq('status', 'published').eq('is_hidden', false)
    if (error) throw error
    const matches: Record<string, number> = {}
    for (const story of stories || []) {
      // city is optional, user-entered preference metadata (not authorization).
      // No city column is assumed: the current users schema stores state only.
      const match = geographicMatch([story.title, story.description, story.script].filter(Boolean).join('\n'), {
        state: profile.state,
        city: user.user_metadata?.city,
      })
      if (match) matches[story.id] = match
    }
    return NextResponse.json({ matches }, { headers })
  } catch {
    return NextResponse.json({ error: 'Location recommendations unavailable' }, { status: 503, headers })
  }
}
