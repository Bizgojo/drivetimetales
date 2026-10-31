import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// UUID v4 pattern — basic guard against injected values
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase service environment')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function currentUser() {
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
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/** Save the latest listening observation, including rewinds and zero.
 * The caller is authenticated; all reads/writes are scoped to that user.
 * Completion is earned only by the player's natural-end path, never by
 * closing the app near the end. Existing completion/dismissal flags persist.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : ''
    if (!UUID_RE.test(storyId)) return NextResponse.json({ error: 'Invalid or missing storyId' }, { status: 400 })
    const rawProgress = Number(body.progress)
    if (body.progress == null || !Number.isFinite(rawProgress) || rawProgress < 0) {
      return NextResponse.json({ error: 'Invalid progress value' }, { status: 400 })
    }
    const progress = Math.floor(Math.min(rawProgress, 86_400))
    const hasObservation = typeof body.observedAt === 'string'
    const observedMs = hasObservation ? Date.parse(body.observedAt as string) : Date.now()
    if (!Number.isFinite(observedMs) || observedMs > Date.now() + 60_000) {
      return NextResponse.json({ error: 'Invalid observation time' }, { status: 400 })
    }
    const observedAt = new Date(observedMs).toISOString()
    const supabase = adminClient()
    const { data: existing, error } = await supabase.from('user_library')
      .select('story_id,progress,completed,last_played').eq('user_id', user.id).eq('story_id', storyId).maybeSingle()
    if (error) return NextResponse.json({ error: 'Failed to load existing progress' }, { status: 500 })

    // Legacy close-time requests have no observation timestamp. They may
    // advance progress, but cannot overwrite a deliberate newer rewind/reset.
    if (existing && !hasObservation && progress <= Number(existing.progress || 0)) {
      return NextResponse.json({ success: true, skipped: 'legacy_not_newer' })
    }
    if (existing && hasObservation && Date.parse(existing.last_played || '') > observedMs) {
      return NextResponse.json({ success: true, skipped: 'stale_observation' })
    }
    const patch: Record<string, unknown> = { progress, last_played: observedAt }
    if (body.completed === true) patch.completed = true
    if (!existing) {
      const { error: insertError } = await supabase.from('user_library').insert({
        user_id: user.id, story_id: storyId, completed: body.completed === true,
        hide_from_home: false, not_for_me: false, ...patch,
      })
      if (!insertError) return NextResponse.json({ success: true, saved: progress, created: true })
      // Another save may have created the row while this request was in flight.
      if (insertError.code !== '23505') return NextResponse.json({ error: 'Failed to create progress' }, { status: 500 })
    }
    // The timestamp guard is part of the UPDATE itself: an older in-flight
    // save must not win if a newer pause/seek arrived after our SELECT.
    const { data: saved, error: updateError } = await supabase.from('user_library')
      .update(patch).eq('user_id', user.id).eq('story_id', storyId)
      .or(`last_played.is.null,last_played.lte.${observedAt}`)
      .select('progress,completed').maybeSingle()
    if (updateError) return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
    return NextResponse.json(saved
      ? { success: true, saved: saved.progress, completed: saved.completed }
      : { success: true, skipped: 'stale_observation' })
  } catch (err) {
    console.error('[save-progress] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
