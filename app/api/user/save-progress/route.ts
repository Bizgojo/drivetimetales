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

/**
 * POST /api/user/save-progress
 *
 * Keepalive-safe progress flush endpoint. Called from CanonicalPlayer's
 * pagehide handler so progress is saved even when the user closes the tab
 * before the 5-second timeupdate debounce fires.
 *
 * Payload (JSON, must stay < 64 KB for keepalive):
 *   storyId     string   — UUID of the story being played
 *   progress    number   — playback position in seconds (floor integer)
 *   durationSecs? number — total audio duration in seconds (optional)
 *
 * Preservation rules:
 *   - Only updates an EXISTING user_library row (never creates one)
 *   - progress is saved only if incoming > existing (never downgrade)
 *   - completed=true is never changed back to false
 *   - hide_from_home is never touched
 *   - not_for_me is never touched
 *   - Guest / unauthenticated requests are rejected with 401
 */
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // ── Validate storyId ────────────────────────────────────────────────────
    const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : ''
    if (!storyId || !UUID_RE.test(storyId)) {
      return NextResponse.json({ error: 'Invalid or missing storyId' }, { status: 400 })
    }

    // ── Validate progress ───────────────────────────────────────────────────
    const rawProgress = Number(body.progress)
    if (!Number.isFinite(rawProgress) || rawProgress < 0) {
      return NextResponse.json({ error: 'Invalid progress value' }, { status: 400 })
    }
    // Clamp: never save more than 24 hours of playback
    const incomingProgress = Math.floor(Math.min(rawProgress, 86_400))

    // ── Optional durationSecs (informational only, not persisted here) ───────
    const rawDuration = Number(body.durationSecs ?? 0)
    const durationSecs = Number.isFinite(rawDuration) && rawDuration > 0
      ? Math.floor(rawDuration)
      : null

    // If progress is effectively zero, nothing useful to save
    if (incomingProgress <= 0) {
      return NextResponse.json({ success: true, skipped: 'zero_progress' })
    }

    const supabase = adminClient()

    // ── Load existing row (must already exist — pagehide never creates rows) ─
    const { data: existing, error: fetchError } = await supabase
      .from('user_library')
      .select('story_id, progress, completed, hide_from_home, not_for_me')
      .eq('user_id', user.id)
      .eq('story_id', storyId)
      .maybeSingle()

    if (fetchError) {
      console.error('[save-progress] fetch existing row failed:', fetchError.message)
      return NextResponse.json({ error: 'Failed to load existing progress' }, { status: 500 })
    }

    if (!existing) {
      // No row — nothing to update; pagehide save never creates rows
      return NextResponse.json({ success: true, skipped: 'no_existing_row' })
    }

    // ── Preservation rules ──────────────────────────────────────────────────

    // Rule 1: never revert completed
    if (existing.completed) {
      // Episode is already completed — nothing to downgrade; update last_played only
      const { error: touchErr } = await supabase
        .from('user_library')
        .update({ last_played: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('story_id', storyId)
      if (touchErr) console.warn('[save-progress] last_played touch failed:', touchErr.message)
      return NextResponse.json({ success: true, skipped: 'already_completed' })
    }

    // Rule 2: never downgrade progress
    const existingProgress = typeof existing.progress === 'number' ? existing.progress : 0
    if (incomingProgress <= existingProgress) {
      // Incoming is stale or same — still update last_played so we know a session occurred
      const { error: touchErr } = await supabase
        .from('user_library')
        .update({ last_played: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('story_id', storyId)
      if (touchErr) console.warn('[save-progress] last_played touch failed:', touchErr.message)
      return NextResponse.json({ success: true, skipped: 'not_higher_progress' })
    }

    // Incoming progress is higher — determine if the episode is now complete.
    // Only mark complete when playback reached ≥ 95% of known duration
    // (matches the pattern the player uses for saveProgress(t, done=true)).
    const isNowComplete = durationSecs !== null && durationSecs > 0
      ? incomingProgress >= durationSecs * 0.95
      : false

    // Rule 3: hide_from_home and not_for_me — do NOT touch
    const { error: updateError } = await supabase
      .from('user_library')
      .update({
        progress:    incomingProgress,
        completed:   isNowComplete,
        last_played: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('story_id', storyId)

    if (updateError) {
      console.error('[save-progress] update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
    }

    return NextResponse.json({
      success:   true,
      saved:     incomingProgress,
      completed: isNowComplete,
    })
  } catch (err: any) {
    console.error('[save-progress] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
