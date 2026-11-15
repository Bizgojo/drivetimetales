// lib/creditsWatch.ts — CREDITS-WATCH-001 (Marc, Nov 15, 2026: "You need a way to view all AI
// credits without asking me to look and if some AI service needs more credits tell me which one,
// what it is used for and the URL to increase credits").
//
// Checks every paid AI service the pipeline uses, saves the result in atlas_settings
// (key credit_balances, no new table) and sends one alert per low service every 12 hours
// through the pipeline alert channel (Telegram / webhook). Read by /admin/credits and by Claude.
//
// Balance APIs: ElevenLabs, DeepSeek, KIE.ai, OpenRouter. Anthropic has no balance API: the
// month's spend comes from our own anthropic_usage_log and is compared to the monthly spend
// limit saved in atlas_settings credit_limits.anthropicMonthlyUsd (Marc sets it in the
// Claude Console). Every service is also flagged low after a billing/limit error in the last 24h.

export type CreditStatus = 'ok' | 'low' | 'cannot_check' | 'not_connected'

export type CreditService = {
  id: string
  name: string
  usedFor: string
  topUpUrl: string
  card: string
  /** Matches a billing / out-of-credit error from this service in job logs. */
  errorPattern: RegExp
}

export type CreditResult = {
  id: string
  name: string
  usedFor: string
  topUpUrl: string
  card: string
  status: CreditStatus
  balance: string | null
  detail: string
  lowBelow: string | null
}

export type CreditSnapshot = {
  checkedAt: string
  services: CreditResult[]
  alertedAt?: Record<string, string>
}

const STORY_CARD = 'ET-Story Production ••9788'
const RND_CARD = 'ET-R&D ••6746'

export const CREDIT_SERVICES: CreditService[] = [
  { id: 'elevenlabs', name: 'ElevenLabs', usedFor: 'Character voices and Belle (every episode)', topUpUrl: 'https://elevenlabs.io/app/subscription', card: STORY_CARD, errorPattern: /elevenlabs[^\n]{0,200}(quota_exceeded|402|insufficient|credits|limit)/i },
  { id: 'anthropic', name: 'Anthropic (Claude API)', usedFor: 'Writing and checking scripts; Orion fallback', topUpUrl: 'https://platform.claude.com/settings/billing', card: STORY_CARD, errorPattern: /(reached your specified API usage limits|credit balance is too low|anthropic[^\n]{0,120}(402|billing))/i },
  { id: 'kie', name: 'KIE.ai', usedFor: 'Music for episodes', topUpUrl: 'https://kie.ai/billing', card: STORY_CARD, errorPattern: /kie[^\n]{0,200}(insufficient|credits|402|balance)/i },
  { id: 'deepseek', name: 'DeepSeek', usedFor: 'Strategos and Atlas (agent brains)', topUpUrl: 'https://platform.deepseek.com/top_up', card: STORY_CARD, errorPattern: /deepseek[^\n]{0,200}(insufficient|balance|402)/i },
  { id: 'openrouter', name: 'OpenRouter', usedFor: 'Story-idea generator and agent fallbacks', topUpUrl: 'https://openrouter.ai/settings/credits', card: STORY_CARD, errorPattern: /openrouter[^\n]{0,200}(402|insufficient|credits)/i },
  { id: 'openai', name: 'OpenAI', usedFor: 'Covers and speech checks', topUpUrl: 'https://platform.openai.com/settings/organization/billing/overview', card: STORY_CARD, errorPattern: /(insufficient_quota|openai[^\n]{0,120}(billing|402|quota))/i },
  { id: 'gemini', name: 'Google Gemini', usedFor: 'Whole-series story read and voice checks', topUpUrl: 'https://console.cloud.google.com/billing', card: RND_CARD, errorPattern: /(gemini|generativelanguage)[^\n]{0,200}(billing|RESOURCE_EXHAUSTED|quota)/i },
]

