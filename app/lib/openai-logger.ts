/**
 * OpenAI usage logger — logs DALL-E and GPT API calls with cost estimates.
 *
 * Cost rates (as of Mar 2026):
 *   DALL-E 3 Standard 1024×1024:  $0.040/image
 *   DALL-E 3 HD 1024×1024:        $0.080/image
 *   DALL-E 3 Standard 1024×1792:  $0.080/image
 *   DALL-E 3 HD 1024×1792:        $0.120/image
 *   GPT-4o:   $5/MTok input,  $15/MTok output
 *   GPT-4o-mini: $0.15/MTok input, $0.60/MTok output
 *   GPT-4-turbo: $10/MTok input, $30/MTok output
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── DALL-E cost lookup ───────────────────────────────────────────────────────
const DALLE_COSTS: Record<string, Record<string, number>> = {
  'dall-e-3': {
    '1024x1024_standard': 0.040,
    '1024x1024_hd':       0.080,
    '1024x1792_standard': 0.080,
    '1024x1792_hd':       0.120,
    '1792x1024_standard': 0.080,
    '1792x1024_hd':       0.120,
  },
  'dall-e-2': {
    '1024x1024': 0.020,
    '512x512':   0.018,
    '256x256':   0.016,
  },
}

function dalleCost(model: string, size: string, quality = 'standard', n = 1): number {
  const key = quality === 'hd' ? `${size}_hd` : `${size}_standard`
  const rate = DALLE_COSTS[model]?.[key] ?? DALLE_COSTS[model]?.[size] ?? 0.040
  return rate * n
}

// ─── GPT cost lookup ──────────────────────────────────────────────────────────
const GPT_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o':           { input: 5.00,   output: 15.00  },
  'gpt-4o-mini':      { input: 0.15,   output: 0.60   },
  'gpt-4-turbo':      { input: 10.00,  output: 30.00  },
  'gpt-4':            { input: 30.00,  output: 60.00  },
  'gpt-3.5-turbo':    { input: 0.50,   output: 1.50   },
}

function gptCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(GPT_RATES).find(k => model.toLowerCase().includes(k.toLowerCase()))
  const rates = key ? GPT_RATES[key] : { input: 5.00, output: 15.00 }
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output
}

// ─── Log a DALL-E image generation ───────────────────────────────────────────
export async function logDalleCall({
  route,
  purpose,
  model = 'dall-e-3',
  size = '1024x1024',
  quality = 'standard',
  n = 1,
  storyId,
  storyTitle,
  metadata,
}: {
  route: string
  purpose: string
  model?: string
  size?: string
  quality?: string
  n?: number
  storyId?: string
  storyTitle?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const cost = dalleCost(model, size, quality, n)
  try {
    await supabase.from('openai_usage_log').insert({
      route,
      purpose,
      model,
      call_type: 'image',
      input_tokens: 0,
      output_tokens: 0,
      images_generated: n,
      cost_usd: cost,
      story_id: storyId ?? null,
      story_title: storyTitle ?? null,
      metadata: { size, quality, ...(metadata ?? {}) },
    })
  } catch (err) {
    console.error('[openai-logger] Failed to log DALL-E usage:', err)
  }
}

// ─── Log a GPT completion ─────────────────────────────────────────────────────
export async function logGptCall({
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
  const cost = gptCost(model, inputTokens, outputTokens)
  try {
    await supabase.from('openai_usage_log').insert({
      route,
      purpose,
      model,
      call_type: 'chat',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      images_generated: 0,
      cost_usd: cost,
      story_id: storyId ?? null,
      story_title: storyTitle ?? null,
      metadata: metadata ?? {},
    })
  } catch (err) {
    console.error('[openai-logger] Failed to log GPT usage:', err)
  }
}
