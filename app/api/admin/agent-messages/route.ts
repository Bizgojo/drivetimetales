import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const SELECT_FIELDS = 'id,from_agent,to_agent,subject,body,status,reply_body,replied_at,read_at,created_at,updated_at,mission_ref,requires_action'
const MUTABLE_FIELDS = ['status', 'reply_body', 'replied_at', 'read_at'] as const

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown) {
  if (value == null) return null
  const cleaned = cleanText(value)
  return cleaned || null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let query = supabase
      .from('agent_messages')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false })
      .limit(100)

    const toAgent = cleanText(searchParams.get('to_agent'))
    const fromAgent = cleanText(searchParams.get('from_agent'))
    const status = cleanText(searchParams.get('status'))

    if (toAgent) query = query.eq('to_agent', toAgent)
    if (fromAgent) query = query.eq('from_agent', fromAgent)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(
      { success: true, messages: data ?? [], count: data?.length ?? 0, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json({ success: false, messages: [], error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const fromAgent = cleanText(body?.from_agent)
    const toAgent = cleanText(body?.to_agent)
    const subject = cleanText(body?.subject)
    const messageBody = cleanText(body?.body)

    if (!fromAgent || !toAgent || !subject || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'from_agent, to_agent, subject, and body are required' },
        { status: 400 }
      )
    }

    const insert = {
      from_agent: fromAgent,
      to_agent: toAgent,
      subject,
      body: messageBody,
      mission_ref: optionalText(body?.mission_ref),
      requires_action: body?.requires_action === true,
    }

    const { data, error } = await supabase
      .from('agent_messages')
      .insert(insert)
      .select(SELECT_FIELDS)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = cleanText(searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ success: false, error: 'id query parameter required' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'JSON object body required' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of MUTABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        patch[field] = body[field] === '' ? null : body[field]
      }
    }

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('agent_messages')
      .update(patch)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
