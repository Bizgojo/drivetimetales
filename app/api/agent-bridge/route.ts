import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * AGENT-BRIDGE-001 (2026-10-12, Marc GO)
 *
 * Real two-way message channel between this Claude session (reaches the
 * Vercel app over HTTPS, cannot reach Orion/OpenClaw directly) and Orion
 * (runs on Marc's Mac, reaches this Vercel app, polls this endpoint from
 * its existing heartbeat). Table: agent_bridge_messages.
 *
 * Auth: same pattern as /api/cron/* — `Authorization: Bearer <secret>`
 * checked against AGENT_BRIDGE_SECRET. Service-role Supabase key only;
 * RLS on the table blocks anon/public access as a second layer.
 *
 * POST  — send a message. { recipient: 'orion'|'claude', message, subject?, payload?, reply_to? }
 * GET   — poll for messages. ?recipient=orion|claude&status=pending (default)
 * PATCH — mark delivered or post a reply. { id, status?, reply_text? }
 */

function isAuthorized(request: NextRequest) {
  const expected = process.env.AGENT_BRIDGE_SECRET
  return !!expected && request.headers.get('authorization') === `Bearer ${expected}`
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

const VALID_RECIPIENTS = new Set(['orion', 'claude'])

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return json({ error: 'unauthorized' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const recipient = String(body?.recipient || '').trim().toLowerCase()
  const sender = String(body?.sender || '').trim().toLowerCase() || (recipient === 'orion' ? 'claude' : 'orion')
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : null
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : null
  const replyTo = typeof body?.reply_to === 'string' ? body.reply_to : null

  if (!VALID_RECIPIENTS.has(recipient)) {
    return json({ error: "recipient must be 'orion' or 'claude'" }, 400)
  }
  if (!message) {
    return json({ error: 'message is required' }, 400)
  }

  const direction = recipient === 'orion' ? 'to_orion' : 'from_orion'
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from('agent_bridge_messages')
    .insert({
      direction,
      sender,
      recipient,
      subject,
      message,
      payload,
      status: 'pending',
      reply_to: replyTo,
    })
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ success: true, message: data })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return json({ error: 'unauthorized' }, 401)

  const url = new URL(request.url)
  const recipient = String(url.searchParams.get('recipient') || '').trim().toLowerCase()
  const status = String(url.searchParams.get('status') || 'pending').trim().toLowerCase()
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 20), 100))

  if (!VALID_RECIPIENTS.has(recipient)) {
    return json({ error: "recipient must be 'orion' or 'claude'" }, 400)
  }

  const supabase = supabaseAdmin()
  let query = supabase
    .from('agent_bridge_messages')
    .select('*')
    .eq('recipient', recipient)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return json({ error: error.message }, 500)
  return json({ success: true, messages: data || [] })
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return json({ error: 'unauthorized' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const id = String(body?.id || '').trim()
  if (!id) return json({ error: 'id is required' }, 400)

  const supabase = supabaseAdmin()

  // Posting a reply: mark this message replied AND insert the reply as a
  // new message in the opposite direction, threaded via reply_to.
  if (typeof body?.reply_text === 'string' && body.reply_text.trim()) {
    const { data: original, error: fetchError } = await supabase
      .from('agent_bridge_messages')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !original) return json({ error: fetchError?.message || 'message not found' }, 404)

    const replySender = original.recipient
    const replyRecipient = original.sender
    const replyDirection = replyRecipient === 'orion' ? 'to_orion' : 'from_orion'

    const { data: reply, error: insertError } = await supabase
      .from('agent_bridge_messages')
      .insert({
        direction: replyDirection,
        sender: replySender,
        recipient: replyRecipient,
        subject: original.subject ? `Re: ${original.subject}` : null,
        message: body.reply_text.trim(),
        payload: body?.payload && typeof body.payload === 'object' ? body.payload : null,
        status: 'pending',
        reply_to: id,
      })
      .select('*')
      .single()

    if (insertError) return json({ error: insertError.message }, 500)

    await supabase
      .from('agent_bridge_messages')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', id)

    return json({ success: true, reply })
  }

  // Otherwise, a plain status update (e.g. mark delivered after polling).
  const status = String(body?.status || '').trim().toLowerCase()
  if (!['delivered', 'failed'].includes(status)) {
    return json({ error: "status must be 'delivered' or 'failed' (or pass reply_text to reply)" }, 400)
  }

  const update: Record<string, unknown> = { status }
  if (status === 'delivered') update.delivered_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('agent_bridge_messages')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ success: true, message: data })
}
// AGENT-BRIDGE-001: force clean rebuild, no cache reuse (route missing from prior build output) - 2026-10-12T01:55:25Z
