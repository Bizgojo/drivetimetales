/**
 * ATL-VOICE-SETTINGS-001 — per-voice ElevenLabs settings overrides
 * in generate-voices (Sunset Ep1 cast, Marc msg 3038).
 *
 * Pins:
 *  (a) override lookup returns the seeded Marc-approved/proposed v1 values
 *      for the three Sunset Ep1 voice_ids,
 *  (b) unknown voice_id falls back to the global EL_SETTINGS object
 *      byte-identically (same reference, identical serialization),
 *  (c) Belle's existing paths are untouched — generate-belle-intro keeps its
 *      own EL_SETTINGS constant and does not consult the override map, and
 *      no Belle-reserved voice_id appears in the override map.
 */

import { readFileSync } from 'fs'
import path from 'path'
import {
  VOICE_SETTINGS_OVERRIDES,
  resolveVoiceSettings,
  type ElVoiceSettings,
} from '@/lib/voiceSettingsOverrides'
import { RESERVED_BELLE_B_VOICE_IDS } from '@/lib/voiceConstants'

const ROOT = path.join(__dirname, '..')
const GENERATE_VOICES_SRC = readFileSync(
  path.join(ROOT, 'app/api/admin/generate-voices/route.ts'),
  'utf8'
)
const BELLE_INTRO_SRC = readFileSync(
  path.join(ROOT, 'app/api/admin/generate-belle-intro/route.ts'),
  'utf8'
)

// Mirror of the global constant in app/api/admin/generate-voices/route.ts.
// The source-pin test below guarantees this mirror cannot drift silently.
const GLOBAL_EL_SETTINGS: ElVoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
}

describe('ATL-VOICE-SETTINGS-001 (a): override lookup returns seeded values', () => {
  test('Eve 1 (AXOPpokL7lng4OPc1L0P) — Marc-approved v1', () => {
    expect(resolveVoiceSettings('AXOPpokL7lng4OPc1L0P', GLOBAL_EL_SETTINGS)).toEqual({
      stability: 0.62,
      similarity_boost: 0.8,
      style: 0.15,
      use_speaker_boost: true,
      speed: 0.95,
    })
  })

  test('Tom 1 (ecF3arP2KBwcy3FM5xRC) — Orion proposal v1', () => {
    expect(resolveVoiceSettings('ecF3arP2KBwcy3FM5xRC', GLOBAL_EL_SETTINGS)).toEqual({
      stability: 0.55,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
      speed: 0.97,
    })
  })

  test('Dana 1 (xRMpxegKwxAenIn6K3Hn) — Orion proposal v1', () => {
    expect(resolveVoiceSettings('xRMpxegKwxAenIn6K3Hn', GLOBAL_EL_SETTINGS)).toEqual({
      stability: 0.68,
      similarity_boost: 0.8,
      style: 0.08,
      use_speaker_boost: true,
      speed: 1.0,
    })
  })

  test('Miriam Hale / Cass (gOZRcEzY40chlRuMDmLV) — Marc-approved msg 3177', () => {
    expect(resolveVoiceSettings('gOZRcEzY40chlRuMDmLV', GLOBAL_EL_SETTINGS)).toEqual({
      stability: 0.58,
      similarity_boost: 0.8,
      style: 0.18,
      use_speaker_boost: true,
      speed: 0.94,
    })
  })

  test('Lena Cho / Ophelia (1nFfPv6rPB37Tt2950M0) — Marc-approved msg 3177', () => {
    expect(resolveVoiceSettings('1nFfPv6rPB37Tt2950M0', GLOBAL_EL_SETTINGS)).toEqual({
      stability: 0.7,
      similarity_boost: 0.8,
      style: 0.06,
      use_speaker_boost: true,
      speed: 0.98,
    })
  })

  test('override map contains exactly the five Sunset cast voice_ids (Ep1 v1 + Eps 2-4 msg 3177)', () => {
    expect(Object.keys(VOICE_SETTINGS_OVERRIDES).sort()).toEqual([
      '1nFfPv6rPB37Tt2950M0',
      'AXOPpokL7lng4OPc1L0P',
      'ecF3arP2KBwcy3FM5xRC',
      'gOZRcEzY40chlRuMDmLV',
      'xRMpxegKwxAenIn6K3Hn',
    ])
  })


})

