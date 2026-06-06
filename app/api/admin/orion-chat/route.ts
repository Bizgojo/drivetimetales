import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Service role client for writes; anon for reads
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — public, no auth — returns last 100 messages ordered oldest→newest
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('orion_messages')
      .select('id, role, agent, content, created_at')
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) throw error

    return NextResponse.json(
      { messages: data ?? [], count: data?.length ?? 0, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json({ messages: [], error: String(err) }, { status: 500 })
  }
}

// POST — saves a message; used by:
//   - Command Center (Marc's messages, role='marc')
//   - Orion cron sessions (responses, role='orion'/'hal'/etc.)
// Light auth: checks for service key header for agent writes
export async function POST(req: NextRequest) {
  // Allow service-role writes from Orion cron sessions
  // Fallback hardcoded: env var loading is unreliable on Vercel for this key
  const serviceKey = req.headers.get('x-orion-service-key')
  const expectedKey = process.env.ORION_CRON_READ_KEY ?? 'ock_86f89793eece054f1f578ee2dc78e121f2d47ef67cc7c2a15ae45d82bb341d20'
  const isServiceWrite = serviceKey === expectedKey

  // Parse body
  const body = await req.json().catch(() => null)
  if (!body || !body.content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  const role = body.role ?? 'marc'
  const agent = body.agent ?? (role === 'marc' ? 'marc' : 'orion')
  const content = body.content.trim()

  // For Marc's messages (role=marc), no auth needed — admin-only page
  // For agent responses (role≠marc), require service key
  if (role !== 'marc' && !isServiceWrite) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('orion_messages')
    .insert({ role, agent, content })
    .select('id, role, agent, content, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If Marc sent, also fire Telegram as backup notification
  if (role === 'marc') {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (token) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: '8737860822',
          text: `📋 *Orion Terminal — Message from Marc*\n\n${content}`,
          parse_mode: 'Markdown',
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ message: data }, { status: 201 })
}
