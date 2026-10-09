import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { AGENTS, PROVIDERS, dayKey, agentFor, providerFor, kindFor, validAmount, type DailyCost } from '@/lib/ai-spending/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
const ADMIN_EMAILS = new Set(['marc@endless-tales.com', 'hello.endlesstales@gmail.com', 'williampostlewaite@icloud.com', 'm.postlewaite@gmail.com'])
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
async function authorized() {
  const c = cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => c.getAll(), setAll: () => {} } })
  const { data: { user } } = await auth.auth.getUser()
  return user && ADMIN_EMAILS.has((user.email || '').toLowerCase()) ? user : null
}
function client() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) }
const LOGS = [
  { table: 'openai_usage_log', provider: 'OpenAI', date: 'created_at', columns: 'id,created_at,cost_usd,model,metadata' },
  { table: 'anthropic_usage_log', provider: 'Anthropic', date: 'created_at', columns: 'id,created_at,cost_usd,model,metadata' },
  { table: 'el_usage_log', provider: 'ElevenLabs', date: 'ts_utc', columns: 'history_item_id,ts_utc,date_utc,cost_usd' },
  { table: 'expenses_log', provider: 'Payments', date: 'expense_date', columns: 'id,vendor,category,description,amount_usd,expense_date,entry_type' },
]
async function loadSource(db: ReturnType<typeof client>, spec: typeof LOGS[number]) {
  const rows: any[] = []; let truncated = false
  for (let page = 0; page < 100; page++) {
    const key = spec.table === 'el_usage_log' ? 'history_item_id' : 'id'
    const { data, error } = await db.from(spec.table).select(spec.columns).order(spec.date, { ascending: true }).order(key, { ascending: true }).range(page * 1000, page * 1000 + 999)
    if (error) return { spec, rows: [], error: 'Source unavailable. Check database access and table configuration.', truncated: false }
    rows.push(...(data || [])); if ((data || []).length < 1000) break
    if (page === 99) truncated = true
  }
  return { spec, rows, error: null, truncated }
}
async function balance(provider: string, url: string, headers: Record<string, string>, configured: boolean) {
  if (!configured) return { provider, status: 'not_connected', detail: 'Credential not configured' }
  try {
    const r = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }); const p = await r.json()
    if (!r.ok || (provider === 'KIE.ai' && p.code !== 200)) throw new Error('Provider request failed')
    if (provider === 'DeepSeek') {
      const info = p.balance_infos?.find((i: any) => i.currency === 'USD') || p.balance_infos?.[0]
      const credits = validAmount(info?.total_balance); if (credits === null) throw new Error('Invalid balance')
      return { provider, status: 'live', credits, unit: info.currency + ' balance' }
    }
    if (provider === 'KIE.ai') { const credits = validAmount(p.data); if (credits === null) throw new Error('Invalid balance'); return { provider, status: 'live', credits, unit: 'KIE credits' } }
    const used = validAmount(p.character_count), limit = validAmount(p.character_limit)
    if (used === null || limit === null) throw new Error('Invalid quota')
    return { provider, status: 'live', credits: Math.max(0, limit - used), unit: 'quota units', plan: p.tier || 'Unknown', reset: p.next_character_count_reset_unix ? new Date(p.next_character_count_reset_unix * 1000).toISOString() : null }
  } catch { return { provider, status: 'unavailable', detail: 'Provider balance could not be fetched' } }
}
export async function GET() {
  try {
    if (!await authorized()) return json({ error: 'Unauthorized' }, 401)
    const db = client()
    const [loaded, balances] = await Promise.all([
      Promise.all(LOGS.map(s => loadSource(db, s))),
      Promise.all([
        balance('DeepSeek', 'https://api.deepseek.com/user/balance', { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY || ''}` }, !!process.env.DEEPSEEK_API_KEY),
        balance('ElevenLabs', 'https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' }, !!process.env.ELEVENLABS_API_KEY),
        balance('KIE.ai', 'https://api.kie.ai/api/v1/chat/credit', { Authorization: `Bearer ${process.env.KIE_API_KEY || ''}` }, !!process.env.KIE_API_KEY),
      ]),
    ])
    const grouped = new Map<string, DailyCost>(); const payments: any[] = []; const sources: any[] = []
    for (const source of loaded) {
      let skipped = 0; let included = 0; let first: string | null = null; let last: string | null = null
      for (const r of source.rows) {
        const cash = source.spec.table === 'expenses_log'
        const provider = cash ? (providerFor(r.vendor || '') || (r.category === 'AI & Voice' ? 'Other AI' : null)) : source.spec.provider
        if (!provider) continue
        const amount = validAmount(cash ? r.amount_usd : r.cost_usd)
        let date: string
        try { date = dayKey(cash ? r.expense_date : (r[source.spec.date] || r.date_utc)) } catch { skipped++; continue }
        if (amount === null) { skipped++; continue }
        const agent = agentFor(r.metadata, cash ? r.description || '' : '', r.vendor || '')
        const kind = cash ? kindFor(r.description || '') : 'usage'
        const model = cash ? (/\[model:([^\]]+)\]/.exec(r.description || '')?.[1] || 'Not specified') : (r.model || 'Voice generation')
        const key = JSON.stringify([date, provider, agent, model, kind]); const group = grouped.get(key) || { date, provider, agent, model, kind, amount: 0, calls: 0 }
        group.amount += amount; group.calls += cash ? 0 : 1; grouped.set(key, group)
        included++; first = [first, date].filter((d): d is string => !!d).sort()[0]; last = [last, date].filter((d): d is string => !!d).sort().reverse()[0]
        if (cash) payments.push({ id: r.id, date, provider, agent, model, kind, amount, description: r.description || '' })
      }
      sources.push({ table: source.spec.table, provider: source.spec.provider, status: source.error ? 'unavailable' : source.truncated || skipped ? 'partial' : 'connected', rows: included, skipped, first, last, truncated: source.truncated, error: source.error })
    }
    return json({ success: true, fetchedAt: new Date().toISOString(), timezone: 'America/New_York', daily: [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)), sources, balances, payments: payments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200) })
  } catch { return json({ error: 'AI spending data could not be loaded. Check admin access and database configuration.' }, 500) }
}
export async function POST(req: NextRequest) {
  try {
    if (!await authorized()) return json({ error: 'Unauthorized' }, 401)
    const body = await req.json(); const amount = validAmount(body.amount); const provider = PROVIDERS.find(p => p.id === body.provider)
    const kind = body.kind; const agent = body.agent || 'Unassigned'; const date = body.date
    if (!provider || amount === null || amount <= 0 || amount > 1000000 || !['subscription', 'credit_purchase', 'invoice'].includes(kind) || !AGENTS.includes(agent) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date || date > dayKey(new Date())) return json({ error: 'Enter a valid provider, agent, past or current date, and positive USD amount.' }, 400)
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : ''
    const model = typeof body.model === 'string' ? body.model.replace(/[\[\]]/g, '').slice(0, 80) : ''
    const description = `[AI spending] [agent:${agent}] [kind:${kind}]${model ? ` [model:${model}]` : ''} ${note}`
    const { error } = await client().from('expenses_log').insert({ vendor: provider.id, category: 'AI & Voice', description, amount_usd: amount, expense_date: date, entry_type: 'manual' })
    if (error) return json({ error: 'Payment could not be recorded. Check the expense ledger before retrying.' }, 500)
    return json({ success: true })
  } catch { return json({ error: 'Payment could not be recorded. Check the expense ledger before retrying.' }, 400) }
}