/** Low thresholds. ElevenLabs: about two 7-episode series of voicing. */
export const LOW = {
  elevenlabsCharacters: 250000,
  usd: 10,
  kieCredits: 500,
  anthropicShare: 0.85,
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const usd = (n: number) => `$${n.toFixed(2)}`
const int = (n: number) => Math.round(n).toLocaleString('en-US')

type Fetch = typeof fetch
async function getJson(fetchImpl: Fetch, url: string, headers: Record<string, string>): Promise<any> {
  const r = await fetchImpl(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) } as any)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function base(s: CreditService): Omit<CreditResult, 'status' | 'balance' | 'detail' | 'lowBelow'> {
  return { id: s.id, name: s.name, usedFor: s.usedFor, topUpUrl: s.topUpUrl, card: s.card }
}

export type CheckInput = {
  env: Record<string, string | undefined>
  fetchImpl?: Fetch
  /** Anthropic spend this calendar month (ET) from anthropic_usage_log, or null if unknown. */
  anthropicMonthSpendUsd: number | null
  /** Monthly Anthropic spend limit Marc set, or null if not recorded. */
  anthropicMonthlyLimitUsd: number | null
  /** Service ids with a billing / limit error in job logs in the last 24 hours. */
  recentBillingErrors: Set<string>
}

export async function checkCredits(input: CheckInput): Promise<CreditResult[]> {
  const f = input.fetchImpl || fetch
  const env = input.env
  return Promise.all(CREDIT_SERVICES.map(async (s) => {
    let r: CreditResult
    try {
      r = await checkOne(s, env, f, input)
    } catch (e) {
      r = { ...base(s), status: 'cannot_check', balance: null, detail: `Balance check failed (${e instanceof Error ? e.message : 'error'})`, lowBelow: null }
    }
    if (input.recentBillingErrors.has(s.id) && r.status !== 'low') {
      r = { ...r, status: 'low', detail: `Billing or limit error in the last 24 hours. ${r.detail}`.trim() }
    }
    return r
  }))
}

