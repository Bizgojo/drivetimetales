// FINANCE-STATEMENT-004 — daily ElevenLabs credit usage + plan price → finance_el_daily / finance_el_plan.
// Usage (EC2): npx tsx scripts/finance/elevenlabs-sync.ts [--since YYYY-MM-DD] [--monthly-price 99] [--dry-run]
// Needs ELEVENLABS_API_KEY (already on the server), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// --monthly-price: only if ElevenLabs does not report the next invoice (the log line says "no price").
import { createClient } from '@supabase/supabase-js'
import { syncElevenLabs } from '../../lib/finance/elevenlabs-sync'

async function main() {
  const args = process.argv.slice(2)
  const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const since = arg('--since') || new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD')
  const mp = arg('--monthly-price'), monthlyPrice = mp != null ? Number(mp) : null
  if (mp != null && !(monthlyPrice! > 0)) throw new Error('--monthly-price must be a positive number')
  const key = process.env.ELEVENLABS_API_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !url || !sk) throw new Error('ELEVENLABS_API_KEY, SUPABASE URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const r = await syncElevenLabs(createClient(url, sk, { auth: { persistSession: false } }), { key, since, monthlyPrice, dryRun: args.includes('--dry-run'), log: s => console.log('[el-sync] ' + s) })
  console.log(`[el-sync] done: ${r.days} days`)
}
main().catch(e => { console.error('[el-sync] FAILED: ' + (e instanceof Error ? e.message : String(e))); process.exit(1) })
