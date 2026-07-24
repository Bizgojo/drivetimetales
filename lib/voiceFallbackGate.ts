/**
 * voiceFallbackGate.ts — VOICE-FALLBACK-001
 *
 * Three-gate voice validation system for series_character_roster.
 *
 * Prevents invalid voice assignments before they reach the database.
 * All checks are application-level — no schema changes required.
 *
 * Gate 1 — Registered-only:
 *   The voice_id MUST exist in narrator_voices.elevenlabs_voice_id.
 *   Unregistered IDs = hard fail.
 *
 * Gate 2 — Gender match:
 *   narrator_voices.gender must match series_character_roster.gender.
 *   NULL character gender = skip check (no gender = no constraint).
 *   Mismatch = hard fail.
 *
 * Gate 3 — Accent match / no-fallback block:
 *   If character has a non-null accent, the voice must have a matching
 *   or compatible accent. When no match exists: fail loudly — do NOT
 *   silently assign an arbitrary voice.
 *
 * Usage:
 *   import { validateVoiceAssignment } from '@/lib/voiceFallbackGate'
 *   const result = await validateVoiceAssignment({
 *     characterGender: 'male',
 *     characterAccent: 'German',
 *     elevenlabsVoiceId: 'abc123',
 *     supabaseClient: sb,
 *   })
 *   if (!result.valid) throw new Error(result.error)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NarratorVoiceRow {
  id: string
  name: string
  elevenlabs_voice_id: string
  gender: string | null
  accent: string | null
  is_active: boolean
}

export interface GateResult {
  valid: boolean
  gate?: 'gate1_registered' | 'gate2_gender' | 'gate3_accent'
  error?: string
  voice?: NarratorVoiceRow
}

export interface ValidateVoiceAssignmentParams {
  characterGender: string | null | undefined
  characterAccent: string | null | undefined
  elevenlabsVoiceId: string
  supabaseClient: SupabaseClientLike
}

/** Minimal Supabase client interface so we can inject a mock in tests. */
export interface SupabaseClientLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: NarratorVoiceRow[] | null; error: { message: string } | null }>
    }
  }
}

// ── Accent compatibility ───────────────────────────────────────────────────────

/**
 * Case-insensitive accent match.
 * We treat 'american', 'neutral', 'standard', or 'general american' as
 * compatible with each other. All other accents must match exactly
 * (after normalisation to lowercase + trim).
 *
 * Extend this list as new voices are added.
 */
const NEUTRAL_ACCENT_ALIASES = new Set([
  'american',
  'general american',
  'neutral',
  'standard',
  'us',
  'us english',
])

function accentsAreCompatible(characterAccent: string, voiceAccent: string): boolean {
  const charA = characterAccent.toLowerCase().trim()
  const voiceA = voiceAccent.toLowerCase().trim()
  if (charA === voiceA) return true
  // Both in the neutral cluster → compatible
  if (NEUTRAL_ACCENT_ALIASES.has(charA) && NEUTRAL_ACCENT_ALIASES.has(voiceA)) return true
  return false
}

// ── Gate 1 — Registered-only ──────────────────────────────────────────────────

/**
 * Verify that elevenlabsVoiceId is present in narrator_voices.elevenlabs_voice_id.
 *
 * @returns GateResult — valid=true if registered, else valid=false with error.
 */
export async function checkGate1Registered(
  elevenlabsVoiceId: string,
  supabaseClient: SupabaseClientLike,
): Promise<GateResult & { voiceRow?: NarratorVoiceRow }> {
  if (!elevenlabsVoiceId || typeof elevenlabsVoiceId !== 'string' || !elevenlabsVoiceId.trim()) {
    return {
      valid: false,
      gate: 'gate1_registered',
      error: '[GATE 1 — REGISTERED] voice_id is empty or invalid — assignment rejected',
    }
  }

  const { data: rows, error: dbErr } = await supabaseClient
    .from('narrator_voices')
    .select('id, name, elevenlabs_voice_id, gender, accent, is_active')
    .eq('elevenlabs_voice_id', elevenlabsVoiceId)

  if (dbErr) {
    return {
      valid: false,
      gate: 'gate1_registered',
      error: `[GATE 1 — REGISTERED] DB query failed: ${dbErr.message}`,
    }
  }

  const found = rows && rows.length > 0 ? rows[0] : null
  if (!found) {
    return {
      valid: false,
      gate: 'gate1_registered',
      error: `[GATE 1 — REGISTERED] Voice ID "${elevenlabsVoiceId}" is not in narrator_voices — unregistered voice IDs are rejected. Register the voice first.`,
    }
  }

  return { valid: true, voiceRow: found }
}