async function checkOne(s: CreditService, env: Record<string, string | undefined>, f: Fetch, input: CheckInput): Promise<CreditResult> {
  const b = base(s)
  switch (s.id) {
    case 'elevenlabs': {
      if (!env.ELEVENLABS_API_KEY) return { ...b, status: 'not_connected', balance: null, detail: 'Key not set on the server', lowBelow: null }
      const p = await getJson(f, 'https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': env.ELEVENLABS_API_KEY })
      const used = num(p.character_count), limit = num(p.character_limit)
      if (used === null || limit === null) throw new Error('unexpected reply')
      const left = Math.max(0, limit - used)
      const reset = num(p.next_character_count_reset_unix)
      const resetText = reset ? ` Resets ${new Date(reset * 1000).toISOString().slice(0, 10)}.` : ''
      return { ...b, status: left < LOW.elevenlabsCharacters ? 'low' : 'ok', balance: `${int(left)} characters left of ${int(limit)}`, detail: `Plan: ${p.tier || 'unknown'}.${resetText}`, lowBelow: `${int(LOW.elevenlabsCharacters)} characters` }
    }
    case 'deepseek': {
      if (!env.DEEPSEEK_API_KEY) return { ...b, status: 'not_connected', balance: null, detail: 'Key not set on the server', lowBelow: null }
      const p = await getJson(f, 'https://api.deepseek.com/user/balance', { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` })
      const info = (p.balance_infos || []).find((i: any) => i.currency === 'USD') || (p.balance_infos || [])[0]
      const bal = num(info?.total_balance)
      if (bal === null) throw new Error('unexpected reply')
      const low = bal < LOW.usd || p.is_available === false
      return { ...b, status: low ? 'low' : 'ok', balance: `${usd(bal)} ${info.currency || ''}`.trim(), detail: '', lowBelow: usd(LOW.usd) }
    }
    case 'kie': {
      if (!env.KIE_API_KEY) return { ...b, status: 'not_connected', balance: null, detail: 'Key not set on the server', lowBelow: null }
      const p = await getJson(f, 'https://api.kie.ai/api/v1/chat/credit', { Authorization: `Bearer ${env.KIE_API_KEY}` })
      const credits = p?.code === 200 ? num(p.data) : null
      if (credits === null) throw new Error('unexpected reply')
      return { ...b, status: credits < LOW.kieCredits ? 'low' : 'ok', balance: `${int(credits)} credits`, detail: '', lowBelow: `${int(LOW.kieCredits)} credits` }
    }
    case 'openrouter': {
      const key = env.OPENROUTER_KEY || env.OPENROUTER_API_KEY
      if (!key) return { ...b, status: 'not_connected', balance: null, detail: 'Key not set on the server', lowBelow: null }
      const p = await getJson(f, 'https://openrouter.ai/api/v1/credits', { Authorization: `Bearer ${key}` })
      const total = num(p?.data?.total_credits), used = num(p?.data?.total_usage)
      if (total === null || used === null) throw new Error('unexpected reply')
      const left = total - used
      return { ...b, status: left < LOW.usd ? 'low' : 'ok', balance: usd(left), detail: '', lowBelow: usd(LOW.usd) }
    }
    case 'anthropic': {
      const spend = input.anthropicMonthSpendUsd
      const limit = input.anthropicMonthlyLimitUsd
      if (spend === null) return { ...b, status: 'cannot_check', balance: null, detail: 'Spend log unavailable; no balance API', lowBelow: null }
      if (!limit) return { ...b, status: 'cannot_check', balance: `${usd(spend)} spent this month`, detail: 'Monthly limit not recorded, so the remaining amount is unknown. Tell Claude the limit set in the Claude Console.', lowBelow: null }
      const left = limit - spend
      const low = spend >= limit * LOW.anthropicShare || left < LOW.usd
      return { ...b, status: low ? 'low' : 'ok', balance: `${usd(Math.max(0, left))} left of ${usd(limit)} monthly limit`, detail: `${usd(spend)} spent this month (pipeline only).`, lowBelow: `${Math.round((1 - LOW.anthropicShare) * 100)}% of the limit` }
    }
    default:
      return { ...b, status: 'cannot_check', balance: null, detail: 'No balance API; watched through billing errors only', lowBelow: null }
  }
}

/** Which services had a billing / out-of-credit error in these log texts. */
export function billingErrorServices(texts: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of texts) for (const s of CREDIT_SERVICES) if (s.errorPattern.test(t)) out.add(s.id)
  return out
}

export const ALERT_EVERY_MS = 12 * 60 * 60 * 1000
export const CHECK_EVERY_MS = 60 * 60 * 1000

/** Low services that have not been alerted in the last 12 hours. */
export function alertsDue(services: CreditResult[], alertedAt: Record<string, string> = {}, nowMs = Date.now()): CreditResult[] {
  return services.filter((s) => s.status === 'low' && !(alertedAt[s.id] && nowMs - Date.parse(alertedAt[s.id]) < ALERT_EVERY_MS))
}

export function creditAlertText(s: CreditResult): string {
  return [
    `LOW CREDITS: ${s.name}`,
    `Used for: ${s.usedFor}`,
    `Balance: ${s.balance || 'unknown'}${s.lowBelow ? ` (low below ${s.lowBelow})` : ''}`,
    s.detail ? `Note: ${s.detail}` : '',
    `Add credits: ${s.topUpUrl}`,
    `Card: ${s.card}`,
  ].filter(Boolean).join('\n')
}

export function checkDue(snapshot: CreditSnapshot | null, nowMs = Date.now()): boolean {
  if (!snapshot?.checkedAt) return true
  const t = Date.parse(snapshot.checkedAt)
  return !Number.isFinite(t) || nowMs - t >= CHECK_EVERY_MS
}
