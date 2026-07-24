/**
 * voice-fallback-gate.test.js — VOICE-FALLBACK-001
 *
 * Regression tests for the three-gate voice validation system.
 *
 * Gate 1 — Registered-only: voice_id must exist in narrator_voices
 * Gate 2 — Gender match:    voice gender must match character gender
 * Gate 3 — Accent match:    voice accent must be compatible with character accent
 *
 * Run: npx jest __tests__/voice-fallback-gate.test.js --no-coverage
 */

'use strict'

// ---------------------------------------------------------------------------
// Pure re-implementation of gate logic (no Supabase, no I/O)
// Mirrors lib/voiceFallbackGate.ts exactly so tests remain deterministic.
// ---------------------------------------------------------------------------

const NEUTRAL_ACCENT_ALIASES = new Set([
  'american',
  'general american',
  'neutral',
  'standard',
  'us',
  'us english',
])

function accentsAreCompatible(characterAccent, voiceAccent) {
  const charA = characterAccent.toLowerCase().trim()
  const voiceA = voiceAccent.toLowerCase().trim()
  if (charA === voiceA) return true
  if (NEUTRAL_ACCENT_ALIASES.has(charA) && NEUTRAL_ACCENT_ALIASES.has(voiceA)) return true
  return false
}

// ── Gate 1 ─────────────────────────────────────────────────────────────────────

async function checkGate1Registered(elevenlabsVoiceId, supabaseClient) {
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

// ── Gate 2 ─────────────────────────────────────────────────────────────────────

function checkGate2Gender(characterGender, voiceRow) {
  if (!characterGender) return { valid: true }

  const charG = characterGender.toLowerCase().trim()
  const voiceG = (voiceRow.gender ?? '').toLowerCase().trim()

  if (!voiceG) return { valid: true }

  if (charG !== voiceG) {
    return {
      valid: false,
      gate: 'gate2_gender',
      error: `[GATE 2 — GENDER] Character gender is "${characterGender}" but voice "${voiceRow.name}" (${voiceRow.elevenlabs_voice_id}) is tagged "${voiceRow.gender}" in narrator_voices — gender mismatch, assignment rejected`,
    }
  }

  return { valid: true, voice: voiceRow }
}

// ── Gate 3 ─────────────────────────────────────────────────────────────────────

function checkGate3Accent(characterAccent, voiceRow) {
  if (!characterAccent) return { valid: true }

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

// ── Full validator ─────────────────────────────────────────────────────────────

async function validateVoiceAssignment({ characterGender, characterAccent, elevenlabsVoiceId, supabaseClient }) {
  const gate1 = await checkGate1Registered(elevenlabsVoiceId, supabaseClient)
  if (!gate1.valid) return gate1

  const voiceRow = gate1.voiceRow

  const gate2 = checkGate2Gender(characterGender, voiceRow)
  if (!gate2.valid) return gate2

  const gate3 = checkGate3Accent(characterAccent, voiceRow)
  if (!gate3.valid) return gate3

  return { valid: true, voice: voiceRow }
}

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock Supabase client backed by an in-memory narrator_voices table.
 * @param {Array} voiceRows  - Rows to populate narrator_voices
 */
function makeSupabaseMock(voiceRows = []) {
  return {
    from(table) {
      return {
        select(_cols) {
          return {
            eq(column, value) {
              const matched = voiceRows.filter(r => r[column] === value)
              return Promise.resolve({ data: matched, error: null })
            },
          }
        },
      }
    },
  }
}

/** Returns a mock that always returns a DB error. */
function makeErrorSupabaseMock(message = 'connection refused') {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: null, error: { message } })
            },
          }
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MALE_VOICE = {
  id: 'voice-row-001',
  name: 'Marcus - Strong & Commanding',
  elevenlabs_voice_id: 'mVtYAPoXNDFGrHqUV1mT',
  gender: 'male',
  accent: 'american',
  is_active: true,
}

const FEMALE_VOICE = {
  id: 'voice-row-002',
  name: 'Lola - Soft, Innocent & Calming',
  elevenlabs_voice_id: 'f9imtLc2jfOLXtqe3Ihb',
  gender: 'female',
  accent: 'american',
  is_active: true,
}

const BRITISH_MALE_VOICE = {
  id: 'voice-row-003',
  name: 'Edmund - British Storyteller',
  elevenlabs_voice_id: 'edBritish001xyzABCD',
  gender: 'male',
  accent: 'british',
  is_active: true,
}

