// FINANCE-STATEMENT-003 — daily Stripe ledger → finance_stripe_txns copy.
// Usage (EC2): npx tsx scripts/finance/stripe-sync.ts [--since YYYY-MM-DD] [--dry-run]
// Needs STRIPE_SECRET_KEY (already on the server), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Default window: the last 45 days. First run: --since 2026-04-01 to load history.
import { createClient } from '@supabase/supabase-js'
import { syncStripe } from '../../lib/finance/stripe-sync'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const si = args.indexOf('--since')
  const since = si >= 0 ? args[si + 1] : new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD')
  const key = process.env.STRIPE_SECRET_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !url || !sk) throw new Error('STRIPE_SECRET_KEY, SUPABASE URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const supabase = createClient(url, sk, { auth: { persistSession: false } })
  const r = await syncStripe(supabase, { key, since, dryRun, log: s => console.log('[stripe-sync] ' + s) })
  console.log(`[stripe-sync] ${dryRun ? 'DRY RUN — ' : ''}fetched ${r.fetched}, written ${r.written}`)
}
main().catch(e => { console.error('[stripe-sync] FAILED: ' + (e instanceof Error ? e.message : String(e))); process.exit(1) })
