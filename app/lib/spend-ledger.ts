/**
 * CREEK-PAUSE-AND-REPAIR (B) — per-episode spend ledger (Marc commission 2026-10-26).
 *
 * Enforces the $10 routine-production cap per story episode. Every paid
 * operation (ElevenLabs TTS, Whisper transcript QC, Anthropic, OpenAI —
 * including retries and repairs, which all flow through the metered choke
 * points) records one row with a clearly-labeled ESTIMATED cost.
 * Historical or unattributable spend is recorded with cost_basis='unknown'
 * (NEVER zero) and flagged; the cap applies to metered new spend from
 * ledger-live.
 *
 * Storage: episode_spend_ledger table (see
 * supabase/migrations/*_episode_spend_ledger.sql — UNAPPLIED until Marc's word).
 * Until that migration is applied, writes fail OPEN (warn + continue) and reads
 * report ledgerLive=false so the run-next enforcement point skips blocking.
 * Production is never broken by a missing ledger table.
 */

import { createClient } from '@supabase/supabase-js'

// Lazy client: module import must never throw (tests import the pure helpers
// without env configured).
function ledgerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Routine-production cap per episode, USD. */
export const ROUTINE_PRODUCTION_CAP_USD = 10

/**
 * ESTIMATED per-operation cost bases. All values are ESTIMATES for cap
 * enforcement only — reconcile against provider invoices, never treat as billing.
 */
export const ESTIMATED_COSTS = {
  /** ElevenLabs multilingual v2 TTS — mirrors app/lib/el-logger.ts $0.30/1k chars (ESTIMATE). */
  elevenlabsPerCharUsd: 0.3 / 1000,
  /** OpenAI Whisper transcription — public list $0.006/min prorated by audio seconds (ESTIMATE). */
  whisperPerSecondUsd: 0.006 / 60,
} as const

/** ESTIMATE: ElevenLabs TTS cost for `chars` characters. */
export function estimateElevenLabsCostUsd(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return +(chars * ESTIMATED_COSTS.elevenlabsPerCharUsd).toFixed(4)
}

/**
 * ESTIMATE: Whisper transcript-QC cost for `audioSeconds` of audio.
 * Unknown duration falls back to a ~15s-segment estimate (flagged via detail),
 * NEVER zero — an unmetered call still spent money.
 */
export function estimateWhisperCostUsd(audioSeconds: number): number {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) return 0.0015
  return +(audioSeconds * ESTIMATED_COSTS.whisperPerSecondUsd).toFixed(4)
}

export type SpendProvider = 'elevenlabs' | 'openai' | 'anthropic' | 'other'

/** Pure: does `estimatedTotalUsd` leave room for new spend under the cap? */
export function capAllowsSpend(estimatedTotalUsd: number): boolean {
  return estimatedTotalUsd < ROUTINE_PRODUCTION_CAP_USD
}

export async function recordLedgerSpend(opts: {
  storyId?: string | null
  provider: SpendProvider
  operation: string
  /** null/undefined → cost_basis 'unknown' (NEVER zero). */
  estimatedCostUsd?: number | null
  detail?: Record<string, unknown>
}): Promise<void> {
  const unknown = opts.estimatedCostUsd === null || opts.estimatedCostUsd === undefined
  try {
    await ledgerClient().from('episode_spend_ledger').insert({
      story_id: opts.storyId ?? null,
      provider: opts.provider,
      operation: opts.operation,
      estimated_cost_usd: unknown ? null : opts.estimatedCostUsd,
      cost_basis: unknown ? 'unknown' : 'estimated',
      detail: { ...(opts.detail ?? {}), estimated: !unknown },
    })
  } catch (e) {
    // Fail OPEN pre-migration: never break production on a missing table.
    console.warn(
      '[spend-ledger] Non-blocking ledger write failed (table may not exist yet):',
      e instanceof Error ? e.message : String(e),
    )
  }
}

/** One row for spend whose value cannot be metered (pre-ledger history). NEVER zero. */
export async function recordUnknownSpend(
  storyId: string | null,
  provider: SpendProvider,
  operation: string,
  note: string,
): Promise<void> {
  await recordLedgerSpend({ storyId, provider, operation, estimatedCostUsd: null, detail: { note } })
}

export interface EpisodeSpendSummary {
  storyId: string
  ledgerLive: boolean
  estimatedTotalUsd: number
  unknownCount: number
  allowed: boolean
}

export async function getEpisodeSpend(storyId: string): Promise<EpisodeSpendSummary> {
  try {
    const { data, error } = await ledgerClient()
      .from('episode_spend_ledger')
      .select('estimated_cost_usd,cost_basis')
      .eq('story_id', storyId)
    if (error) throw error
    let total = 0
    let unknown = 0
    for (const row of (data ?? []) as Array<{ estimated_cost_usd: unknown; cost_basis: unknown }>) {
      if (row.cost_basis === 'unknown' || row.estimated_cost_usd === null) unknown += 1
      else total += Number(row.estimated_cost_usd) || 0
    }
    total = +total.toFixed(4)
    return { storyId, ledgerLive: true, estimatedTotalUsd: total, unknownCount: unknown, allowed: capAllowsSpend(total) }
  } catch (e) {
    console.warn(
      '[spend-ledger] Ledger unreadable (table may not exist yet) — failing OPEN:',
      e instanceof Error ? e.message : String(e),
    )
    return { storyId, ledgerLive: false, estimatedTotalUsd: 0, unknownCount: 0, allowed: true }
  }
}

export async function checkEpisodeSpendCap(storyId: string): Promise<EpisodeSpendSummary & { capUsd: number }> {
  const summary = await getEpisodeSpend(storyId)
  return { ...summary, capUsd: ROUTINE_PRODUCTION_CAP_USD }
}
