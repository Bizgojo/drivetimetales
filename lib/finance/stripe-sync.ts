// FINANCE-STATEMENT-003 — copy the Stripe ledger (balance transactions) into finance_stripe_txns.
// Read-only against Stripe (list/retrieve only). Idempotent upsert by balance-transaction id.
// Used by scripts/finance/stripe-sync.ts (daily, EC2) and POST /api/admin/finance/sync.
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export function intervalOf(invoice: any): string | null {
  const line = invoice?.lines?.data?.find((l: any) => l?.price?.recurring?.interval || l?.plan?.interval)
  return line?.price?.recurring?.interval || line?.plan?.interval || null
}

export async function syncStripe(supabase: SupabaseClient, opts: { key: string; since: string; dryRun?: boolean; log?: (s: string) => void }) {
  const log = opts.log || (() => {})
  const stripe = new Stripe(opts.key, { apiVersion: '2023-10-16', timeout: 20000, maxNetworkRetries: 2 })
  const invoiceInterval = new Map<string, string | null>()
  const chargeInfo = new Map<string, { interval: string | null; email: string | null }>()

  async function forInvoice(id: string | null | undefined) {
    if (!id) return null
    if (!invoiceInterval.has(id)) {
      try { invoiceInterval.set(id, intervalOf(await stripe.invoices.retrieve(id))) } catch { invoiceInterval.set(id, null) }
    }
    return invoiceInterval.get(id) ?? null
  }
  async function forCharge(ch: any) {
    if (!ch) return { interval: null, email: null }
    if (typeof ch === 'string') {
      if (chargeInfo.has(ch)) return chargeInfo.get(ch)!
      try { ch = await stripe.charges.retrieve(ch) } catch { return { interval: null, email: null } }
    }
    const info = { interval: await forInvoice(typeof ch.invoice === 'string' ? ch.invoice : ch.invoice?.id), email: ch.billing_details?.email || ch.receipt_email || null }
    chargeInfo.set(ch.id, info)
    return info
  }

  const rows: any[] = []
  const gte = Math.floor(Date.parse(opts.since + 'T00:00:00Z') / 1000)
  for await (const bt of stripe.balanceTransactions.list({ created: { gte }, limit: 100, expand: ['data.source'] })) {
    const src: any = bt.source
    let info: { interval: string | null; email: string | null } = { interval: null, email: null }
    if (src?.object === 'charge') info = await forCharge(src)
    else if (src?.object === 'refund') info = await forCharge(src.charge)
    else if (src?.object === 'dispute') info = await forCharge(src.charge)
    rows.push({
      id: bt.id,
      created_at: new Date(bt.created * 1000).toISOString(),
      type: bt.type,
      reporting_category: (bt as any).reporting_category ?? null,
      amount: bt.amount / 100, fee: bt.fee / 100, net: bt.net / 100,
      currency: bt.currency,
      status: bt.status,
      description: bt.description ?? null,
      source_id: typeof src === 'string' ? src : src?.id ?? null,
      interval: info.interval,
      customer_email: info.email,
      synced_at: new Date().toISOString(),
    })
  }
  log(`fetched ${rows.length} Stripe balance transactions since ${opts.since}`)
  if (opts.dryRun) return { fetched: rows.length, written: 0 }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('finance_stripe_txns').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error('finance_stripe_txns upsert: ' + error.message)
  }
  return { fetched: rows.length, written: rows.length }
}
