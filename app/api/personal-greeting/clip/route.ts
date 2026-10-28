/**
 * PERS-LIVE-001 — GET /api/personal-greeting/clip?storyId=…&kind=series_intro|finale_signoff
 *
 * Same-origin audio URL placed in the player queue by story-playlist. The
 * listener's own first name comes from their account (never from the
 * request), so this cannot be used to make Belle say arbitrary text.
 *
 * Ready clip → 302 to the cached storage file.
 * Still generating → waits up to WAIT_MS (the announcement is playing).
 * Not ready / failed → series_intro falls back to a stock name opener clip
 * when one exists; otherwise 404, which the player already skips.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { isLiveGreetingKind, liveGreetingEnabledFor, spokenFirstName } from '@/lib/personalization/liveGreeting'
import { loadGreetingStory, waitForGreetingClip } from '@/lib/personalization/liveGreetingService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WAIT_MS = 12000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveRequestUser(req: NextRequest) {
  try {
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    return user || null
  } catch {
    return null
  }
}

function notAvailable(reason: string) {
  return NextResponse.json({ error: 'greeting unavailable', reason }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

function redirectTo(url: string) {
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}

async function stockOpenerUrl(pronunciationKey: string): Promise<string | null> {
  if (!pronunciationKey) return null
  const { data } = await supabase
    .from('name_opener_clips')
    .select('intro_audio_url')
    .eq('pronunciation_key', pronunciationKey)
    .not('intro_audio_url', 'is', null)
    .limit(25)
  const urls = ((data || []) as Array<{ intro_audio_url: string | null }>).map((row) => String(row.intro_audio_url || '')).filter(Boolean)
  if (!urls.length) return null
  return urls[Math.floor(Math.random() * urls.length)]
}

export async function GET(req: NextRequest) {
  const storyId = String(req.nextUrl.searchParams.get('storyId') || '').trim()
  const kind = req.nextUrl.searchParams.get('kind')
  if (!storyId || !isLiveGreetingKind(kind)) return notAvailable('bad_request')

  const user = await resolveRequestUser(req)
  if (!user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  if (!liveGreetingEnabledFor(user.id)) return notAvailable('disabled')

  const { data: profile } = await supabase
    .from('users')
    .select('first_name,display_name,name_pronunciation_key')
    .eq('id', user.id)
    .maybeSingle()
  const firstName = spokenFirstName((profile as any)?.first_name || (profile as any)?.display_name)
  const pronunciationKey = String((profile as any)?.name_pronunciation_key || '').trim()

  let story = null
  try {
    story = await loadGreetingStory(storyId)
  } catch (err) {
    console.warn('[personal-greeting] story lookup failed:', err instanceof Error ? err.message : String(err))
  }
  if (!story?.series_id) return notAvailable('not_series')
  if (kind === 'finale_signoff' && !story.series_is_finale) return notAvailable('not_finale')

  const url = firstName ? await waitForGreetingClip(story, kind, firstName, WAIT_MS) : null
  if (url) return redirectTo(url)

  if (kind === 'series_intro') {
    const fallback = await stockOpenerUrl(pronunciationKey).catch(() => null)
    if (fallback) {
      console.warn('[personal-greeting] live clip not ready; playing stock opener', { storyId, userId: user.id })
      return redirectTo(fallback)
    }
  }
  return notAvailable(firstName ? 'not_ready' : 'no_first_name')
}
