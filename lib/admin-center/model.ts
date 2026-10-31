export const CATEGORIES = ['Story Production', 'Marketing', 'R&D', 'Operations'] as const
export type Policy = { marketingPercent: number; essential: number; taxes: number; reserve: number; committedMarketing: number }
export const DEFAULT_POLICY: Policy = { marketingPercent: 75, essential: 0, taxes: 0, reserve: 0, committedMarketing: 4000 }
export function validPolicy(p: any): p is Policy {
  return p && Object.keys(DEFAULT_POLICY).every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= (k === 'marketingPercent' ? 100 : 100000000))
}
// Planning only: a collection is never a capital deposit; cash caps all allocations.
export function allocation(collections: number, cash: number, p: Policy) {
  const protectedFunds = p.essential + p.taxes + p.reserve
  const eligible = Math.max(0, collections - p.essential - p.taxes)
  const available = Math.max(0, cash - protectedFunds)
  const target = eligible * p.marketingPercent / 100
  const marketing = Math.min(available, Math.max(target, p.committedMarketing))
  return { protectedFunds, eligible, target, marketing, shortfall: Math.max(0, protectedFunds + p.committedMarketing - cash), distributable: Math.max(0, available - marketing) }
}
export function forecast(input: { subscribers: number; cash: number; arpu: number; cac: number; churn: number; growth: number; monthlyCost: number; percent: number }) {
  if (Object.values(input).some(n => !Number.isFinite(n) || n < 0) || input.cac <= 0 || input.churn > 1 || input.percent > 100) throw new Error('Invalid forecast assumptions')
  let subscribers = input.subscribers, cash = input.cash
  return Array.from({ length: 12 }, (_, i) => {
    const revenue = subscribers * input.arpu
    const spend = Math.min(Math.max(0, cash + revenue - input.monthlyCost), Math.max(0, revenue - input.monthlyCost) * input.percent / 100)
    subscribers = Math.max(0, subscribers * (1 - input.churn) + spend / input.cac + input.growth)
    cash += revenue - input.monthlyCost - spend
    return { month: i + 1, subscribers, revenue, spend, cash, surplus: Math.max(0, revenue - input.monthlyCost - spend) }
  })
}
export function safeActionPath(path: unknown): path is string {
  return typeof path === 'string' && /^\/admin(?:[/?#]|$)/.test(path) && !/[\\\r\n]/.test(path)
}
export function isQuiet(hour: number, start: number, end: number) {
  return start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end
}
export function pendingVoice(job: any) {
  const r = job.state_json?.castReview
  return !!r && job.status === 'waiting_for_external' && job.error_json?.kind === 'awaiting_cast_approval' && !r.approvedAt && !r.approved_at && !r.approved && r.status !== 'approved'
}