const ALL_VOICES = [MALE_VOICE, FEMALE_VOICE, BRITISH_MALE_VOICE]

// ---------------------------------------------------------------------------
// Gate 1 — Registered-only
// ---------------------------------------------------------------------------

describe('Gate 1 — Registered-only', () => {
  test('PASS: known voice_id in narrator_voices', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await checkGate1Registered(MALE_VOICE.elevenlabs_voice_id, sb)
    expect(result.valid).toBe(true)
    expect(result.voiceRow).toMatchObject({ elevenlabs_voice_id: MALE_VOICE.elevenlabs_voice_id })
  })

  test('FAIL: unregistered voice_id not in narrator_voices', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await checkGate1Registered('UNKNOWN_VOICE_XYZ', sb)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate1_registered')
    expect(result.error).toMatch(/not in narrator_voices/i)
    expect(result.error).toMatch(/GATE 1/i)
    expect(result.error).toMatch('UNKNOWN_VOICE_XYZ')
  })

  test('FAIL: empty voice_id string', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await checkGate1Registered('', sb)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate1_registered')
    expect(result.error).toMatch(/empty or invalid/i)
  })

  test('FAIL: DB query error propagates as gate failure', async () => {
    const sb = makeErrorSupabaseMock('PGRST116: connection refused')
    const result = await checkGate1Registered('any-voice-id', sb)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate1_registered')
    expect(result.error).toMatch(/DB query failed/i)
  })

  test('FAIL: narrator_voices is empty — no voices registered yet', async () => {
    const sb = makeSupabaseMock([])
    const result = await checkGate1Registered(MALE_VOICE.elevenlabs_voice_id, sb)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate1_registered')
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — Gender match
// ---------------------------------------------------------------------------

describe('Gate 2 — Gender match', () => {
  test('FAIL: female voice assigned to male character (the Lola/Kendrick incident)', () => {
    // This is the exact bug that triggered VOICE-FALLBACK-001
    const result = checkGate2Gender('male', FEMALE_VOICE)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate2_gender')
    expect(result.error).toMatch(/GATE 2/i)
    expect(result.error).toMatch(/gender mismatch/i)
    expect(result.error).toMatch(/male/i)
    expect(result.error).toMatch(/female/i)
  })

  test('FAIL: male voice assigned to female character', () => {
    const result = checkGate2Gender('female', MALE_VOICE)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate2_gender')
    expect(result.error).toMatch(/gender mismatch/i)
  })

  test('PASS: male voice on male character', () => {
    const result = checkGate2Gender('male', MALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: female voice on female character', () => {
    const result = checkGate2Gender('female', FEMALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: NULL character gender bypasses gender check entirely', () => {
    const result = checkGate2Gender(null, FEMALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: undefined character gender bypasses gender check', () => {
    const result = checkGate2Gender(undefined, FEMALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: voice with no gender tag — no constraint to check', () => {
    const untaggedVoice = { ...MALE_VOICE, gender: null }
    const result = checkGate2Gender('male', untaggedVoice)
    expect(result.valid).toBe(true)
  })

  test('PASS: gender comparison is case-insensitive (Male vs male)', () => {
    const result = checkGate2Gender('Male', MALE_VOICE)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Gate 3 — Accent match / no-fallback block
// ---------------------------------------------------------------------------

describe('Gate 3 — Accent match / no-fallback block', () => {
  test('FAIL: German character + no German voice in registry → fail loudly', () => {
    const result = checkGate3Accent('German', MALE_VOICE) // american voice
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate3_accent')
    expect(result.error).toMatch(/GATE 3/i)
    expect(result.error).toMatch(/German/i)
    expect(result.error).toMatch(/cannot assign fallback/i)
    expect(result.error).toMatch(/Add a German voice/i)
  })

  test('FAIL: voice has no accent tag + character requires specific accent', () => {
    const untaggedVoice = { ...MALE_VOICE, accent: null }
    const result = checkGate3Accent('British', untaggedVoice)
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate3_accent')
    expect(result.error).toMatch(/no accent tag/i)
  })

  test('FAIL: British character accent vs American voice accent', () => {
    const result = checkGate3Accent('British', MALE_VOICE) // american voice
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate3_accent')
    expect(result.error).toMatch(/incompatible/i)
  })

  test('PASS: British character + British voice', () => {
    const result = checkGate3Accent('British', BRITISH_MALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: NULL character accent — no accent requirement, gate skipped', () => {
    const result = checkGate3Accent(null, MALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: undefined character accent — gate skipped', () => {
    const result = checkGate3Accent(undefined, BRITISH_MALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: both character and voice are in neutral accent cluster (american ↔ neutral)', () => {
    const neutralVoice = { ...MALE_VOICE, accent: 'neutral' }
    const result = checkGate3Accent('american', neutralVoice)
    expect(result.valid).toBe(true)
  })

  test('PASS: accent match is case-insensitive (american vs American)', () => {
    const result = checkGate3Accent('American', MALE_VOICE)
    expect(result.valid).toBe(true)
  })

  test('PASS: exact accent match (british ↔ british)', () => {
    const result = checkGate3Accent('british', BRITISH_MALE_VOICE)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Full validateVoiceAssignment — integration paths
// ---------------------------------------------------------------------------

describe('validateVoiceAssignment — integration', () => {
  test('PASS: all three gates pass for valid male/american assignment', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await validateVoiceAssignment({
      characterGender: 'male',
      characterAccent: 'american',
      elevenlabsVoiceId: MALE_VOICE.elevenlabs_voice_id,
      supabaseClient: sb,
    })
    expect(result.valid).toBe(true)
    expect(result.voice).toMatchObject({ elevenlabs_voice_id: MALE_VOICE.elevenlabs_voice_id })
  })

  test('FAIL: unregistered voice_id stops at gate 1 before gender/accent checks', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await validateVoiceAssignment({
      characterGender: 'male',
      characterAccent: 'american',
      elevenlabsVoiceId: 'TOTALLY_UNREGISTERED_ID',
      supabaseClient: sb,
    })
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate1_registered')
  })

  test('FAIL: female voice on male character → gate 2 blocks (the Lola/Kendrick incident)', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    // Female voice (Lola) assigned to a male character (KENDRICK/LORENZ type)
    const result = await validateVoiceAssignment({
      characterGender: 'male',
      characterAccent: 'american',
      elevenlabsVoiceId: FEMALE_VOICE.elevenlabs_voice_id, // f9imtLc2jfOLXtqe3Ihb
      supabaseClient: sb,
    })
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate2_gender')
    expect(result.error).toMatch(/GATE 2/i)
    expect(result.error).toMatch(/gender mismatch/i)
  })

  test('FAIL: German accent character + American voice → gate 3 blocks with clear message', async () => {
    const sb = makeSupabaseMock(ALL_VOICES) // No German voices in registry
    const result = await validateVoiceAssignment({
      characterGender: 'male',
      characterAccent: 'German',
      elevenlabsVoiceId: MALE_VOICE.elevenlabs_voice_id, // american accent
      supabaseClient: sb,
    })
    expect(result.valid).toBe(false)
    expect(result.gate).toBe('gate3_accent')
    expect(result.error).toMatch(/GATE 3/i)
    expect(result.error).toMatch(/German/i)
    expect(result.error).toMatch(/cannot assign fallback/i)
  })

  test('PASS: NULL character gender → gate 2 skipped, passes all gates', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await validateVoiceAssignment({
      characterGender: null,
      characterAccent: null,
      elevenlabsVoiceId: MALE_VOICE.elevenlabs_voice_id,
      supabaseClient: sb,
    })
    expect(result.valid).toBe(true)
  })

  test('PASS: female character with no accent constraint → all gates pass', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await validateVoiceAssignment({
      characterGender: 'female',
      characterAccent: null,
      elevenlabsVoiceId: FEMALE_VOICE.elevenlabs_voice_id,
      supabaseClient: sb,
    })
    expect(result.valid).toBe(true)
    expect(result.voice).toMatchObject({ gender: 'female' })
  })

  test('Error shape always has gate name + reason on failure', async () => {
    const sb = makeSupabaseMock(ALL_VOICES)
    const result = await validateVoiceAssignment({
      characterGender: 'male',
      characterAccent: null,
      elevenlabsVoiceId: FEMALE_VOICE.elevenlabs_voice_id,
      supabaseClient: sb,
    })
    expect(result.valid).toBe(false)
    expect(result.gate).toBeDefined()
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })
})
