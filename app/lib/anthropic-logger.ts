/**
 * Anthropic usage logger — wraps every Claude API call and logs
 * token usage + cost to the anthropic_usage_log table in Supabase.
 *
 * Cost rates (as of Mar 2026):
 *   claude-opus-4-x:   $15/MTok input,  $75/MTok output
 *   claude-sonnet-4-x: $3/MTok input,   $15/MTok output
 *   claude-haiku-3-x:  $0.80/MTok input, $4/MTok output
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Cost rates per million tokens ───────────────────────────────────────────
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4':         { input: 15.00,  output: 75.00 },
  'claude-opus-4-5':       { input: 15.00,  output: 75.00 },
  'claude-opus-4-6':       { input: 15.00,  output: 75.00 },
  'claude-sonnet-4':       { input: 3.00,   output: 15.00 },
  'claude-sonnet-4-5':     { input: 3.00,   output: 15.00 },
  'claude-sonnet-4-6':     { input: 3.00,   output: 15.00 },
  'claude-haiku-3':        { input: 0.80,   output: 4.00  },
  'claude-haiku-3-5':      { input: 0.80,   output: 4.00  },
  'claude-3-5-sonnet':     { input: 3.00,   output: 15.00 },
  'claude-3-5-haiku':      { input: 0.80,   output: 4.00  },
  'claude-3-opus':         { input: 15.00,  output: 75.00 },
}

function getRates(model: string): { input: number; output: number } {
  const key = Object.keys(MODEL_RATES).find(k => model.toLowerCase().includes(k.toLowerCase()))
  return key ? MODEL_RATES[key] : { input: 3.00, output: 15.00 } // default to Sonnet pricing
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = getRates(model)
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output
}

// ─── Log a usage record ───────────────────────────────────────────────────────
export async function logAnthropicCall({
  route,
  purpose,
  model,
  inputTokens,
  outputTokens,
  storyId,
  storyTitle,
  metadata,
}: {
  route: string
  purpose: string
  model: string
  inputTokens: number
  outputTokens: number
  storyId?: string
  storyTitle?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const cost = calcCost(model, inputTokens, outputTokens)
  try {
    await supabase.from('anthropic_usage_log').insert({
      route,
      purpose,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      story_id: storyId ?? null,
      story_title: storyTitle ?? null,
      metadata: metadata ?? {},
    })
  } catch (err) {
    // Never let logging failures break the main request
    console.error('[anthropic-logger] Failed to log usage:', err)
  }
}

// ─── Wrapped Anthropic client ─────────────────────────────────────────────────
const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface AnthropicCallOptions {
  route: string
  purpose: string
  storyId?: string
  storyTitle?: string
  metadata?: Record<string, unknown>
}

/**
 * Call Claude and automatically log token usage + cost.
 * Drop-in replacement for anthropic.messages.create().
 */
export async function anthropicCall(
  params: Anthropic.MessageCreateParamsNonStreaming,
  opts: AnthropicCallOptions
): Promise<Anthropic.Message> {
  const response = await anthropicClient.messages.create(params)

  // Log in background — don't await, don't block
  logAnthropicCall({
    route: opts.route,
    purpose: opts.purpose,
    model: params.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    storyId: opts.storyId,
    storyTitle: opts.storyTitle,
    metadata: opts.metadata,
  }).catch(() => {})

  return response
}

export { anthropicClient }
