import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_MODES = new Set(['always', 'never', 'while_using'])

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) throw new Error('Missing Supabase service environment')
  return createClient(url, service, { auth: { persistSession: false } })
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

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await adminClient()
      .from('user_travel_insights_preferences')
      .select('mode,updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.warn('[travel-insights] load failed:', error.message)
      return NextResponse.json({ mode: null, source: 'unavailable' })
    }

    return NextResponse.json({ mode: data?.mode || null, updatedAt: data?.updated_at || null, source: data ? 'server' : 'not_set' })
  } catch (error) {
    console.error('[travel-insights] load error:', error)
    return NextResponse.json({ error: 'Failed to load travel insights setting' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const mode = String(body?.mode || '')
    if (!VALID_MODES.has(mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })

    const { error } = await adminClient()
      .from('user_travel_insights_preferences')
      .upsert({
        user_id: user.id,
        mode,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      console.warn('[travel-insights] save failed:', error.message)
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode })
  } catch (error) {
    console.error('[travel-insights] save error:', error)
    return NextResponse.json({ error: 'Failed to save travel insights setting' }, { status: 500 })
  }
}
