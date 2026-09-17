// app/api/cron/hal-watchdog/route.ts
//
// HAL dead-man alarm — runs every 30 minutes.
// Fires a Telegram alert if HAL is silent >HAL_DEAD_MAN_MS AND queue has work.
//
// Priority 3 (auto-restart-then-escalate):
//   First missed window  → attempt HAL restart silently (kick dispatch-queue)
//   Second+ missed window → escalate with full Telegram alert to Marc
//
// Registration (Vercel cron — add to vercel.json):
//   { "path": "/api/cron/hal-watchdog", "schedule": "*/30 * * * *" }
//   Vercel sends POST with Authorization: Bearer <CRON_SECRET>
//
// Required env vars:
//   CRON_SECRET               — shared secret for cron authorization
//   TELEGRAM_BOT_TOKEN        — Telegram bot token (NOT YET IN .env.local — must be added)
//   MARC_TELEGRAM_CHAT_ID     — Marc's Telegram chat ID (NOT YET IN .env.local — must be added)
//   NEXT_PUBLIC_SUPABASE_URL  — already present
//   SUPABASE_SERVICE_ROLE_KEY — already present
//   NEXT_PUBLIC_BASE_URL      — already present

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getLastHalHeartbeat } from '@/lib/halHeartbeat'

export const runtime = 'nodejs'
export const maxDuration = 30

// 2 hours — HAL must have written at least one heartbeat in this window
const HAL_DEAD_MAN_MS   = 2 * 60 * 60 * 1000
// 35-minute lookback for restart_attempt — slightly longer than cron interval
const RESTART_LOOKBACK_MS = 35 * 60 * 1000

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const MARC_CHAT_ID   = process.env.MARC_TELEGRAM_CHAT_ID || '8737860822'

async function sendTelegramAlert(text: string): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.error('[hal-watchdog] TELEGRAM_BOT_TOKEN not set — cannot send alert')
    return
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: MARC_CHAT_ID, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[hal-watchdog] Telegram send failed:', res.status, body)
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── 1. Check HAL silence ─────────────────────────────────────────────────
  const { lastEventAt, lastEvent, silentMs } = await getLastHalHeartbeat()
  const silentHours = Number.isFinite(silentMs)
    ? (silentMs / 3_600_000).toFixed(1)
    : '∞'
  const halSilent = silentMs > HAL_DEAD_MAN_MS

  // ── 2. Check queued work ─────────────────────────────────────────────────
  const { count: queuedCount } = await sb
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_state', 'stories_in_queue')
    .eq('needs_attention', false)

  const hasQueuedWork = (queuedCount ?? 0) > 0

  // ── 3. All clear ─────────────────────────────────────────────────────────
  if (!halSilent || !hasQueuedWork) {
    return NextResponse.json({
      ok: true,
      halSilent,
      hasQueuedWork,
      silentMs: Number.isFinite(silentMs) ? silentMs : null,
      queuedCount,
    })
  }

  // ── 4. HAL is silent AND queue has work — evaluate restart history ────────
  const { data: recentRestart } = await sb
    .from('hal_heartbeat')
    .select('created_at')
    .eq('event', 'restart_attempt')
    .gte('created_at', new Date(Date.now() - RESTART_LOOKBACK_MS).toISOString())
    .limit(1)
    .single()

  const lastSeen = lastEventAt
    ? lastEventAt.toLocaleString('en-US', { timeZone: 'America/New_York' })
    : 'never'

  if (!recentRestart) {
    // ── 4a. First miss — attempt silent restart, do NOT alert Marc yet ──────
    await sb.from('hal_heartbeat').insert({
      event: 'restart_attempt',
      meta: {
        reason: `HAL silent ${silentHours}h, ${queuedCount} stories queued`,
        lastEvent,
        lastSeenET: lastSeen,
        attemptedAt: new Date().toISOString(),
      },
    })

    // Kick the dispatch-queue cron endpoint to nudge HAL
    try {
      const kickUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/dispatch-queue`
      await fetch(kickUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    } catch (err) {
      console.error('[hal-watchdog] dispatch-queue kick failed:', err)
    }

    console.log(`[hal-watchdog] First miss: HAL silent ${silentHours}h, ${queuedCount} queued. Restart attempted. Will escalate next cycle if no response.`)
    return NextResponse.json({
      ok: true,
      restartAttempted: true,
      silentHours,
      queuedCount,
    })
  }

  // ── 4b. Second+ miss with recent restart attempt — escalate to Marc ───────
  await sendTelegramAlert(
    `🔴 <b>HAL DEAD-MAN ALARM</b>\n\n` +
    `HAL has been silent <b>${silentHours}h</b> with <b>${queuedCount} stories</b> waiting in queue.\n\n` +
    `Last heartbeat: ${lastSeen} ET (event: <code>${lastEvent ?? 'none'}</code>)\n` +
    `Queued stories: ${queuedCount}\n\n` +
    `Auto-restart was attempted in the last 35 min and HAL did not respond.\n` +
    `<b>Action required:</b> check HAL sessions, restart manually.`
  )

  console.log(`[hal-watchdog] Escalated to Marc: HAL silent ${silentHours}h, ${queuedCount} queued.`)
  return NextResponse.json({
    ok: true,
    alerted: true,
    silentHours,
    queuedCount,
  })
}
