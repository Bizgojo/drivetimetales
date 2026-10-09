import { NextRequest, NextResponse } from 'next/server'
import { authorized } from '@/lib/ai-spending/auth'
import { providerCosts } from '@/lib/ai-spending/billing'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(req: NextRequest) {
  try {
    if (!await authorized()) return json({ error: 'Unauthorized' }, 401)
    const from = req.nextUrl.searchParams.get('from'), to = req.nextUrl.searchParams.get('to')
    const valid = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
    if (!valid(from) || !valid(to) || from > to || to > new Date().toISOString().slice(0, 10) || Date.parse(to) - Date.parse(from) > 366 * 5 * 86400000) return json({ error: 'Choose valid UTC billing dates within a five-year range.' }, 400)
    const reports = await Promise.all([providerCosts('OpenAI', from, to), providerCosts('Anthropic', from, to)])
    return json({ success: true, reports, fetchedAt: new Date().toISOString(), timezone: 'UTC' })
  } catch { return json({ error: 'Billing reports could not be loaded.' }, 500) }
}
