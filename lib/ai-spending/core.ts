export const TIMEZONE = 'America/New_York'
// Roster supplied by Marc: ETD Agent Fleet Architecture v1.0, 2026-10-03.
// Declared model assignments are not a substitute for live configuration verification.
export const AGENT_ROSTER = [
  { name: 'Orion', role: 'COO', type: 'Persistent', model: 'Meta Muse-Spark 1.3; Claude fallback' },
  { name: 'Strategos', role: 'CSO', type: 'Persistent', model: 'DeepSeek R1' },
  { name: 'Lyra', role: 'CTO', type: 'Persistent', model: 'DeepSeek R1' },
  { name: 'Atlas', role: 'Chief Engineer', type: 'Persistent', model: 'DeepSeek V3' },
  { name: 'Hal', role: 'Content Director', type: 'Task role', model: 'Chosen per task' },
  { name: 'Vega', role: 'Audio QC Manager', type: 'Task role', model: 'Chosen per task' },
  { name: 'Susan', role: 'Marketing Manager', type: 'Task role', model: 'Chosen per task' },
  { name: 'Maya', role: 'Product / UX', type: 'Task role', model: 'Chosen per task' },
  { name: 'Bart', role: 'CFO', type: 'Task role', model: 'Chosen per task' },
  { name: 'Lex', role: 'General Counsel', type: 'Task role', model: 'Chosen per task' },
  { name: 'Scribe', role: 'Head of Publishing', type: 'Task role', model: 'Chosen per task' },
]
export const AGENTS = [...AGENT_ROSTER.map(a => a.name), 'Marc', 'Shared', 'Unassigned']
export const PROVIDERS = [
  { id: 'OpenAI', label: 'OpenAI API / DALL-E covers', url: 'https://platform.openai.com/account/billing', action: 'Add credits', source: 'openai_usage_log' },
  { id: 'Anthropic', label: 'Anthropic API', url: 'https://platform.claude.com/settings/billing', action: 'Add credits', source: 'anthropic_usage_log' },
  { id: 'ElevenLabs', label: 'ElevenLabs', url: 'https://elevenlabs.io/app/subscription', action: 'Credits / subscription', source: 'el_usage_log' },
  { id: 'KIE.ai', label: 'KIE.ai', url: 'https://kie.ai/billing', action: 'Add credits', source: null },
  { id: 'ChatGPT', label: 'ChatGPT subscription', url: 'https://chatgpt.com/', action: 'Manage subscription', source: null },
  { id: 'Claude', label: 'Claude subscription', url: 'https://claude.ai/settings/billing', action: 'Manage subscription', source: null },
  { id: 'Suno', label: 'Suno', url: 'https://suno.com/', action: 'Credits / subscription', source: null },
  { id: 'Muse Spark', label: 'Meta Muse Spark', url: 'https://dev.meta.ai/', action: 'Manage API billing', source: null },
  { id: 'DeepSeek', label: 'DeepSeek R1 / V3', url: 'https://platform.deepseek.com/', action: 'Add credits', source: null },
  { id: 'Hindsight', label: 'Hindsight memory', url: 'https://ui.hindsight.vectorize.io/', action: 'Open cloud account', source: null },
  { id: 'OpenRouter', label: 'OpenRouter (if used)', url: 'https://openrouter.ai/settings/credits', action: 'Add credits', source: null },
  { id: 'Other AI', label: 'Other AI subscriptions / APIs', url: null, action: '', source: null },
]
export type Kind = 'usage' | 'subscription' | 'credit_purchase' | 'invoice'
export type DailyCost = { date: string; provider: string; agent: string; model?: string; kind: Kind; amount: number; calls: number }
export function dayKey(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date')
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(k => p.find(v => v.type === k)!.value).join('-')
}
export function shiftDay(day: string, days: number) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
export function monday(day: string) { return shiftDay(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7)) }
export function providerFor(vendor: string): string | null {
  const s = vendor.toLowerCase()
  if (/deepseek/.test(s)) return 'DeepSeek'
  if (/muse|meta.*spark/.test(s)) return 'Muse Spark'
  if (/hindsight/.test(s)) return 'Hindsight'
  if (/openrouter/.test(s)) return 'OpenRouter'
  if (/chatgpt/.test(s) && !/openai/.test(s)) return 'ChatGPT'
  if (/anthropic/.test(s)) return 'Anthropic'
  if (/claude/.test(s)) return 'Claude'
  if (/openai|dall.e/.test(s)) return 'OpenAI'
  if (/eleven.?labs/.test(s)) return 'ElevenLabs'
  if (/kie/.test(s)) return 'KIE.ai'
  if (/suno/.test(s)) return 'Suno'
  if (/openclaw/.test(s)) return 'Other AI'
  if (s === 'other ai') return 'Other AI'
  return null
}
export function agentFor(metadata: any, description = '', vendor = ''): string {
  const candidate = metadata?.agent || metadata?.agent_name || metadata?.agent_id || /\[agent:([^\]]+)\]/i.exec(description)?.[1]
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 80)
  if (/anthropic.*\(hal\)/i.test(vendor)) return 'Hal'
  return 'Unassigned'
}
export function kindFor(description: string): Kind {
  const tag = /\[kind:(subscription|credit_purchase|invoice)\]/.exec(description)?.[1]
  return (tag as Kind) || 'invoice'
}
export function validAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null
}
export function summarize(rows: DailyCost[]) {
  const usage = rows.filter(r => r.kind === 'usage').reduce((s, r) => s + r.amount, 0)
  const cash = rows.filter(r => r.kind !== 'usage').reduce((s, r) => s + r.amount, 0)
  const subscriptions = rows.filter(r => r.kind === 'subscription').reduce((s, r) => s + r.amount, 0)
  const credits = rows.filter(r => r.kind === 'credit_purchase').reduce((s, r) => s + r.amount, 0)
  return { usage, cash, subscriptions, credits, calls: rows.reduce((s, r) => s + r.calls, 0) }
}
