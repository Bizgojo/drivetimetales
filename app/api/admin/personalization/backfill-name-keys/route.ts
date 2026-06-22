import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ensureNamePoolForUser } from '@/lib/personalization/ensureNamePool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await authClient.auth.getUser(token)
    const email = (data.user?.email || '').toLowerCase()
    if (!error && email && ADMIN_EMAILS.has(email)) return null
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
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }
  return null
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req)
  if (unauthorized) return unauthorized

  const body = await req.json().catch(() => ({}))
  const limit = Math.max(1, Math.min(500, Number(body.limit || 100)))

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id,first_name')
    .not('first_name', 'is', null)
    .neq('first_name', '')
    .is('name_pronunciation_key', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return json({ success: false, error: error.message }, 500)

  const results = {
    processed: 0,
    keyed: 0,
    fallback: 0,
    failed: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  }

  for (const row of users || []) {
    results.processed += 1
    try {
      const result = await ensureNamePoolForUser(row.id, row.first_name)
      if (result.pronunciationKey) results.keyed += 1
      else results.fallback += 1
    } catch (err) {
      results.failed += 1
      results.errors.push({
        userId: row.id,
        error: String(err instanceof Error ? err.message : err).slice(0, 500),
      })
    }
  }

  return json({ success: results.failed === 0, limit, ...results })
}
