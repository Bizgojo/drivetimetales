/**
 * POST /api/waitlist/verify-recaptcha
 * Verifies a reCAPTCHA v3 token server-side.
 * Returns { success: boolean, score: number }
 * Score 0.0 = bot, 1.0 = human. We reject below 0.5.
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ success: false, error: 'No token' }, { status: 400 })

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    })

    const data = await res.json()
    const score = data.score ?? 0

    // Reject if score below 0.5 (likely bot)
    if (!data.success || score < 0.5) {
      return NextResponse.json({ success: false, score, error: 'Bot detected' }, { status: 403 })
    }

    return NextResponse.json({ success: true, score })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
