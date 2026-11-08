// FINANCE-STATEMENT-001 — daily Mercury → finance_transactions copy.
// Usage (EC2): npx tsx scripts/finance/mercury-sync.ts [--since YYYY-MM-DD] [--dry-run]
// Needs MERCURY_API_TOKEN (read-only token), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Default window: the last 45 days (late-posting card charges and refunds are re-read).
import { createClient } from '@supabase/supabase-js'
import { syncMercury } from '../../lib/finance/mercury-sync'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const si = args.indexOf('--since')
  const since = si >= 0 ? args[si + 1] : new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD')
  const token = process.env.MERCURY_API_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!token || !url || !key) throw new Error('MERCURY_API_TOKEN, SUPABASE URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const r = await syncMercury(supabase, { token, since, dryRun, log: s => console.log('[mercury-sync] ' + s) })
  console.log(`[mercury-sync] ${dryRun ? 'DRY RUN — ' : ''}fetched ${r.fetched}, written ${r.written}`)
}
main().catch(e => { console.error('[mercury-sync] FAILED: ' + (e instanceof Error ? e.message : String(e))); process.exit(1) })