// ── Gate 2 — Gender match ─────────────────────────────────────────────────────

/**
 * Verify that the voice gender matches the character gender.
 * NULL character gender bypasses this check (no constraint = OK).
 *
 * @param characterGender  Gender of the character ('male' | 'female' | null)
 * @param voiceRow         narrator_voices row for the assigned voice
 * @returns GateResult
 */
export function checkGate2Gender(
  characterGender: string | null | undefined,
  voiceRow: NarratorVoiceRow,
): GateResult {
  // No character gender = no constraint
  if (!characterGender) {
    return { valid: true }
  }

  const charG = characterGender.toLowerCase().trim()
  const voiceG = (voiceRow.gender ?? '').toLowerCase().trim()

  // Voice has no gender tag — we allow but warn (do not hard-fail)
  if (!voiceG) {
    return { valid: true }
  }

  if (charG !== voiceG) {
    return {
      valid: false,
      gate: 'gate2_gender',
      error: `[GATE 2 — GENDER] Character gender is "${characterGender}" but voice "${voiceRow.name}" (${voiceRow.elevenlabs_voice_id}) is tagged "${voiceRow.gender}" in narrator_voices — gender mismatch, assignment rejected`,
    }
  }

  return { valid: true, voice: voiceRow }
}

// ── Gate 3 — Accent match / no-fallback block ─────────────────────────────────

/**
 * Verify accent compatibility.
 * Only runs when the character has a non-null accent field.
 * Fails loudly when no match exists — never silently assigns arbitrary voice.
 *
 * @param characterAccent  Accent of the character ('German', 'British', etc.) or null
 * @param voiceRow         narrator_voices row for the assigned voice
 * @returns GateResult
 */
export function checkGate3Accent(
  characterAccent: string | null | undefined,
  voiceRow: NarratorVoiceRow,
): GateResult {
  // No character accent requirement = skip check
  if (!characterAccent) {
    return { valid: true }
  }

  const voiceAccent = voiceRow.accent ?? ''

  if (!voiceAccent) {
    return {
      valid: false,
      gate: 'gate3_accent',
      error: `[GATE 3 — ACCENT] Character requires "${characterAccent}" accent but voice "${voiceRow.name}" has no accent tag in narrator_voices — assignment rejected. No registered voice found for "${characterAccent}" accent — cannot assign fallback. Add a ${characterAccent} voice to narrator_voices first.`,
    }
  }

  if (!accentsAreCompatible(characterAccent, voiceAccent)) {
    return {
      valid: false,
      gate: 'gate3_accent',
      error: `[GATE 3 — ACCENT] Character requires "${characterAccent}" accent but voice "${voiceRow.name}" has accent "${voiceRow.accent}" — incompatible. No registered voice found for "${characterAccent}" accent — cannot assign fallback. Add a ${characterAccent} voice to narrator_voices first.`,
    }
  }

  return { valid: true, voice: voiceRow }
}

// ── Main validator ─────────────────────────────────────────────────────────────

/**
 * Run all three gates in sequence. Short-circuits on first failure.
 *
 * @example
 *   const result = await validateVoiceAssignment({
 *     characterGender: 'male',
 *     characterAccent: 'German',
 *     elevenlabsVoiceId: 'someVoiceId',
 *     supabaseClient: sb,
 *   })
 *   if (!result.valid) {
 *     console.error(result.error)
 *     process.exit(1)
 *   }
 */
export async function validateVoiceAssignment(
  params: ValidateVoiceAssignmentParams,
): Promise<GateResult> {
  const { characterGender, characterAccent, elevenlabsVoiceId, supabaseClient } = params

  // Gate 1 — Registered-only
  const gate1 = await checkGate1Registered(elevenlabsVoiceId, supabaseClient)
  if (!gate1.valid) return gate1

  const voiceRow = gate1.voiceRow!

  // Gate 2 — Gender match
  const gate2 = checkGate2Gender(characterGender, voiceRow)
  if (!gate2.valid) return gate2

  // Gate 3 — Accent match
  const gate3 = checkGate3Accent(characterAccent, voiceRow)
  if (!gate3.valid) return gate3

  return { valid: true, voice: voiceRow }
}