describe('ATL-VOICE-SETTINGS-001 (b): unknown voice_id falls back byte-identically', () => {
  test('unknown voice_id returns the exact global settings object (same reference)', () => {
    const resolved = resolveVoiceSettings('ZZZunknownVoiceId000', GLOBAL_EL_SETTINGS)
    expect(resolved).toBe(GLOBAL_EL_SETTINGS) // reference identity → byte-identical serialization
    expect(JSON.stringify(resolved)).toBe(JSON.stringify(GLOBAL_EL_SETTINGS))
  })

  test('empty voice_id and near-miss casing also fall back to global', () => {
    expect(resolveVoiceSettings('', GLOBAL_EL_SETTINGS)).toBe(GLOBAL_EL_SETTINGS)
    // exact-match only: case-different id must NOT hit the override
    expect(resolveVoiceSettings('axoppokl7lng4opc1l0p', GLOBAL_EL_SETTINGS)).toBe(GLOBAL_EL_SETTINGS)
  })

  test('global EL_SETTINGS constant in generate-voices route is unchanged', () => {
    expect(GENERATE_VOICES_SRC).toContain(
      "const EL_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }"
    )
    // mirror used by these tests matches the route constant byte-for-byte
    expect(JSON.stringify(GLOBAL_EL_SETTINGS)).toBe(
      JSON.stringify({ stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true })
    )
  })

  test('generate-voices request builder routes voice_settings through resolveVoiceSettings', () => {
    expect(GENERATE_VOICES_SRC).toContain(
      "voice_settings: resolveVoiceSettings(voiceId, EL_SETTINGS)"
    )
    expect(GENERATE_VOICES_SRC).toContain(
      "import { resolveVoiceSettings } from '@/lib/voiceSettingsOverrides'"
    )
    // the old direct usage in the TTS body must be gone
    expect(GENERATE_VOICES_SRC).not.toContain('voice_settings: EL_SETTINGS')
  })
})

describe("ATL-VOICE-SETTINGS-001 (c): Belle's existing path untouched", () => {
  test('generate-belle-intro keeps its own EL_SETTINGS constant', () => {
    expect(BELLE_INTRO_SRC).toContain(
      'const EL_SETTINGS = { stability: 0.49, similarity_boost: 0.51, style: 0.0, use_speaker_boost: true, speed: 1.0 }'
    )
    expect(BELLE_INTRO_SRC).toContain(
      "voice_settings: EL_SETTINGS"
    )
  })

  test('generate-belle-intro does not consult the override map', () => {
    expect(BELLE_INTRO_SRC).not.toContain('voiceSettingsOverrides')
    expect(BELLE_INTRO_SRC).not.toContain('resolveVoiceSettings')
    expect(BELLE_INTRO_SRC).not.toContain('VOICE_SETTINGS_OVERRIDES')
  })

  test('no Belle-reserved voice_id appears in the override map', () => {
    RESERVED_BELLE_B_VOICE_IDS.forEach(belleId => {
      expect(VOICE_SETTINGS_OVERRIDES[belleId]).toBeUndefined()
    })
  })

  test("Belle's canonical voice_id resolves to whatever global settings the caller passes", () => {
    const belleGlobals: ElVoiceSettings = {
      stability: 0.49,
      similarity_boost: 0.51,
      style: 0.0,
      use_speaker_boost: true,
      speed: 1.0,
    }
    expect(resolveVoiceSettings('GMhgX8fCR9GUtd3kmlKC', belleGlobals)).toBe(belleGlobals)
  })
})
