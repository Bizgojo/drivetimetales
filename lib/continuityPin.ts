/**
 * GATE 2 — CONTINUITY PIN (fail closed on post-consumption script correction)
 *
 * Spec: drafts/GATE-GAPS-SPEC-20261004.md §2. Authority: PIPELINE-CANON-001 Rules 1–3.
 *
 * Problem: A downstream episode (EpN) builds its continuity bundle from prior
 * episodes' scripts. If an earlier episode's `stories.script` is corrected AFTER
 * EpN consumed it, EpN silently carries stale continuity. This module pins a
 * sha256 of each prior script at generation time and re-verifies it at the
 * package-arc final step, failing closed on ANY mismatch.
 *
 * IMPORTANT — Belle-retry interaction: in-place Belle text edits
 * (validate_belle_assets / repair_belle_quality) mutate Belle intro/outro asset
 * rows, NOT the `stories.script` column. Only `stories.script` corrections change
 * the hash. Therefore Belle edits NEVER trip a continuity pin. The verify path
 * below hashes `stories.script` exclusively — it never reads Belle asset text —
 * so this guarantee holds structurally, not merely by convention.
 *
 * No migration: pins nest inside existing `stories.script_json.series_generation`
 * JSONB (sibling key `continuity_pins_used`). Legacy episodes generated before
 * this gate landed carry no pins; verify reports `pins_absent: true` (warn, not
 * fail) for those until a regeneration backfills them.
 */

import { createHash } from 'crypto'

/**
 * Canonical script hash. Normalize to NFC, convert CRLF/CR to LF, trim, then
 * sha256 (hex). Whitespace-stable so that re-hashing an unchanged script at the
 * package step always matches the pin captured at generation time.
 */
export function hashScript(script: string | null | undefined): string {
  const text = String(script ?? '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Map of priorStoryId -> hex sha256 of that episode's script at consumption time. */
export type ContinuityPins = Record<string, string>

/**
 * Build the pin map from the prior episodes consumed into a continuity bundle.
 * `priorEpisodes` are the same episode rows fed to buildContinuityBundle (each
 * has `.id` and `.script`). Episodes without a script are skipped (they are not
 * in the continuity bundle either).
 */
export function buildContinuityPins(priorEpisodes: any[]): ContinuityPins {
  const pins: ContinuityPins = {}
  for (const episode of priorEpisodes || []) {
    if (!episode || episode.script == null || String(episode.script).trim() === '') continue
    pins[String(episode.id)] = hashScript(episode.script)
  }
  return pins
}

export type ContinuityPinMismatch = {
  episodeNumber: number
  storyId: string
  priorStoryId: string
  expectedHash: string
  actualHash: string
}

export type ContinuityPinVerifyResult = {
  ok: boolean
  mismatches: ContinuityPinMismatch[]
  /** Episodes (k>1) that carried no pins — legacy, pre-landing. Warn, do not fail. */
  pinsAbsentEpisodes: number[]
  pins_absent: boolean
  checkedEpisodes: number
}

/**
 * Recompute current prior-script hashes and compare against the pins captured
 * at generation time. ANY mismatch → ok:false (hard fail at caller).
 *
 * `episodes` is the full series episode set (each row carries `.id`, `.script`,
 * `.script_json`, and an episode number). For each episode k>1 that has pins,
 * every pinned prior id is re-hashed from its CURRENT `stories.script` and
 * compared. Episodes with no pins (legacy) are recorded in `pinsAbsentEpisodes`
 * as a warning, never a failure.
 */
export function verifyContinuityPins(episodes: any[]): ContinuityPinVerifyResult {
  const mismatches: ContinuityPinMismatch[] = []
  const pinsAbsentEpisodes: number[] = []
  let checkedEpisodes = 0

  // Index current scripts by story id for O(1) prior lookup.
  const scriptById = new Map<string, string>()
  for (const ep of episodes || []) {
    if (!ep) continue
    scriptById.set(String(ep.id), String(ep.script ?? ''))
  }

  const epNum = (ep: any): number =>
    Number(ep?.episode_number || ep?.series_episode_number || 0)

  for (const ep of episodes || []) {
    if (!ep) continue
    const k = epNum(ep)
    // Only downstream episodes can consume priors. Ep1 (or number 0/unknown)
    // has no priors to pin.
    if (!(k > 1)) continue

    const seriesGen = ep.script_json?.series_generation
    const pins: ContinuityPins | undefined =
      seriesGen && typeof seriesGen === 'object' && seriesGen.continuity_pins_used
        && typeof seriesGen.continuity_pins_used === 'object'
        ? (seriesGen.continuity_pins_used as ContinuityPins)
        : undefined

    const pinEntries = pins ? Object.entries(pins) : []
    if (pinEntries.length === 0) {
      // Legacy / pre-landing episode — warn, do not fail.
      pinsAbsentEpisodes.push(k)
      continue
    }

    checkedEpisodes += 1
    for (const [priorStoryId, expectedHash] of pinEntries) {
      const currentScript = scriptById.get(String(priorStoryId))
      // Prior episode not in current set (e.g. cold-storage replacement) — the
      // continuity contract can no longer be verified against this id. Treat a
      // vanished prior as a mismatch (fail closed) naming the missing id.
      const actualHash = hashScript(currentScript ?? '')
      if (currentScript == null) {
        mismatches.push({
          episodeNumber: k,
          storyId: String(ep.id),
          priorStoryId: String(priorStoryId),
          expectedHash: String(expectedHash),
          actualHash: 'missing',
        })
        continue
      }
      if (actualHash !== String(expectedHash)) {
        mismatches.push({
          episodeNumber: k,
          storyId: String(ep.id),
          priorStoryId: String(priorStoryId),
          expectedHash: String(expectedHash),
          actualHash,
        })
      }
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    pinsAbsentEpisodes,
    pins_absent: pinsAbsentEpisodes.length > 0,
    checkedEpisodes,
  }
}
