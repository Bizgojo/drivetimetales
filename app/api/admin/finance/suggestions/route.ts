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
