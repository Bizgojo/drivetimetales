import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

async function requireAdmin() {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { message } = await req.json()
  if (!message?.trim()) {
    return NextResponse.json({ success: false, error: 'Message required' }, { status: 400 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = '8737860822'

  if (!token) {
    return NextResponse.json({ success: false, error: 'Telegram not configured' }, { status: 500 })
  }

  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`
  const telegramBody = {
    chat_id: chatId,
    text: `📋 *Message from Command Center*\n\n${message}`,
    parse_mode: 'Markdown',
  }

  try {
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramBody),
    })
    const data = await res.json()
    if (!data.ok) {
      return NextResponse.json({ success: false, error: data.description ?? 'Telegram error' }, { status: 500 })
    }
    return NextResponse.json({ success: true, sentAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to reach Telegram' }, { status: 500 })
  }
}
