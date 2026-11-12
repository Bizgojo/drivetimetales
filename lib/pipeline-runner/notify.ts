/**
 * Pipeline Runner — Event persistence and webhook alerts
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunnerEvent } from './types'

/**
 * Appends a structured runner event to production_jobs.logs (JSONB array).
 * Read-modify-write is safe because the runner holds a distributed lease
 * and is the only writer to this field during its invocation window.
 */
export async function writeRunnerEvent(
  supabase: SupabaseClient,
  jobId: string,
  event: RunnerEvent,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('production_jobs')
      .select('logs')
      .eq('id', jobId)
      .single()

    const currentLogs: unknown[] = Array.isArray(data?.logs) ? (data.logs as unknown[]) : []

    await supabase
      .from('production_jobs')
      .update({
        logs: [...currentLogs, event],
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch {
    // Never throw from a logging call.
  }
}

/**
 * ALERTS-TELEGRAM-001 (Marc, Nov 12, 2026: alerts go to Telegram). Orion's Nov 12 check found
 * PIPELINE_ALERT_WEBHOOK_URL unset on EC2, so every stuck/failed-job alert went nowhere.
 * When TELEGRAM_ALERT_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID are set, each alert is also sent
 * as a Telegram message (a dedicated alerts bot, not an agent's bot). Never throws.
 */
export function telegramAlertText(event: RunnerEvent): string {
  const head = event.needs_marc ? 'ENDLESS TALES ALERT (needs Marc)' : 'ENDLESS TALES ALERT'
  return [head, String(event.message || '').slice(0, 3500), `Job ${String(event.jobId || '').slice(0, 8)} · step ${event.step ?? 'unknown'} · ${event.at}`].join('\n\n')
}

export async function sendTelegramAlert(
  event: RunnerEvent,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const token = String(env.TELEGRAM_ALERT_BOT_TOKEN || '').trim()
  const chatId = String(env.TELEGRAM_ALERT_CHAT_ID || '').trim()
  if (!token || !chatId) return false
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: telegramAlertText(event), disable_web_page_preview: true }),
    })
    if (!res.ok) console.warn(`[alerts] Telegram send failed: HTTP ${res.status}`)
    return res.ok
  } catch (e) {
    console.warn('[alerts] Telegram send threw:', e instanceof Error ? e.message : String(e))
    return false
  }
}

/**
 * POSTs the event to PIPELINE_ALERT_WEBHOOK_URL if configured, and to Telegram when
 * TELEGRAM_ALERT_BOT_TOKEN + TELEGRAM_ALERT_CHAT_ID are set (ALERTS-TELEGRAM-001).
 * Silently skips a channel whose settings are unset. Never throws.
 */
export async function sendWebhookAlert(event: RunnerEvent): Promise<void> {
  await sendTelegramAlert(event)
  const url = process.env.PIPELINE_ALERT_WEBHOOK_URL
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch {
    // Never throw from a notification call.
  }
}
