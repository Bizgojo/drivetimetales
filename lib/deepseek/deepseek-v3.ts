/**
 * deepseek-v3.ts — DeepSeek V3 (chat) client adapter for Atlas-owned paths.
 *
 * POSTs to https://api.deepseek.com/v1/chat/completions with
 * model deepseek-chat. Reads DEEPSEEK_API_KEY from process.env only —
 * never logs or prints the key value.
 *
 * NOTE: Atlas deterministic gates + audio plumbing make NO LLM call.
 * This adapter exists for future Atlas-owned chat use only.
 */

import { DEEPSEEK_V3_MODEL } from '../model-router'

const API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_RETRIES = 2

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface V3Options {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  retries?: number
  /** fetch impl override (tests). */
  fetchImpl?: typeof fetch
}

export interface V3Result {
  content: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('[deepseek-v3] DEEPSEEK_API_KEY is not set')
  return key
}

export async function chatV3(messages: ChatMessage[], opts: V3Options = {}): Promise<V3Result> {
  const apiKey = getApiKey()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? MAX_RETRIES
  const fetchFn = opts.fetchImpl ?? fetch

  const body = JSON.stringify({
    model: DEEPSEEK_V3_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  })

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchFn(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body,
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`[deepseek-v3] retryable status ${res.status}`)
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }
      if (!res.ok) {
        throw new Error(`[deepseek-v3] request failed with status ${res.status}`)
      }
      const data = (await res.json()) as any
      const content = data?.choices?.[0]?.message?.content
      return { content: typeof content === 'string' ? content : '', usage: data?.usage }
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < retries) {
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('[deepseek-v3] request failed')
}
