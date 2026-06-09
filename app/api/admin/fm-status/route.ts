import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getFMStatus, getFMSubscribers } from '@/lib/stripe-fm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url && anon) {
      const auth = createClient(url, anon)
      const { data, error } = await auth.auth.getUser(token)
      const email = (data.user?.email || '').toLowerCase()
      if (!error && email && ADMIN_EMAILS.has(email)) return null
    }
  }

  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  )

  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return null
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const [status, subscribers] = await Promise.all([
      getFMStatus(),
      getFMSubscribers(100),
    ])

    return json({
      success: true,
      status,
      subscribers,
      activeSubscribers: subscribers.filter((subscriber) => subscriber.status === 'active').length,
      totalSubscribers: status.spotsUsed,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin/fm-status] Stripe status failed:', message)
    return json({ success: false, error: message }, 500)
  }
}
