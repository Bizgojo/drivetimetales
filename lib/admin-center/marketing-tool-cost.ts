// Marketing tool cost is display-only context: it is never ad spend and is
// excluded from the $4,000 cap, CAC and cost-per-trial everywhere.
export const AIRTABLE_CAMPAIGN_BASE_URL = 'https://airtable.com/appPYSnJkNbWCc9Lj'
export const MARKETING_TOOL_COST_TABLE_ID = 'tblXxUmh9BlGIQZ3F'

export type MarketingToolCost = {
  found: boolean
  recordId: string | null
  name: string | null
  plan: string | null
  monthlyCost: number | null
  billing: string | null
  start: string | null
  active: boolean | null
}

const NAME_KEYS = ['Name', 'Vendor', 'Tool', 'Service', 'Expense', 'Item', 'Description']
const PLAN_KEYS = ['Plan', 'Tier', 'Plan Name', 'Subscription']
const COST_KEYS = ['Monthly Equivalent', 'Monthly Cost', 'Monthly Amount', 'Amount', 'Cost']
const BILLING_KEYS = ['Billing', 'Billing Cycle', 'Frequency', 'Cycle']
const START_KEYS = ['Start', 'Start Date', 'Effective Date', 'Since']

export function firstText(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

export function costOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function monthlyCostOrNull(fields: Record<string, unknown>): number | null {
  for (const key of COST_KEYS) {
    const value = costOrNull(fields[key])
    if (value !== null) return value
  }
  return null
}

export function activeOrNull(fields: Record<string, unknown>): boolean | null {
  const value = fields.Active
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'active', 'y'].includes(s)) return true
    if (['0', 'false', 'no', 'inactive', 'n'].includes(s)) return false
  }
  return null
}

export function findAirtableToolRecord(records: { id: string; fields: Record<string, unknown> }[]): { id: string; fields: Record<string, unknown> } | null {
  for (const record of records) {
    const name = firstText(record.fields, NAME_KEYS) || ''
    if (/airtable/i.test(name)) return record
  }
  return null
}

export function normalizeMarketingToolCost(record: { id: string; fields: Record<string, unknown> } | null): MarketingToolCost {
  if (!record) return { found: false, recordId: null, name: null, plan: null, monthlyCost: null, billing: null, start: null, active: null }
  const fields = record.fields || {}
  return {
    found: true,
    recordId: record.id,
    name: firstText(fields, NAME_KEYS),
    plan: firstText(fields, PLAN_KEYS),
    monthlyCost: monthlyCostOrNull(fields),
    billing: firstText(fields, BILLING_KEYS),
    start: firstText(fields, START_KEYS),
    active: activeOrNull(fields),
  }
}
