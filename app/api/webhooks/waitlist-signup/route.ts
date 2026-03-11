import { NextRequest, NextResponse } from 'next/server'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Supabase sends the new row under body.record for INSERT events
    const record = body.record || body

    const email = record.email || 'unknown'
    const source = record.source || 'direct'
    const campaign = record.campaign || null
    const lockedPrice = record.locked_price ? `$${record.locked_price}/mo` : '$7.99/mo'
    const signedUpAt = record.created_at
      ? new Date(record.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
      : new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })

    const lines = [
      `🎉 *New Trial Signup!*`,
      ``,
      `📧 ${email}`,
      `💰 Locked price: ${lockedPrice}`,
      `📍 Source: ${source}${campaign ? ` / ${campaign}` : ''}`,
      `🕐 ${signedUpAt} ET`,
    ]

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'Markdown',
      }),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Waitlist webhook error:', err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
