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
 * POSTs the event to PIPELINE_ALERT_WEBHOOK_URL if configured.
 * Silently skips when the env var is unset (correct behavior while
 * the gateway is loopback-only and Vercel cannot reach it).
 */
export async function sendWebhookAlert(event: RunnerEvent): Promise<void> {
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
