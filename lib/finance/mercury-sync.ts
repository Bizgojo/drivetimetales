// FINANCE-STATEMENT-001 — copy Mercury transactions into finance_transactions.
// Read-only against Mercury (GET only). Idempotent upsert by Mercury id.
// Used by scripts/finance/mercury-sync.ts (daily, EC2) and POST /api/admin/finance/sync.
import type { SupabaseClient } from '@supabase/supabase-js'

const BASE = 'https://api.mercury.com/api/v1'

export function lastFour(paymentMethod: string | null | undefined): string | null {
  const m = /(\d{4})\s*$/.exec(paymentMethod || '')
  return m ? '••' + m[1] : null
}

export function toRow(t: any, cardNames: Map<string, string>) {
  const card = lastFour(t?.details?.creditCardInfo?.paymentMethod)
  return {
    id: String(t.id),
    posted_at: t.postedAt || t.createdAt,
    amount: Number(t.amount),
    status: String(t.status || ''),
    kind: String(t.kind || ''),
    counterparty: String(t.counterpartyName || ''),
    bank_description: t.bankDescription ?? null,
    card,
    card_nickname: card ? cardNames.get(card) ?? null : null,
    mercury_category: t.mercuryCategory ?? null,
    custom_category: t.categoryData?.name ?? null,
    note: t.note ?? null,
    source: 'mercury',
    synced_at: new Date().toISOString(),
  }
}

async function get(path: string, token: string) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`Mercury ${path.split('?')[0]} → HTTP ${r.status}`)
  return r.json()
}

export async function syncMercury(supabase: SupabaseClient, opts: { token: string; since: string; dryRun?: boolean; log?: (s: string) => void }) {
  const log = opts.log || (() => {})
  // card last-four → nickname
  const cardNames = new Map<string, string>()
  try {
    const cards = await get('/cards', opts.token)
    for (const c of cards.cards || []) if (c.lastFourDigits) cardNames.set('••' + c.lastFourDigits, c.nickname || c.nameOnCard || '')
  } catch (e) { log('cards list unavailable: ' + (e as Error).message) }

  const rows: any[] = []
  let after: string | null = null
  for (let page = 0; page < 200; page++) {
    const q = new URLSearchParams({ postedStart: opts.since, limit: '500', order: 'asc' })
    if (after) q.set('start_after', after)
    const res = await get('/transactions?' + q.toString(), opts.token)
    const list: any[] = res.transactions || []
    for (const t of list) {
      if (['cancelled', 'failed', 'blocked'].includes(t.status)) continue
      // list responses may omit card details; fetch one-by-one only when needed
      if (t.kind === 'creditCardTransaction' && !t?.details?.creditCardInfo) {
        try { const full = await get('/transaction/' + encodeURIComponent(t.id), opts.token); Object.assign(t, full.transaction || full) } catch { /* keep partial row */ }
      }
      rows.push(toRow(t, cardNames))
    }
    after = res.page?.nextPage || null
    if (!after || !list.length) break
  }
  log(`fetched ${rows.length} Mercury transactions since ${opts.since}`)
  if (opts.dryRun) return { fetched: rows.length, written: 0 }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('finance_transactions').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error('finance_transactions upsert: ' + error.message)
  }
  return { fetched: rows.length, written: rows.length }
}
