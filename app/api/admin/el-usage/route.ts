import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const EL_KEY = process.env.ELEVENLABS_API_KEY!

function elevenLabsErrorBody(status: number, body: any) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message && detail?.status) return `${detail.status}: ${detail.message}`
  if (detail?.message) return detail.message
  if (body?.error) return String(body.error)
  return `ElevenLabs API returned HTTP ${status}`
}

export async function GET() {
  try {
    if (!EL_KEY) {
      return NextResponse.json(
        { success: false, error: 'ElevenLabs usage unavailable', status: 500, detail: 'ELEVENLABS_API_KEY is not configured' },
        { status: 500 }
      )
    }

    // Get subscription info
    const subRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      cache: 'no-store',
      headers: { 'xi-api-key': EL_KEY }
    })
    const sub = await subRes.json()
    if (!subRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'ElevenLabs usage unavailable',
          status: subRes.status,
          detail: elevenLabsErrorBody(subRes.status, sub),
        },
        { status: subRes.status }
      )
    }

    const charUsed = Number(sub.character_count || 0)
    const charLimit = Number(sub.character_limit || 0)
    const charRemaining = Math.max(0, charLimit - charUsed)

    return NextResponse.json({
      success: true,
      fetchedAt: new Date().toISOString(),
      source: 'elevenlabs_subscription_live',
      charUsed,
      charLimit,
      charRemaining,
      pct: charLimit ? Math.round((charUsed / charLimit) * 100) : 0,
      resetDate: sub.next_character_count_reset_unix
        ? new Date(sub.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)
        : null,
      plan: sub.tier || sub.plan || 'unknown',
      subscription: {
        plan: sub.tier || sub.plan || 'unknown',
        charUsed,
        charLimit,
        charRemaining,
        resetDate: sub.next_character_count_reset_unix
          ? new Date(sub.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)
          : null,
        pct: charLimit ? Math.round((charUsed / charLimit) * 100) : 0
      },
      summary: {
        totalChars: 0,
        totalCalls: 0,
        estimatedCost: 0,
        days: 0
      },
      days: [],
      voices: []
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'ElevenLabs usage unavailable', status: 500, detail: e.message },
      { status: 500 }
    )
  }
}
