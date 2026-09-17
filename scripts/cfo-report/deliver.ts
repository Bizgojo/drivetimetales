/**
 * scripts/cfo-report/deliver.ts
 * Compiles and delivers the CFO Morning Report:
 *   1. Triggers compile.ts
 *   2. Stores report JSON in Supabase (cfo_reports table) — requires migration to be run first
 *   3. Sends Telegram message to Marc via internal API
 *   4. Idempotent: skips if today's report already delivered
 *
 * Usage:
 *   npx ts-node scripts/cfo-report/deliver.ts
 *   npx ts-node scripts/cfo-report/deliver.ts --force   # re-deliver even if already sent today
 *   npx ts-node scripts/cfo-report/deliver.ts --dry-run # mock data, no send
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { compileCfoReport, type CfoReport, type CfoAlert } from './compile'

const TELEGRAM_CHAT_ID = '8737860822'
const REPORT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://endless-tales.com'
const DASHBOARD_PATH = '/admin/cfo-report'

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtUsd(n: number, decimals = 2): string {
  return `$${fmt(n, decimals)}`
}

function alertLine(a: CfoAlert): string {
  const badge = a.level === 'red' ? '🔴' : a.level === 'yellow' ? '🟡' : '🟢'
  return `${badge} ${a.message}`
}

function buildTelegramMessage(report: CfoReport): string {
  const lines: string[] = []

  lines.push(`📊 CFO Morning Report — ${report.reportDate}`)
  lines.push('')

  // Section 1: Alerts
  lines.push('── ALERTS ──')
  for (const a of report.alerts) {
    lines.push(alertLine(a))
  }
  lines.push('')

  // Section 2: Banking
  lines.push('── BANK & CARDS ──')
  if (report.banking.stale) {
    lines.push(`🏦 Mercury: STALE — ${report.banking.reason}`)
  } else {
    const bank = report.banking
    lines.push(`🏦 Mercury balance: ${fmtUsd(bank.balance)}`)
    if (bank.cards.length > 0) {
      lines.push('Virtual cards:')
      for (const card of bank.cards) {
        const limit = card.monthlyLimit > 0 ? ` / limit ${fmtUsd(card.monthlyLimit, 0)}/mo` : ''
        lines.push(`  • ${card.name} (…${card.last4}): ${fmtUsd(card.balance)}${limit}`)
      }
    } else {
      lines.push('  Cards: GVL-Meta (7468), GVL-TikTok (3966), ET-Cover (9687) [API not returning cards]')
    }
  }
  lines.push('')

  // Section 3: ElevenLabs
  lines.push('── ELEVENLABS CREDITS ──')
  if (report.elevenlabs.stale) {
    lines.push(`🎙 EL: STALE — ${report.elevenlabs.reason}`)
  } else {
    const el = report.elevenlabs
    const surplusLabel = el.surplus >= 0 ? `+${fmt(el.surplus)} surplus` : `${fmt(el.surplus)} SHORT`
    lines.push(`🎙 ${fmt(el.creditsUsed)} / ${fmt(el.creditsTotal)} chars (${el.pctUsed}% used)`)
    lines.push(`   Remaining: ${fmt(el.remaining)} | Pipeline needs: ${fmt(el.pipelineNeeded)} | ${surplusLabel}`)
  }
  lines.push('')

  // Section 4: Hal Production
  lines.push('── HAL PIPELINE ──')
  if (report.halStatus.stale) {
    lines.push(`🎬 Pipeline: STALE — ${report.halStatus.reason}`)
  } else {
    const hs = report.halStatus
    if (hs.series.length === 0) {
      lines.push('🎬 No active episodes in pipeline')
    } else {
      lines.push(`🎬 ${hs.totalActive} active episodes, ${hs.totalNeedsAttention} need attention`)
      for (const series of hs.series) {
        lines.push(`\n  ${series.seriesTitle}:`)
        for (const ep of series.episodes) {
          const attn = ep.needsAttention ? ' ⚠️' : ''
          lines.push(`    Ep ${ep.episodeNumber} — ${ep.title}: ${ep.workflowState}${attn}`)
        }
      }
    }
  }
  lines.push('')

  // Section 5: Last 24h Expenses
  lines.push('── LAST 24H EXPENSES ──')
  if (report.expenses24h.length === 0) {
    lines.push('  No transactions in last 24h (or Mercury data stale)')
  } else {
    for (const tx of report.expenses24h) {
      lines.push(`  ${fmtUsd(tx.amount)} — ${tx.merchant} [${tx.card}]${tx.purpose ? ` (${tx.purpose})` : ''}`)
    }
  }
  lines.push('')

  // Section 6: Revenue
  lines.push('── REVENUE ──')
  if (report.revenue.stale) {
    lines.push(`💳 Stripe: STALE — ${report.revenue.reason}`)
  } else {
    const rev = report.revenue
    lines.push(`💳 MRR: ${fmtUsd(rev.mrr)} | Paying subs: ${fmt(rev.payingSubCount)} | Trials: ${fmt(rev.activeTrials)}`)
    lines.push(`   New rev (24h): ${fmtUsd(rev.newRev24h)}`)
  }
  lines.push('')

  // Section 7: MTD Ledger
  lines.push('── MTD LEDGER ──')
  const l = report.ledger
  lines.push(`AI:    Anthropic ${fmtUsd(l.anthropicMtd)} + OpenAI ${fmtUsd(l.openAiMtd)} + EL ${fmtUsd(l.elMtd)} = ${fmtUsd(l.totalAI)}`)
  lines.push(`Infra: ${fmtUsd(l.infraMtd)}`)
  lines.push(`Total spend: ${fmtUsd(l.totalSpend)} | Revenue: ${fmtUsd(l.revenueMtd)} | Net burn: ${fmtUsd(l.netBurn)}`)
  lines.push(`Day ${l.daysElapsed}/${l.daysInMonth} — burn rate ${fmtUsd(l.dailyBurn)}/day`)
  lines.push('')

  // Section 8: CFO Assessment
  lines.push('── CFO ASSESSMENT ──')
  lines.push(`⏱ Runway: ${report.assessment.runway}`)
  lines.push(`🎯 Break-even: ${report.assessment.breakEven}`)
  lines.push('Key risks:')
  for (const risk of report.assessment.keyRisks) {
    lines.push(`  • ${risk}`)
  }
  lines.push('')

  // Blockers
  if (report.blockers.length > 0) {
    lines.push('── BLOCKERS ──')
    for (const b of report.blockers) lines.push(`  ⛔ ${b}`)
    lines.push('')
  }

  // Dashboard link
  lines.push(`📈 Full dashboard: ${REPORT_APP_URL}${DASHBOARD_PATH}`)
  lines.push(`Generated at: ${report.generatedAt}`)

  return lines.join('\n')
}

async function isAlreadyDeliveredToday(
  supabase: ReturnType<typeof createClient>,
  reportDate: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('cfo_reports')
      .select('id, delivered_at')
      .eq('report_date', reportDate)
      .limit(1)

    if (error) {
      // Table may not exist yet — not a fatal error
      console.warn('[cfo/deliver] Could not check cfo_reports table (may not exist yet):', error.message)
      return false
    }
    const row = data?.[0]
    return !!(row?.delivered_at)
  } catch {
    return false
  }
}

async function storeReport(
  supabase: ReturnType<typeof createClient>,
  report: CfoReport
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cfo_reports')
      .upsert(
        {
          report_date: report.reportDate,
          report_json: report as unknown as Record<string, unknown>,
          delivered_at: new Date().toISOString(),
        },
        { onConflict: 'report_date' }
      )

    if (error) {
      console.warn('[cfo/deliver] Could not store report in cfo_reports (table may not exist):', error.message)
      console.warn('[cfo/deliver] Run the migration at supabase/migrations/20260917_cfo_reports.sql first')
    } else {
      console.log('[cfo/deliver] Report stored in cfo_reports table')
    }
  } catch (err) {
    console.warn('[cfo/deliver] Store failed (non-fatal):', err)
  }
}

async function sendTelegramMessage(message: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log('\n[cfo/deliver] DRY RUN — would send Telegram message:')
    console.log('-'.repeat(60))
    console.log(message)
    console.log('-'.repeat(60))
    return
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.warn('[cfo/deliver] TELEGRAM_BOT_TOKEN not set — logging message to console only')
    console.log('\n── TELEGRAM MESSAGE (not sent) ──')
    console.log(message)
    return
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Telegram send failed ${res.status}: ${txt.slice(0, 300)}`)
  }

  console.log('[cfo/deliver] Telegram message sent to Marc')
}

export async function deliverCfoReport(options: { dryRun?: boolean; force?: boolean } = {}): Promise<void> {
  const { dryRun = false, force = false } = options

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey)
    : null

  const reportDate = new Date().toISOString().slice(0, 10)

  // Idempotency check
  if (!force && !dryRun && supabase) {
    const alreadyDone = await isAlreadyDeliveredToday(supabase, reportDate)
    if (alreadyDone) {
      console.log(`[cfo/deliver] Report for ${reportDate} already delivered — skipping (use --force to override)`)
      return
    }
  }

  // Compile
  console.log('[cfo/deliver] Compiling report...')
  const report = await compileCfoReport(dryRun)

  // Build message
  const message = buildTelegramMessage(report)

  // Store in Supabase
  if (supabase && !dryRun) {
    await storeReport(supabase, report)
  }

  // Send Telegram
  await sendTelegramMessage(message, dryRun)

  console.log('[cfo/deliver] Done')
}

// CLI entry point
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  ;(async () => {
    try {
      await deliverCfoReport({ dryRun, force })
    } catch (err) {
      console.error('[cfo/deliver] Fatal error:', err)
      process.exit(1)
    }
  })()
}
