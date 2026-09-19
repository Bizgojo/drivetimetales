/**
 * /api/offline/license — OFFLINE-DL-001
 *
 * GET (Authorization: Bearer <access token>)
 *   → { license }                     re-verify + extend the offline license
 * GET ?storyId=<id>
 *   → { license, allowed, reason?, story }   may this user download this story?
 *
 * Download is allowed when the story is is_free OR the user is entitled
 * (lib/entitlement isEntitled — the same predicate the app's access checks
 * use). Read-only: never writes to the database.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isEntitled } from '@/lib/entitlement'
import { computeOfflineLicense } from '@/lib/offline/license'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same admin bypass as the player paywall (components/player/CanonicalPlayer.tsx)
// and middleware.ts, so offline access matches online access.
const PAYWALL_BYPASS_EMAILS = new Set(['marc@endless-tales.com', 'm.postlewaite@gmail.com'])

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { data: dbUser, error: dbError } = await supabaseAdmin
    .from('users')
    .select('subscription_type, subscription_ends_at, cancelled_at')
    .eq('id', user.id)
    .maybeSingle()
  if (dbError) {
    console.error('[offline/license] users lookup failed:', dbError.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 503 })
  }

  const bypass = PAYWALL_BYPASS_EMAILS.has(String(user.email || '').toLowerCase())
  const entitled = bypass || isEntitled(dbUser?.subscription_type, dbUser?.subscription_ends_at)
  const license = computeOfflineLicense({
    userId: user.id,
    entitled,
    subscriptionEndsAt: bypass ? null : dbUser?.subscription_ends_at,
    cancelledAt: bypass ? null : dbUser?.cancelled_at,
  })

  const storyId = req.nextUrl.searchParams.get('storyId')
  if (!storyId) return NextResponse.json({ license })

  const { data: story, error: storyError } = await supabaseAdmin
    .from('stories')
    .select('id, title, author, series_id, series_name, episode_number, duration_mins, cover_url, is_free, status, is_hidden')
    .eq('id', storyId)
    .maybeSingle()
  if (storyError) return NextResponse.json({ error: 'lookup_failed' }, { status: 503 })
  if (!story || story.status !== 'published' || story.is_hidden) {
    return NextResponse.json({ license, allowed: false, reason: 'not_available' }, { status: 404 })
  }
  const allowed = Boolean(story.is_free) || entitled
  return NextResponse.json(
    {
      license,
      allowed,
      reason: allowed ? undefined : 'not_entitled',
      story: {
        id: story.id,
        title: story.title,
        author: story.author,
        seriesId: story.series_id,
        seriesName: story.series_name,
        episodeNumber: story.episode_number,
        durationMins: story.duration_mins,
        coverUrl: story.cover_url,
        isFree: Boolean(story.is_free),
      },
    },
    { status: allowed ? 200 : 403 }
  )
}
