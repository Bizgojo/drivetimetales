/**
 * deepseek-r1.ts — DeepSeek R1 (reasoning) client adapter for Strategos/Lyra.
 *
 * POSTs to https://api.deepseek.com/v1/chat/completions with
 * model deepseek-reasoner. Reads DEEPSEEK_API_KEY from process.env only —
 * never logs or prints the key value.
 */

import { DEEPSEEK_R1_MODEL } from '../model-router'

const API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_RETRIES = 2

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface R1Options {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  retries?: number
  /** fetch impl override (tests). */
  fetchImpl?: typeof fetch
}

export interface R1Result {
  content: string
  /** Raw reasoning_content when the API returns it (may be null). */
  reasoning: string | null
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('[deepseek-r1] DEEPSEEK_API_KEY is not set')
  return key
}

export async function chatR1(messages: ChatMessage[], opts: R1Options = {}): Promise<R1Result> {
  const apiKey = getApiKey()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? MAX_RETRIES
  const fetchFn = opts.fetchImpl ?? fetch

  const body = JSON.stringify({
    model: DEEPSEEK_R1_MODEL,
    messages,
    temperature: opts.temperature ?? 0.3,
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
        lastErr = new Error(`[deepseek-r1] retryable status ${res.status}`)
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }
      if (!res.ok) {
        throw new Error(`[deepseek-r1] request failed with status ${res.status}`)
      }
      const data = (await res.json()) as any
      const choice = data?.choices?.[0]?.message
      const content = typeof choice?.content === 'string' ? choice.content : ''
      const reasoning = typeof choice?.reasoning_content === 'string' ? choice.reasoning_content : null
      return { content, reasoning, usage: data?.usage }
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
  throw lastErr instanceof Error ? lastErr : new Error('[deepseek-r1] request failed')
}
