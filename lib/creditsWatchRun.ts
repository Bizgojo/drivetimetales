// lib/creditsWatchRun.ts — CREDITS-WATCH-001 server runner (see lib/creditsWatch.ts).
// Called by /api/admin/credits (refresh) and, at most once an hour, by the EC2
// progress-alarm timer (/api/admin/progress-alarm). Never throws to the caller.

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCredits, billingErrorServices, alertsDue, creditAlertText, checkDue, type CreditSnapshot } from './creditsWatch'
import { sendWebhookAlert } from './pipeline-runner/notify'

export const SNAPSHOT_KEY = 'credit_balances'
export const LIMITS_KEY = 'credit_limits'

async function readSetting(db: SupabaseClient, key: string): Promise<any | null> {
  const { data } = await db.from('atlas_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(String(data.value)) } catch { return null }
}

export async function readCreditSnapshot(db: SupabaseClient): Promise<CreditSnapshot | null> {
  return readSetting(db, SNAPSHOT_KEY)
}

function monthStartEt(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const y = p.find((x) => x.type === 'year')!.value, m = p.find((x) => x.type === 'month')!.value
  // Midnight ET on the 1st, as UTC (EST/EDT difference of an hour does not matter for a limit check).
  return new Date(`${y}-${m}-01T05:00:00Z`).toISOString()
}

async function anthropicMonthSpend(db: SupabaseClient): Promise<number | null> {
  let total = 0
  for (let page = 0; page < 200; page++) {
    const { data, error } = await db.from('anthropic_usage_log').select('cost_usd').gte('created_at', monthStartEt()).range(page * 1000, page * 1000 + 999)
    if (error) return null
    for (const r of data || []) total += Number((r as any).cost_usd) || 0
    if (!data || data.length < 1000) break
  }
  return total
}

async function recentBillingErrors(db: SupabaseClient): Promise<Set<string>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await db.from('production_jobs').select('error_json,logs').gte('updated_at', since).limit(200)
  const texts: string[] = []
  for (const j of (data || []) as any[]) {
    if (j.error_json && Date.parse(j.error_json.at || '') >= Date.parse(since)) texts.push(JSON.stringify(j.error_json))
    for (const l of Array.isArray(j.logs) ? j.logs : []) {
      if (l && Date.parse(l.at || '') >= Date.parse(since)) texts.push(String(l.message || '') + ' ' + JSON.stringify(l.detail || l.data || ''))
    }
  }
  return billingErrorServices(texts)
}

export async function runCreditsWatch(db: SupabaseClient, opts: { force?: boolean } = {}): Promise<{ ran: boolean; snapshot: CreditSnapshot | null; alerted: string[] }> {
  try {
    const prior = await readCreditSnapshot(db)
    if (!opts.force && !checkDue(prior)) return { ran: false, snapshot: prior, alerted: [] }
    const limits = (await readSetting(db, LIMITS_KEY)) || {}
    const services = await checkCredits({
      env: process.env,
      anthropicMonthSpendUsd: await anthropicMonthSpend(db),
      anthropicMonthlyLimitUsd: Number(limits.anthropicMonthlyUsd) > 0 ? Number(limits.anthropicMonthlyUsd) : null,
      recentBillingErrors: await recentBillingErrors(db),
    })
    const nowIso = new Date().toISOString()
    const alertedAt: Record<string, string> = { ...(prior?.alertedAt || {}) }
    const due = alertsDue(services, alertedAt)
    for (const s of due) {
      await sendWebhookAlert({ at: nowIso, source: 'progress-alarm', event: 'external_wait', jobId: 'credits', step: s.id, needs_marc: true, message: creditAlertText(s) })
      alertedAt[s.id] = nowIso
    }
    const snapshot: CreditSnapshot = { checkedAt: nowIso, services, alertedAt }
    await db.from('atlas_settings').upsert({ key: SNAPSHOT_KEY, value: JSON.stringify(snapshot), updated_at: nowIso, updated_by: 'credits-watch' }, { onConflict: 'key' })
    return { ran: true, snapshot, alerted: due.map((s) => s.id) }
  } catch (e) {
    console.warn('[credits-watch] failed:', e instanceof Error ? e.message : String(e))
    return { ran: false, snapshot: null, alerted: [] }
  }
}
