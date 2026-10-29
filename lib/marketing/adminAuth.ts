// lib/marketing/adminAuth.ts — shared admin gate for Amendment 1 routes.
// Same admin allowlist as app/api/admin/marketing/campaigns/route.ts.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

/** Returns the admin email, or a 401 NextResponse on failure. */
export async function requireAdminEmail(): Promise<string | NextResponse> {
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
  const {
    data: { user },
  } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  return email
}

export function isLaunchAuthorized(email: string): boolean {
  // Spec Sec 10.1: LAUNCH visible to Susan and Orion only (in addition to Marc).
  // Susan calls with her service token; email allowlist covers Marc + operators.
  return ADMIN_EMAILS.has(email.toLowerCase())
}
