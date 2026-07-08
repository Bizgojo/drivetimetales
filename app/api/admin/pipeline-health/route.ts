/**
 * /api/admin/pipeline-health — 24/7 pipeline stall detection endpoint
 *
 * Called by a Vercel cron job every 30 minutes. Returns a JSON health summary
 * and sends a Telegram alert to Orion when stall conditions are met.
 *
 * Stall conditions:
 *   CRITICAL: active_jobs > 0 AND completions_2h == 0
 *   WARNING:  active_jobs > 0 AND completions_15min == 0 AND completions_2h < 3
 *
 * Unlocked zombies (status=running, locked_by IS NULL) are counted and included
 * in the response and alert.
 *
 * Orion item 13 — fix/pipeline-monitor-cron
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Constants ─────────────────────────────────────────────────────────────

const TELEGRAM_CHAT_ID = '8737860822'
const ACTIVE_STATUSES = ['running', 'queued']
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const FIFTEEN_MIN_MS = 15 * 60 * 1000

// ── Telegram helper ───────────────────────────────────────────────────────

async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('[pipeline-health] TELEGRAM_BOT_TOKEN not set — skipping Telegram alert')
    return
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.warn('[pipeline-health] Telegram send failed:', data.description)
    }
  } catch (err) {
    console.warn('[pipeline-health] Telegram send error:', err instanceof Error ? err.message : String(err))
  }
}

// ── Health check logic ────────────────────────────────────────────────────

interface HealthResult {
  checkedAt: string
  activeJobs: number
  completions2h: number
  completions15min: number
  unlockedZombies: number
  oldestActiveJob: { id: string; current_step: string | null; updated_at: string } | null
  stall: boolean
  alert_level: 'OK' | 'WARNING' | 'CRITICAL'
  message: string
}

async function runHealthCheck(): Promise<HealthResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - TWO_HOURS_MS).toISOString()
  const fifteenMinAgo = new Date(now.getTime() - FIFTEEN_MIN_MS).toISOString()

  // ── Count active jobs (queued + running) ──────────────────────────────
  const { count: activeCount } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_STATUSES)

  const activeJobs = activeCount ?? 0

  // ── Count completions in last 2h ──────────────────────────────────────
  const { count: comp2hCount } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'complete')
    .gt('completed_at', twoHoursAgo)

  const completions2h = comp2hCount ?? 0

  // ── Count completions in last 15min ──────────────────────────────────
  const { count: comp15Count } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'complete')
    .gt('completed_at', fifteenMinAgo)

  const completions15min = comp15Count ?? 0

  // ── Count unlocked zombies ────────────────────────────────────────────
  const { count: zombieCount } = await supabase
    .from('production_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running')
    .is('locked_by', null)

  const unlockedZombies = zombieCount ?? 0

  // ── Oldest active job (for alert context) ────────────────────────────
  let oldestActiveJob: HealthResult['oldestActiveJob'] = null
  if (activeJobs > 0) {
    const { data: oldestRows } = await supabase
      .from('production_jobs')
      .select('id, current_step, updated_at')
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
      .limit(1)

    if (oldestRows?.length) {
      const row = oldestRows[0] as { id: string; current_step: string | null; updated_at: string }
      oldestActiveJob = { id: row.id, current_step: row.current_step, updated_at: row.updated_at }
    }
  }

  // ── Stall classification ──────────────────────────────────────────────
  let stall = false
  let alert_level: HealthResult['alert_level'] = 'OK'
  let message = `Pipeline healthy: ${activeJobs} active, ${completions2h} completions in 2h`

  if (activeJobs > 0 && completions2h === 0) {
    stall = true
    alert_level = 'CRITICAL'
    message = `Runner stall: ${activeJobs} active jobs, 0 completions in 2h`
  } else if (activeJobs > 0 && completions15min === 0 && completions2h < 3) {
    stall = false
    alert_level = 'WARNING'
    message = `Pipeline slowing: ${activeJobs} active jobs, ${completions2h} completions in 2h, 0 in last 15min`
  }

  return {
    checkedAt: now.toISOString(),
    activeJobs,
    completions2h,
    completions15min,
    unlockedZombies,
    oldestActiveJob,
    stall,
    alert_level,
    message,
  }
}

// ── Build Telegram alert message ──────────────────────────────────────────

function buildAlertMessage(result: HealthResult): string {
  const icon = result.alert_level === 'CRITICAL' ? '🔴' : '🟡'
  const label = result.alert_level === 'CRITICAL' ? 'PIPELINE STALL' : 'PIPELINE WARNING'

  const lines: string[] = [
    `${icon} *${label}*`,
    `*${result.activeJobs} active jobs, ${result.completions2h} completions in 2h*`,
    '',
  ]

  if (result.oldestActiveJob) {
    const step = result.oldestActiveJob.current_step ?? 'unknown'
    lines.push(`Oldest active job: \`${result.oldestActiveJob.id}\` at step \`${step}\``)
  }

  lines.push(`Unlocked zombies: ${result.unlockedZombies}`)
  lines.push(`Completions (last 15min): ${result.completions15min}`)
  lines.push('')
  lines.push(`_Action: Orion alerted — check Command Center_`)
  lines.push(`_Checked at: ${result.checkedAt}_`)

  return lines.join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const result = await runHealthCheck()

    console.log(`[pipeline-health] alert_level=${result.alert_level} activeJobs=${result.activeJobs} completions2h=${result.completions2h} completions15min=${result.completions15min} unlockedZombies=${result.unlockedZombies}`)

    // Send Telegram alert for WARNING and CRITICAL
    if (result.alert_level !== 'OK') {
      const alertMsg = buildAlertMessage(result)
      await sendTelegramAlert(alertMsg)
      console.log(`[pipeline-health] Telegram alert sent: ${result.alert_level}`)
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[pipeline-health] Health check failed:', error)
    return NextResponse.json(
      { error: 'Health check failed', detail: error, checkedAt: new Date().toISOString() },
      { status: 500 },
    )
  }
}
