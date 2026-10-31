// CAC Forecast model — MODELED, NOT LIVE. No live Meta/Supabase wiring.
// Pure functions; editable scenario constants below.

export type ScenarioName = 'best' | 'likely' | 'worst'

export interface ScenarioRates {
  /** Cost per click in USD */
  cpc: number
  /** Click -> trial conversion rate (0-1) */
  clickToTrial: number
  /** Trial -> paid conversion rate (0-1) */
  trialToPaid: number
}

// EDITABLE CONSTANTS — funnel assumptions per scenario.
export const SCENARIO_RATES: Record<ScenarioName, ScenarioRates> = {
  best: { cpc: 0.8, clickToTrial: 0.25, trialToPaid: 0.35 },
  likely: { cpc: 1.2, clickToTrial: 0.18, trialToPaid: 0.25 },
  worst: { cpc: 1.8, clickToTrial: 0.12, trialToPaid: 0.15 },
}

export const SCENARIO_LABELS: Record<ScenarioName, string> = {
  best: 'Best',
  likely: 'Likely',
  worst: 'Worst',
}

export const SPEND_WEEKS = 6
export const TOTAL_WEEKS = 8
/** Trial started in week w converts to paid in week w + PAID_LAG_WEEKS */
export const PAID_LAG_WEEKS = 2

export interface WeekRow {
  week: number
  spend: number
  clicks: number
  trials: number
  newPaid: number
  cumSpend: number
  cumPaid: number
  /** Running CAC = cumSpend / cumPaid; null when no paid yet */
  runningCac: number | null
}

export interface ScenarioResult {
  scenario: ScenarioName
  weeks: WeekRow[]
  totalSpend: number
  totalPaid: number
  /** Final running CAC at week 8; null when no paid */
  finalCac: number | null
}

/** Weekly spend: budget spread evenly over weeks 1-6, $0 in weeks 7-8. */
export function weeklySpend(budget: number, week: number): number {
  if (week < 1 || week > TOTAL_WEEKS) return 0
  return week <= SPEND_WEEKS ? budget / SPEND_WEEKS : 0
}

export function simulateScenario(budget: number, scenario: ScenarioName): ScenarioResult {
  const rates = SCENARIO_RATES[scenario]
  const safeBudget = Math.max(0, budget || 0)
  const trialsByWeek: number[] = []
  const weeks: WeekRow[] = []
  let cumSpend = 0
  let cumPaid = 0

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const spend = weeklySpend(safeBudget, w)
    const clicks = rates.cpc > 0 ? spend / rates.cpc : 0
    const trials = clicks * rates.clickToTrial
    trialsByWeek[w] = trials
    // Trial from week w-2 converts to paid this week
    const newPaid = (trialsByWeek[w - PAID_LAG_WEEKS] ?? 0) * rates.trialToPaid
    cumSpend += spend
    cumPaid += newPaid
    weeks.push({
      week: w,
      spend,
      clicks,
      trials,
      newPaid,
      cumSpend,
      cumPaid,
      runningCac: cumPaid > 0 ? cumSpend / cumPaid : null,
    })
  }

  const last = weeks[weeks.length - 1]
  return {
    scenario,
    weeks,
    totalSpend: cumSpend,
    totalPaid: cumPaid,
    finalCac: last.runningCac,
  }
}

export function simulateAll(budget: number): Record<ScenarioName, ScenarioResult> {
  return {
    best: simulateScenario(budget, 'best'),
    likely: simulateScenario(budget, 'likely'),
    worst: simulateScenario(budget, 'worst'),
  }
}

export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function formatCac(n: number | null): string {
  if (n === null || !isFinite(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}
