import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { personalizeDebugWasCaptured, recordPersonalizeDebug, renderPersonalizedFinalMix } from '@/lib/personalizedFinalMix'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeFirstName(value?: string | null) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

async function resolveRequestUser(req: NextRequest) {
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  return user || null
}

async function lookupPreferredName(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('first_name,display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`Preferred name lookup failed: ${error.message}`)
  return normalizeFirstName(data?.first_name || data?.display_name)
}

export async function POST(req: NextRequest) {
  let debugUserId: string | null = null
  let debugStoryId: string | null = null
  try {
    const user = await resolveRequestUser(req)
    debugUserId = user?.id || null
    if (!user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const storyId = String(body.storyId || '').trim()
    debugStoryId = storyId || null
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    const preferredName = normalizeFirstName(body.preferredName) || await lookupPreferredName(user.id)
    if (!preferredName) return NextResponse.json({ error: 'preferredName required' }, { status: 400 })

    console.log('[render-personalized-final-mix] personalize attempt', { userId: user.id, preferredName, storyId })
    const result = await renderPersonalizedFinalMix({
      storyId,
      userId: user.id,
      preferredName,
    })
    console.log('[render-personalized-final-mix] personalize success', {
      userId: user.id,
      preferredName,
      storyId,
      finalMixUrl: result?.finalMixUrl || null,
      openerId: result?.openerId || null,
      cached: Boolean(result?.cached),
    })

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!personalizeDebugWasCaptured(err)) {
      await recordPersonalizeDebug({ userId: debugUserId, storyId: debugStoryId }, 'route', err)
    }
    console.warn('[render-personalized-final-mix] personalize failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
