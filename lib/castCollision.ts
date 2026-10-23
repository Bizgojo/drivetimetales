/**
 * CAST-COLLISION-001 — shared executable cast-collision enforcement.
 *
 * Single choke-point predicate: no story character may be assigned a
 * reserved Belle B / host voice. Backed by the REAL deployed predicate
 * (isBelleBVoiceId + RESERVED_BELLE_B_VOICE_IDS in lib/voiceConstants.ts) —
 * never a hand-assembled inventory (cf. SARAH-REGRESSION-001: v2.1's
 * hand-built list missed the operative file and cleared Sarah).
 *
 * Consumers:
 *   - app/api/admin/generate-voices/route.ts — runs this over the final
 *     assembled voiceMap (character→voice_id) before any ElevenLabs spend.
 *     That assembly is the casting acceptance gate: it consumes
 *     Hal-validated scripts plus Hal/manual character-voice overrides, and
 *     every assignment path (manual override, voice_code registry,
 *     pool selection, protagonist reuse, established roster reuse,
 *     remaining overrides) funnels through the one checked map.
 *   - scripts/acceptance/cast-collision-check.ts — offline/CLI manifest
 *     checker for Hal package validation (same module, same predicate).
 *
 * Belle wrapper exemption: the platform intro/outro/welcome announcer
 * ("BELLE" / "BELLE B" structural speakers) renders through the dedicated
 * Belle routes with the canonical voice — never through character casting.
 * A manifest entry for those speakers is skipped ONLY when the caller sets
 * allowBelleWrapper: true explicitly. Default (false) flags everything,
 * including Belle-named entries.
 */

import {
  RESERVED_BELLE_B_VOICE_IDS,
  isBelleBVoiceId,
} from './voiceConstants'

export const CAST_COLLISION_GATE_ID = 'CAST-COLLISION-001'

/** Character→voice_id casting manifest (e.g. assembled voiceMap, or Hal package cast list). */
export type CastManifest = Record<string, string | null | undefined>

export interface CastCollisionOptions {
  /**
   * When true, entries whose character name normalizes to a Belle wrapper
   * speaker (BELLE / BELLE B) are exempt from the collision check.
   * Default false — no exemptions.
   */
  allowBelleWrapper?: boolean
}

export interface CastCollision {
  character: string
  voiceId: string
}

export interface CastCollisionResult {
  passed: boolean
  checked: number
  exempted: string[]
  collisions: CastCollision[]
}

/** Structural Belle wrapper speakers (platform announcer — not characters). */
const BELLE_WRAPPER_SPEAKERS = new Set(['BELLE', 'BELLE B'])

function normalizeSpeaker(name: string): string {
  return String(name || '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function isBelleWrapperSpeaker(name: string): boolean {
  return BELLE_WRAPPER_SPEAKERS.has(normalizeSpeaker(name))
}

/**
 * Pure check: every non-exempt character→voice_id entry must NOT resolve
 * to a reserved Belle B voice (via the real isBelleBVoiceId predicate).
 * Empty/blank voice IDs are not collisions (downstream gates own missing
 * assignments); they still count as checked.
 */
export function checkCastCollisions(
  manifest: CastManifest | null | undefined,
  opts: CastCollisionOptions = {},
): CastCollisionResult {
  const entries = Object.entries(manifest || {})
  const collisions: CastCollision[] = []
  const exempted: string[] = []

  for (const [character, rawVoiceId] of entries) {
    if (opts.allowBelleWrapper === true && isBelleWrapperSpeaker(character)) {
      exempted.push(character)
      continue
    }
    const voiceId = String(rawVoiceId || '').trim()
    if (!voiceId) continue
    // THE check — real deployed predicate, never a copied list.
    if (isBelleBVoiceId(voiceId)) {
      collisions.push({ character, voiceId })
    }
  }

  return {
    passed: collisions.length === 0,
    checked: entries.length,
    exempted,
    collisions,
  }
}

/** Human-readable one-liner for logs / 422 responses / CLI output. */
export function formatCastCollisions(result: CastCollisionResult): string {
  if (result.passed) {
    const exempt = result.exempted.length > 0 ? ` (${result.exempted.length} Belle wrapper exempted)` : ''
    return `CAST-COLLISION-001 PASS: ${result.checked} cast entries checked, no reserved Belle B voices${exempt}`
  }
  return (
    `CAST-COLLISION-001 FAIL: ${result.collisions.length} character(s) assigned reserved Belle B voice: ` +
    result.collisions.map((c) => `${c.character}=${c.voiceId}`).join(', ')
  )
}

export { RESERVED_BELLE_B_VOICE_IDS }
