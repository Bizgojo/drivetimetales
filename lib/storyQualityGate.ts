/**
 * storyQualityGate.ts — STEP 10 Story Quality Judge
 *
 * Uses Claude (claude-opus-4-6) to score a story script on 6 dimensions,
 * 30 points total. Thresholds:
 *   ≥ 22 → publish  (auto-approved)
 *   17–21 → review  (flag for Marc's closer listen, not blocked)
 *   < 17  → block   (validator_failed, Marc decides fix-or-retire)
 *
 * Applies to standalone stories only.
 * Fail-safe on tooling errors: returns recommendation='review', never hard-blocks.
 *
 * Also exports calibrateQualityGate() — one-time calibration helper,
 * not a pipeline step.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityDimensions {
  hook: number          // 1–5: Did first 90s earn attention?
  clarity: number       // 1–5: Could distracted driver follow without rewinding?
  pacing: number        // 1–5: Did it turn every few minutes or go flat in middle?
  audio_quality: number // 1–5: Clean voices, music ducking, SFX in gaps, no ghost voices?
  landing: number       // 1–5: Did ending resolve/satisfy or cliffhanger burn?
  investment: number    // 1–5: Did listener care? Feel something at ending?
}

export interface QualityGateResult {
  storyId: string
  passed: boolean
  score: number
  recommendation: 'publish' | 'review' | 'block'
  dimensions: QualityDimensions
  summary: string
  error?: string
}

export interface CalibrationStoryResult {
  storyId: string
  title: string
  score: number
  recommendation: string
  dimensions: QualityDimensions
  summary: string
  error?: string
}

export interface CalibrationResult {
  sampleSize: number
  publishCount: number   // ≥ 22
  reviewCount: number    // 17–21
  blockCount: number     // < 17
  results: CalibrationStoryResult[]
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const QUALITY_JUDGE_SYSTEM = `You are a story quality judge for Endless Tales, a short-form audio fiction platform.
Listeners consume these stories while driving. Each story is 5–8 minutes of audio narration.
You will receive a story script. Score it on exactly 6 dimensions, 1–5 each (30 points total).

Scoring rubric:
- Hook (1–5): Did the opening 90 seconds earn the listener's attention? 1=no hook at all, 5=immediately gripping
- Clarity (1–5): Could a distracted driver follow every character, place, and event without rewinding? 1=confusing, 5=crystal clear
- Pacing (1–5): Did the story turn (reveal, twist, escalation) every few minutes, or did the middle go flat? 1=flatlines in middle, 5=tight turns throughout
- Audio Quality (1–5): Are voices clean and balanced? Does music duck under dialogue? Do SFX land in gaps, not over speech? Any ghost voices or garbled segments? 1=technical problems, 5=production-perfect
- Landing (1–5): For standalones — did the ending resolve and satisfy? For series non-finales — did the cliffhanger burn? 1=unsatisfying, 5=deeply satisfying or compelling
- Investment (1–5): Did the listener care what happened to this person? Did they feel something at the ending? 1=no emotional connection, 5=strong emotional impact

Return ONLY valid JSON, no commentary, no markdown fences:
{"hook":N,"clarity":N,"pacing":N,"audio_quality":N,"landing":N,"investment":N,"total":N,"recommendation":"publish","summary":"one sentence"}

Where:
- total = hook + clarity + pacing + audio_quality + landing + investment (must equal sum of the six)
- recommendation: "publish" if total >= 22, "review" if 17-21, "block" if < 17
- summary: one sentence naming the main strength AND the main weakness`

// ---------------------------------------------------------------------------
// runStoryQualityGate — main pipeline gate
// ---------------------------------------------------------------------------

export async function runStoryQualityGate(storyId: string): Promise<QualityGateResult> {
  const ZERO_DIMENSIONS: QualityDimensions = {
    hook: 0, clarity: 0, pacing: 0, audio_quality: 0, landing: 0, investment: 0,
  }

  try {
    // Fetch story from Supabase
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, title, genre, series_id, series_episode_number, series_is_finale, script')
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      throw new Error(`Story not found: ${storyError?.message ?? 'null result'}`)
    }

    const scriptContent: string | null = (story as any).script
    if (!scriptContent || scriptContent.trim().length === 0) {
      throw new Error('No script content found on story')
    }

    // Build user prompt
    const seriesLabel = (story as any).series_id
      ? `Episode ${(story as any).series_episode_number ?? '?'}${(story as any).series_is_finale ? ' (FINALE)' : ''}`
      : 'Standalone'

    const userPrompt = `Title: ${(story as any).title ?? 'Unknown'}
Genre: ${(story as any).genre ?? 'Unknown'}
Series: ${seriesLabel}

SCRIPT:
${scriptContent.slice(0, 12000)}`

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      system: QUALITY_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

    // Strip any accidental markdown fences
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const parsed = JSON.parse(jsonText)

    const dimensions: QualityDimensions = {
      hook: Number(parsed.hook),
      clarity: Number(parsed.clarity),
      pacing: Number(parsed.pacing),
      audio_quality: Number(parsed.audio_quality),
      landing: Number(parsed.landing),
      investment: Number(parsed.investment),
    }

    // Recompute total from dimensions to guard against model arithmetic errors
    const total =
      parsed.total != null
        ? Number(parsed.total)
        : Object.values(dimensions).reduce((a, b) => a + b, 0)

    const recommendation: 'publish' | 'review' | 'block' =
      total >= 22 ? 'publish' : total >= 17 ? 'review' : 'block'

    return {
      storyId,
      passed: recommendation !== 'block',
      score: total,
      recommendation,
      dimensions,
      summary: String(parsed.summary ?? ''),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[storyQualityGate] Error for story ${storyId}:`, message)
    return {
      storyId,
      passed: false,
      score: 0,
      recommendation: 'review', // fail-safe: never hard-block on tooling error
      dimensions: ZERO_DIMENSIONS,
      summary: '',
      error: message,
    }
  }
}

// ---------------------------------------------------------------------------
// calibrateQualityGate — one-time calibration helper, not a pipeline step
// ---------------------------------------------------------------------------

/**
 * Fetches up to sampleSize published stories and runs runStoryQualityGate
 * on each. Returns a summary of how many scored ≥22 (publish), 17–21
 * (review), <17 (block). Use to validate threshold calibration against
 * Marc-ear-approved stories before deploying the gate.
 */
export async function calibrateQualityGate(sampleSize: number): Promise<CalibrationResult> {
  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, title, script')
    .eq('status', 'published')
    .not('script', 'is', null)
    .limit(sampleSize)

  if (error) {
    throw new Error(`Could not fetch published stories: ${error.message}`)
  }

  if (!stories?.length) {
    throw new Error('No published stories with scripts found in database')
  }

  const results: CalibrationStoryResult[] = []
  let publishCount = 0
  let reviewCount = 0
  let blockCount = 0

  for (const story of stories) {
    const result = await runStoryQualityGate(story.id)
    results.push({
      storyId: story.id,
      title: (story as any).title ?? story.id,
      score: result.score,
      recommendation: result.recommendation,
      dimensions: result.dimensions,
      summary: result.summary,
      ...(result.error ? { error: result.error } : {}),
    })

    if (result.recommendation === 'publish') publishCount++
    else if (result.recommendation === 'review') reviewCount++
    else blockCount++

    // Brief pause to avoid Anthropic rate limits
    await new Promise(r => setTimeout(r, 1500))
  }

  return {
    sampleSize: stories.length,
    publishCount,
    reviewCount,
    blockCount,
    results,
  }
}
