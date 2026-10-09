import { dayKey } from './core'

export const EXPORT_KEYS = ['ts', 'agent', 'provider', 'model', 'api', 'run_id', 'session_id', 'trace_id', 'seq', 'source_seq', 'input', 'output', 'cache_read', 'cache_write', 'total', 'event_id', 'record_source'] as const
export type UsageEvent = Record<typeof EXPORT_KEYS[number], any>
export type UsageDay = { date: string; provider: string; agent: string; model: string; runs: number; input: number; output: number; cacheRead: number; cacheWrite: number; tokens: number; unpriced: number; flagged: number; low: number; high: number }
export const PRICE_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'
// Current standard-price scenario, checked 2026-10-09; not historical invoice rates.
// Cache writes span 5m (1.25x) to 1h (2x). No fast-mode, geography or discounts assumed.
const RATES: Record<string, [number, number]> = {
  'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5-20251001': [1, 5],
  'claude-opus-4-8': [5, 25], 'claude-fable-5': [10, 50],
}
export function parseExport(text: string): UsageEvent[] {
  const rows: UsageEvent[] = []; const ids = new Map<string, string>()
  for (const [i, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    let r: any; try { r = JSON.parse(line) } catch { throw new Error(`Invalid JSON on line ${i + 1}.`) }
    if (!r || typeof r !== 'object' || Object.keys(r).length !== EXPORT_KEYS.length || EXPORT_KEYS.some(k => !(k in r))) throw new Error(`Line ${i + 1}: use the v2 usage-only export with exactly 17 fields.`)
    for (const k of ['ts', 'agent', 'provider', 'model', 'api', 'run_id', 'session_id', 'trace_id', 'event_id', 'record_source']) {
      if (typeof r[k] !== 'string' || !r[k] || r[k].length > 240 || /[\r\n\\/]/.test(r[k])) throw new Error(`Line ${i + 1}: invalid ${k}.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(r.ts) || !Number.isFinite(Date.parse(r.ts)) || Date.parse(r.ts) > Date.now() + 300000) throw new Error(`Line ${i + 1}: invalid timestamp.`)
    if (!['model.completed', 'trace.artifacts'].includes(r.record_source)) throw new Error(`Line ${i + 1}: invalid record source.`)
    for (const k of ['seq', 'source_seq', 'input', 'output', 'total', 'cache_read', 'cache_write']) {
      if (r[k] === null && ['cache_read', 'cache_write'].includes(k)) continue
      if (!Number.isSafeInteger(r[k]) || r[k] < 0) throw new Error(`Line ${i + 1}: invalid numeric usage.`)
    }
    if (r.event_id !== `${r.agent}:${r.trace_id}:${r.source_seq}`) throw new Error(`Line ${i + 1}: event identity does not match source metadata.`)
    const clean = Object.fromEntries(EXPORT_KEYS.map(k => [k, r[k]])) as UsageEvent
    const canonical = JSON.stringify(clean), prior = ids.get(r.event_id)
    if (prior && prior !== canonical) throw new Error(`Line ${i + 1}: conflicting event identity.`)
    if (!prior) { rows.push(clean); ids.set(r.event_id, canonical) }
    if (rows.length > 100000) throw new Error('Export exceeds 100,000 runs.')
  }
  if (!rows.length) throw new Error('The export is empty.')
  return rows
}
export function usageSummary(events: UsageEvent[]) {
  const groups = new Map<string, UsageDay>(); const anomalies: any[] = []
  for (const e of events) {
    const provider = ({ meta: 'Muse Spark', anthropic: 'Anthropic', deepseek: 'DeepSeek', openai: 'OpenAI' } as Record<string, string>)[e.provider] || e.provider
    // Preserve live IDs, especially deepseek-r1/v3; no unverified role mapping.
    const known = ['orion', 'strategos', 'atlas', 'susan', 'maya', 'vega', 'hal', 'bart', 'lex', 'scribe', 'lyra']
    const agent = known.includes(e.agent) ? e.agent[0].toUpperCase() + e.agent.slice(1) : e.agent
    const date = dayKey(e.ts), key = JSON.stringify([date, provider, agent, e.model])
    const g = groups.get(key) || { date, provider, agent, model: e.model, runs: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, unpriced: 0, flagged: 0, low: 0, high: 0 }
    g.runs++; g.input += e.input; g.output += e.output; g.cacheRead += e.cache_read || 0; g.cacheWrite += e.cache_write || 0; g.tokens += e.total
    const mismatch = e.cache_read !== null && e.cache_write !== null && e.total !== e.input + e.output + e.cache_read + e.cache_write
    const flagged = e.total > 100000000 || mismatch
    const rate = e.provider === 'anthropic' ? RATES[e.model] : null
    if (flagged) {
      g.flagged++; anomalies.push({ eventId: e.event_id, date, provider, agent, model: e.model, tokens: e.total, reason: e.total > 100000000 ? 'Over 100 million tokens in one run; requires verification' : 'Token components do not match total' })
    } else if (!rate || e.cache_read === null || e.cache_write === null) { g.unpriced++ }
    else {
      const base = (e.input * rate[0] + e.output * rate[1] + e.cache_read * rate[0] * .1) / 1000000
      g.low += base + e.cache_write * rate[0] * 1.25 / 1000000
      g.high += base + e.cache_write * rate[0] * 2 / 1000000
    }
    groups.set(key, g)
  }
  return { daily: [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)), anomalies, runs: events.length }
}
