/**
 * scripts/cfo-report/compile.ts
 * Aggregates all data sources and compiles the 8-section CFO Morning Report.
 *
 * Usage:
 *   npx ts-node scripts/cfo-report/compile.ts           # live run
 *   npx ts-node scripts/cfo-report/compile.ts --dry-run # mock/stub data
 *
 * All calculations shown explicitly — never fabricate missing data.
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { fetchMercuryData, type MercuryData, type MercuryStale } from './mercury'
import { fetchStripeData, type StripeData, type StripeStale } from './stripe'
import { fetchElevenLabsData, type ElevenLabsData, type ElevenLabsStale } from './elevenlabs'
import { fetchMetaData, type MetaData, type MetaStale } from './meta'
import { fetchHalStatus, type HalStatusData, type HalStatusStale } from './hal-status'
import * as fs from 'fs'
import * as path from 'path'

// ─── AI Cost Overrides (Anthropic + OpenAI — no billing API available) ───────
// Bart updates scripts/cfo-report/ai-cost-overrides.json each morning from
// the Anthropic Console and OpenAI billing page. Compiler reads it here.
// If the file's date != today, values are used but flagged STALE.
interface AiCostOverrides {
  date: string          // YYYY-MM-DD
  anthropicMtd: number
  openAiMtd: number
  source: string
  updatedBy?: string
}

function loadAiCostOverrides(): { data: AiCostOverrides | null; stale: boolean; staleDays: number } {
  try {
    const filePath = path.join(__dirname, 'ai-cost-overrides.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw) as AiCostOverrides
    const today = new Date().toISOString().slice(0, 10)
    const staleDays = Math.floor(
      (new Date(today).getTime() - new Date(data.date).getTime()) / (1000 * 60 * 60 * 24)
    )
    return { data, stale: staleDays > 0, staleDays }
  } catch {
    return { data: null, stale: true, staleDays: 999 }
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CfoAlert {
  level: 'red' | 'yellow' | 'green'
  message: string
}

export interface CfoLedger {
  anthropicMtd: number
  openAiMtd: number
  elMtd: number
  totalAI: number
  infraMtd: number
  totalSpend: number
  revenueMtd: number
  netBurn: number
  daysElapsed: number
  daysInMonth: number
  dailyBurn: number
  runway: number | null
  breakEvenSubs: number | null
  netRevPerSub: number
  workings: string[]
}

export interface CfoReport {
  reportDate: string
  generatedAt: string

  // Section 1
  alerts: CfoAlert[]

  // Section 2
  banking: MercuryData | MercuryStale

  // Section 3
  elevenlabs: ElevenLabsData | ElevenLabsStale

  // Section 4
  halStatus: HalStatusData | HalStatusStale

  // Section 5 — derived from banking.transactions24h
  expenses24h: Array<{
    merchant: string
    card: string
    amount: number
    purpose: string
  }>

  // Section 6
  revenue: StripeData | StripeStale

  // Section 7
  ledger: CfoLedger

  // Section 8
  assessment: {
    runway: string
    breakEven: string
    keyRisks: string[]
  }

  // Meta
  blockers: string[]
}

// ─── Mock data for --dry-run ──────────────────────────────────────────────────

function getMockData() {
  const mercury: MercuryData = {
    balance: 42_180.55,
    accountName: 'Endless Tales Checking',
    accountKind: 'checking',
    cards: [
      { id: 'c1', name: 'GVL-Meta', last4: '7468', balance: 0, dailyLimit: 500, monthlyLimit: 5000, status: 'active' },
      { id: 'c2', name: 'GVL-TikTok', last4: '3966', balance: 0, dailyLimit: 500, monthlyLimit: 5000, status: 'active' },
      { id: 'c3', name: 'ET-Cover', last4: '9687', balance: 0, dailyLimit: 200, monthlyLimit: 2000, status: 'active' },
    ],
    transactions24h: [
      { id: 't1', merchant: 'Anthropic', card: 'ET-Cover (…9687)', amount: 23.40, postedAt: null, createdAt: new Date().toISOString(), purpose: 'Claude API', counterpartyName: 'Anthropic' },
      { id: 't2', merchant: 'ElevenLabs', card: 'ET-Cover (…9687)', amount: 315.33, postedAt: null, createdAt: new Date().toISOString(), purpose: 'EL subscription', counterpartyName: 'ElevenLabs' },
    ],
    stale: false,
    fetchedAt: new Date().toISOString(),
  }

  const stripe: StripeStale = {
    stale: true,
    reason: 'DRY RUN — STRIPE_SECRET_KEY not configured',
  }

  const elevenlabs: ElevenLabsData = {
    creditsUsed: 1_420_000,
    creditsTotal: 2_000_000,
    pctUsed: 71.0,
    remaining: 580_000,
    pipelineNeeded: 132_000,
    surplus: 448_000,
    tier: 'growing_business',
    stale: false,
    fetchedAt: new Date().toISOString(),
  }

  const meta: MetaStale = {
    stale: true,
    reason: 'DRY RUN — META_ACCESS_TOKEN not configured',
  }

  const halStatus: HalStatusData = {
    series: [
      {
        seriesTitle: 'Sunset of Competition',
        seriesId: 'soc',
        episodes: [
          { episodeNumber: 19, title: 'The Final Lap', workflowState: 'Mixing', needsAttention: false, updatedAt: new Date().toISOString() },
          { episodeNumber: 20, title: 'Victory Lane', workflowState: 'Voice Gen', needsAttention: true, updatedAt: new Date().toISOString(), blocker: '⚠️ Needs attention' },
        ],
      },
    ],
    totalActive: 2,
    totalNeedsAttention: 1,
    stale: false,
    fetchedAt: new Date().toISOString(),
  }

  return { mercury, stripe, elevenlabs, meta, halStatus }
}

// ─── Calculation engine ───────────────────────────────────────────────────────

function compileLedger(params: {
  mercury: MercuryData | MercuryStale
  stripe: StripeData | StripeStale
  elevenlabs: ElevenLabsData | ElevenLabsStale
}): CfoLedger {
  const workings: string[] = []

  // ── AI costs: read from Console-verified override file ──────────────────────
  // Anthropic and OpenAI billing APIs are not accessible with project API keys.
  // Bart updates scripts/cfo-report/ai-cost-overrides.json each morning.
  const aiOverrides = loadAiCostOverrides()
  const anthropicMtd = aiOverrides.data?.anthropicMtd ?? 0
  const openAiMtd    = aiOverrides.data?.openAiMtd    ?? 0
  const aiSource = aiOverrides.data
    ? aiOverrides.stale
      ? `STALE (last verified ${aiOverrides.data.date}, ${aiOverrides.staleDays}d ago)`
      : `Console-verified ${aiOverrides.data.date} — ${aiOverrides.data.source}`
    : 'UNVERIFIED — ai-cost-overrides.json missing'
  const elMtd    = 315.33 // EL plan subscription (overage tracked separately)
  const infraMtd = 20     // Vercel Pro

  const totalAI = anthropicMtd + openAiMtd + elMtd
  workings.push(`anthropicMtd = $${anthropicMtd.toFixed(2)} [${aiSource}]`)
  workings.push(`openAiMtd    = $${openAiMtd.toFixed(2)} [${aiSource}]`)
  workings.push(`totalAI = anthropicMtd(${anthropicMtd}) + openAiMtd(${openAiMtd}) + elMtd(${elMtd}) = ${totalAI.toFixed(2)}`)

  const totalSpend = totalAI + infraMtd
  workings.push(`totalSpend = totalAI(${totalAI}) + infraMtd(${infraMtd}) = ${totalSpend}`)

  const stripeData = params.stripe.stale ? null : (params.stripe as StripeData)
  const revenueMtd = stripeData ? stripeData.mrr : 0
  workings.push(`revenueMtd = ${params.stripe.stale ? 'STALE (0 used)' : revenueMtd}`)

  const netBurn = totalSpend - revenueMtd
  workings.push(`netBurn = totalSpend(${totalSpend}) - revenueMtd(${revenueMtd}) = ${netBurn}`)

  const now = new Date()
  const daysElapsed = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dailyBurn = daysElapsed > 0 ? totalSpend / daysElapsed : 0
  workings.push(`dailyBurn = totalSpend(${totalSpend}) / daysElapsed(${daysElapsed}) = ${dailyBurn.toFixed(2)}/day`)

  const mercuryData = params.mercury.stale ? null : (params.mercury as MercuryData)
  const balance = mercuryData ? mercuryData.balance : null
  let runway: number | null = null
  if (balance !== null && dailyBurn > 0) {
    runway = balance / dailyBurn
    workings.push(`runway = balance(${balance}) / dailyBurn(${dailyBurn.toFixed(2)}) = ${runway.toFixed(0)} days`)
  } else {
    workings.push(`runway = N/A (balance ${balance !== null ? 'ok' : 'STALE'}, dailyBurn=${dailyBurn.toFixed(2)})`)
  }

  // Break-even: assume ~$14.99/mo plan, 30% Apple/Google take, $0.30 Stripe fee
  const netRevPerSub = 14.99 * 0.70 - 0.30 // ≈ $10.19

  // Break-even #1 — MTD total spend (this month's actuals, incl. R&D AI)
  let breakEvenSubs: number | null = null
  if (netRevPerSub > 0) {
    breakEvenSubs = Math.ceil(totalSpend / netRevPerSub)
    workings.push(`breakEvenSubs (MTD actuals) = ceil(totalSpend(${totalSpend.toFixed(2)}) / netRevPerSub(${netRevPerSub.toFixed(2)})) = ${breakEvenSubs}`)
  }

  // Break-even #2 — Steady-state run-rate (EL + Infra only; excludes one-time R&D AI)
  // This is the floor needed once AI R&D spend normalises
  const steadyStateCost = elMtd + infraMtd
  let breakEvenSubsSteadyState: number | null = null
  if (netRevPerSub > 0) {
    breakEvenSubsSteadyState = Math.ceil(steadyStateCost / netRevPerSub)
    workings.push(`breakEvenSubs (steady-state EL+Infra) = ceil(steadyState(${steadyStateCost.toFixed(2)}) / netRevPerSub(${netRevPerSub.toFixed(2)})) = ${breakEvenSubsSteadyState}`)
  }

  return {
    anthropicMtd,
    openAiMtd,
    elMtd,
    totalAI,
    infraMtd,
    totalSpend,
    revenueMtd,
    netBurn,
    daysElapsed,
    daysInMonth,
    dailyBurn,
    runway,
    breakEvenSubs,
    breakEvenSubsSteadyState,
    steadyStateCost,
    netRevPerSub,
    workings,
  }
}

function buildAlerts(params: {
  mercury: MercuryData | MercuryStale
  elevenlabs: ElevenLabsData | ElevenLabsStale
  halStatus: HalStatusData | HalStatusStale
  ledger: CfoLedger
  blockers: string[]
}): CfoAlert[] {
  const alerts: CfoAlert[] = []

  // Cash alerts
  const mercuryLive = params.mercury.stale ? null : (params.mercury as MercuryData)
  if (!mercuryLive) {
    alerts.push({ level: 'red', message: '🏦 Mercury data STALE — bank balance unverified' })
  } else if (mercuryLive.balance < 5000) {
    alerts.push({ level: 'red', message: `🏦 Low cash: $${mercuryLive.balance.toLocaleString()} — top up needed` })
  } else if (mercuryLive.balance < 15000) {
    alerts.push({ level: 'yellow', message: `🏦 Cash below $15k: $${mercuryLive.balance.toLocaleString()}` })
  } else {
    alerts.push({ level: 'green', message: `🏦 Cash OK: $${mercuryLive.balance.toLocaleString()}` })
  }

  // EL credits
  if (params.elevenlabs.stale) {
    alerts.push({ level: 'yellow', message: '🎙 ElevenLabs data STALE' })
  } else {
    const el = params.elevenlabs as ElevenLabsData
    if (el.surplus < 0) {
      alerts.push({ level: 'red', message: `🎙 EL credits SHORT by ${Math.abs(el.surplus).toLocaleString()} chars for pipeline` })
    } else if (el.pctUsed > 90) {
      alerts.push({ level: 'yellow', message: `🎙 EL at ${el.pctUsed}% — pipeline may be tight` })
    } else {
      alerts.push({ level: 'green', message: `🎙 EL OK: ${el.pctUsed}% used, surplus ${el.surplus.toLocaleString()} chars` })
    }
  }

  // Hal pipeline
  if (!params.halStatus.stale) {
    const hs = params.halStatus as HalStatusData
    if (hs.totalNeedsAttention > 0) {
      alerts.push({ level: 'yellow', message: `🎬 ${hs.totalNeedsAttention} episode(s) need attention in pipeline` })
    } else if (hs.totalActive > 0) {
      alerts.push({ level: 'green', message: `🎬 ${hs.totalActive} episode(s) in production — no blockers` })
    }
  }

  // Runway
  if (params.ledger.runway !== null && params.ledger.runway < 30) {
    alerts.push({ level: 'red', message: `⏱ Runway < 30 days: ${params.ledger.runway.toFixed(0)} days` })
  } else if (params.ledger.runway !== null && params.ledger.runway < 90) {
    alerts.push({ level: 'yellow', message: `⏱ Runway ${params.ledger.runway.toFixed(0)} days — watch spend` })
  }

  // Blockers
  for (const blocker of params.blockers) {
    alerts.push({ level: 'yellow', message: `⚠️ ${blocker}` })
  }

  return alerts
}

// ─── Main compile function ────────────────────────────────────────────────────

export async function compileCfoReport(dryRun = false): Promise<CfoReport> {
  const reportDate = new Date().toISOString().slice(0, 10)
  const generatedAt = new Date().toISOString()

  console.log(`[cfo/compile] Building report for ${reportDate} (dryRun=${dryRun})`)

  let mercury: MercuryData | MercuryStale
  let stripe: StripeData | StripeStale
  let elevenlabs: ElevenLabsData | ElevenLabsStale
  let meta: MetaData | MetaStale
  let halStatus: HalStatusData | HalStatusStale

  if (dryRun) {
    const mock = getMockData()
    mercury = mock.mercury
    stripe = mock.stripe
    elevenlabs = mock.elevenlabs
    meta = mock.meta
    halStatus = mock.halStatus
    console.log('[cfo/compile] Using mock data (--dry-run)')
  } else {
    console.log('[cfo/compile] Fetching live data...')
    ;[mercury, stripe, elevenlabs, meta, halStatus] = await Promise.all([
      fetchMercuryData(),
      fetchStripeData(),
      fetchElevenLabsData(),
      fetchMetaData(),
      fetchHalStatus(),
    ])
    console.log('[cfo/compile] All data sources fetched')
  }

  // Identify blockers
  const blockers: string[] = []
  if (stripe.stale) blockers.push(`Stripe rollup BLOCKED — ${(stripe as StripeStale).reason}`)
  if (meta.stale) blockers.push(`Meta ad spend BLOCKED — ${(meta as MetaStale).reason}`)
  if (mercury.stale) blockers.push(`Mercury banking BLOCKED — ${(mercury as MercuryStale).reason}`)

  // Compile ledger
  const ledger = compileLedger({ mercury, stripe, elevenlabs })

  // Build alerts
  const alerts = buildAlerts({ mercury, elevenlabs, halStatus, ledger, blockers })

  // Extract 24h expenses from Mercury (or empty if stale)
  const expenses24h = mercury.stale
    ? []
    : (mercury as MercuryData).transactions24h.map(tx => ({
        merchant: tx.merchant,
        card: tx.card,
        amount: tx.amount,
        purpose: tx.purpose || tx.counterpartyName,
      }))

  // Build CFO assessment
  const runwayStr = ledger.runway !== null
    ? `${ledger.runway.toFixed(0)} days at current burn rate of $${ledger.dailyBurn.toFixed(2)}/day`
    : 'Cannot calculate — bank data stale'

  const breakEvenStr = ledger.breakEvenSubs !== null
    ? [
        `MTD actuals: ${ledger.breakEvenSubs} subs @ $${ledger.totalSpend.toFixed(2)}/mo`,
        `Steady-state (EL+Infra, excl. R&D AI): ${ledger.breakEvenSubsSteadyState ?? 'N/A'} subs @ $${ledger.steadyStateCost.toFixed(2)}/mo`,
        `Net rev/sub: $${ledger.netRevPerSub.toFixed(2)}`,
      ].join(' \u00b7 ')
    : 'Cannot calculate'

  const keyRisks: string[] = []
  if (stripe.stale) keyRisks.push('Revenue data unavailable — add STRIPE_SECRET_KEY to activate Stripe rollup')
  if (meta.stale) keyRisks.push('Ad spend data unavailable — add META_ACCESS_TOKEN + META_AD_ACCOUNT_ID to activate')
  if (!elevenlabs.stale && (elevenlabs as ElevenLabsData).pctUsed > 80) {
    keyRisks.push(`ElevenLabs at ${(elevenlabs as ElevenLabsData).pctUsed}% — overage charges possible`)
  }
  if (!halStatus.stale && (halStatus as HalStatusData).totalNeedsAttention > 0) {
    keyRisks.push(`${(halStatus as HalStatusData).totalNeedsAttention} episode(s) in pipeline need Hal attention`)
  }
  if (keyRisks.length === 0) keyRisks.push('No critical risks identified today')

  const report: CfoReport = {
    reportDate,
    generatedAt,
    alerts,
    banking: mercury,
    elevenlabs,
    halStatus,
    expenses24h,
    revenue: stripe,
    ledger,
    assessment: { runway: runwayStr, breakEven: breakEvenStr, keyRisks },
    blockers,
  }

  console.log('[cfo/compile] Report compiled successfully')
  return report
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  ;(async () => {
    try {
      const report = await compileCfoReport(dryRun)
      console.log('\n' + '='.repeat(60))
      console.log('CFO MORNING REPORT —', report.reportDate)
      console.log('='.repeat(60))
      console.log('\n── ALERTS ──')
      for (const a of report.alerts) {
        const emoji = a.level === 'red' ? '🔴' : a.level === 'yellow' ? '🟡' : '🟢'
        console.log(`${emoji} ${a.message}`)
      }
      console.log('\n── LEDGER WORKINGS ──')
      for (const w of report.ledger.workings) console.log(`  ${w}`)
      console.log('\n── BLOCKERS ──')
      if (report.blockers.length === 0) console.log('  None')
      for (const b of report.blockers) console.log(`  ⛔ ${b}`)
      console.log('\nFull JSON:')
      console.log(JSON.stringify(report, null, 2))
    } catch (err) {
      console.error('[cfo/compile] Fatal error:', err)
      process.exit(1)
    }
  })()
}
