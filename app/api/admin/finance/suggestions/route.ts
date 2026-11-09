// FINANCE-STATEMENT-007 — GET: latest saved profit suggestions. POST: ask Claude for this month's
// suggestions from the monthly cash statement and save them (one row per month; POST replaces it).
// Admin-only. One Claude call per POST.
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { buildPrompt, parseSuggestions, summarize } from '@/lib/finance/suggestions'
import { loadStatement } from '@/lib/finance/load-statement'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const MODEL = 'claude-sonnet-4-6'

export async function GET(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  const { data, error } = await db().from('finance_suggestions').select('month,items,model,created_at').order('month', { ascending: false }).limit(1)
  if (error) return NextResponse.json({ suggestions: null, note: 'Suggestions are not set up yet.' })
  return NextResponse.json({ suggestions: data?.[0] ?? null })
}

export async function POST(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, { status: 503 })
  try {
    const statement = await loadStatement({ basis: 'cash', period: 'monthly' })
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: buildPrompt(summarize(statement)) }] })
    const text = msg.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
    const items = parseSuggestions(text)
    const month = new Date().toISOString().slice(0, 7) + '-01'
    const row = { month, items, model: MODEL, input_tokens: msg.usage?.input_tokens ?? null, output_tokens: msg.usage?.output_tokens ?? null, created_at: new Date().toISOString() }
    const { error } = await db().from('finance_suggestions').upsert(row, { onConflict: 'month' })
    if (error) throw new Error('Could not save suggestions: ' + error.message)
    return NextResponse.json({ suggestions: row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Suggestions failed' }, { status: 502 })
  }
}

// PATCH: Marc reorders or deletes suggestions. Body: { month: 'YYYY-MM-01', items: [{title, detail, impact}] }.
// Only items already in that month's list are accepted (no new text can be injected this way).
export async function PATCH(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  try {
    const body = await request.json()
    const month = String(body?.month || '')
    if (!/^\d{4}-\d{2}-01$/.test(month) || !Array.isArray(body?.items)) return NextResponse.json({ error: 'Send month and items.' }, { status: 400 })
    const { data, error } = await db().from('finance_suggestions').select('items').eq('month', month).limit(1)
    if (error || !data?.[0]) return NextResponse.json({ error: 'No suggestions saved for that month.' }, { status: 404 })
    const saved: any[] = Array.isArray(data[0].items) ? data[0].items : []
    const key = (x: any) => `${x?.title}\u0000${x?.detail}`
    const known = new Map(saved.map(x => [key(x), x]))
    const items = body.items.map((x: any) => known.get(key(x))).filter(Boolean)
    if (items.length !== body.items.length || new Set(items.map(key)).size !== items.length) return NextResponse.json({ error: 'The list changed; reload the page and try again.' }, { status: 409 })
    const upd = await db().from('finance_suggestions').update({ items }).eq('month', month)
    if (upd.error) throw new Error(upd.error.message)
    return NextResponse.json({ suggestions: { ...body, items } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save' }, { status: 502 })
  }
}
