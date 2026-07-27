// app/api/listen/auth-link/route.ts
// Generates a fresh Supabase magic-link token for the /listen → /home handoff.
//
// Called by EavesdropClient's handleGoToApp IMMEDIATELY before navigating to /auth/callback.
// Generating the token here (at button-tap time) rather than at signup time ensures:
//   1. Token is seconds old when consumed — no OTP expiry risk.
//   2. No race condition with createUser (user is fully committed before generateLink runs).
//
// Security: endpoint is unauthenticated but equivalent in risk to the existing
// "send magic link" signin flow — a caller must know the email to get a link for it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.endless-tales.com'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 512) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }

    const body = await req.json()
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '')
    if (!email) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${APP_URL}/home` },
    })

    if (error || !data?.properties?.hashed_token) {
      console.error('[listen/auth-link] generateLink failed:', error?.message)
      return NextResponse.json({ error: 'Failed to generate auth link' }, { status: 500 })
    }

    return NextResponse.json({ magicToken: data.properties.hashed_token as string })
  } catch (err) {
    console.error('[listen/auth-link] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
