import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EVENTS = 50
const VALID_TYPES = new Set(['impression', 'tap'])

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) throw new Error('Missing Supabase service environment')
  return createClient(url, service, { auth: { persistSession: false } })
}

async function currentUserId(): Promise<string | null> {
  // Auth is optional — guests browsing covers still count as impressions.
  try {
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
    return data.user.id
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    // sendBeacon may arrive as text/plain — parse body as text first.
    const raw = await req.text()
    let body: any
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : []
    if (!events.length) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    const anonId =
      typeof body?.anonId === 'string' && body.anonId.trim() ? body.anonId.trim().slice(0, 64) : null

    const userId = await currentUserId()

    const impressions: Record<string, unknown>[] = []
    const taps: Record<string, unknown>[] = []

    for (const evt of events) {
      const type = String(evt?.type || '')
      const storyId = String(evt?.storyId || '')
      if (!VALID_TYPES.has(type) || !UUID_RE.test(storyId)) continue

      const page = String(evt?.page || 'unknown').slice(0, 40)
      const rawPos = Number(evt?.position)
      const position =
        Number.isFinite(rawPos) && rawPos > 0 && rawPos <= 500 ? Math.round(rawPos) : null

      const row = {
        story_id: storyId,
        user_id: userId,
        anon_id: anonId,
        page,
        list_position: position,
      }
      if (type === 'impression') impressions.push(row)
      else taps.push(row)
    }

    const supabase = adminClient()
    let inserted = 0

    if (impressions.length) {
      const { error } = await supabase.from('cover_impressions').insert(impressions)
      if (error) console.error('[cover-impressions] insert error:', error.message)
      else inserted += impressions.length
    }

    if (taps.length) {
      const { error } = await supabase.from('cover_taps').insert(taps)
      if (error) console.error('[cover-impressions] tap insert error:', error.message)
      else inserted += taps.length
    }

    return NextResponse.json({ ok: true, inserted })
  } catch (err) {
    console.error('[cover-impressions] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
