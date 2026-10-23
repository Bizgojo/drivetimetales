/**
 * SARAH-REGRESSION-001 — Belle B reserved-voice guard.
 *
 * Regression: v2.1's hand-built reserved-voice list missed the operative
 * file (lib/voiceConstants.ts) and cleared Sarah (EXAVITQu4vr4xnSDxMaL).
 * Per HAL PACKAGE ACCEPTANCE GATE (Marc 2026-10-23): cast-collision checks
 * must run the ACTUAL deployed predicate in code — never a hand-assembled
 * inventory. This test pins that: it imports the real RESERVED set and the
 * real isBelleBVoiceId predicate and asserts all four reserved IDs are
 * blocked, plus a known-clear voice stays clear.
 */

import {
  RESERVED_BELLE_B_VOICE_IDS,
  isBelleBVoiceId,
} from '@/lib/voiceConstants'

describe('SARAH-REGRESSION-001 Belle B reserved voices', () => {
  test('Sarah (EXAVITQu4vr4xnSDxMaL) is in RESERVED_BELLE_B_VOICE_IDS', () => {
    expect(RESERVED_BELLE_B_VOICE_IDS.has('EXAVITQu4vr4xnSDxMaL')).toBe(true)
  })

  test('isBelleBVoiceId true for all 4 reserved IDs', () => {
    const allReserved = [
      'GMhgX8fCR9GUtd3kmlKC', // canonical Belle B
      'wewocdDkjSLm9ZwjO7TD', // retired original
      'KWDD3Wyq30ZF5NEL01EJ', // retired — always wrong
      'EXAVITQu4vr4xnSDxMaL', // Sarah
    ]
    expect(RESERVED_BELLE_B_VOICE_IDS.size).toBe(4)
    for (const id of allReserved) {
      expect(RESERVED_BELLE_B_VOICE_IDS.has(id)).toBe(true)
      expect(isBelleBVoiceId(id)).toBe(true)
    }
  })

  test('known-clear voice XrExE9yKIg1WjnnlVkGX is not flagged', () => {
    expect(isBelleBVoiceId('XrExE9yKIg1WjnnlVkGX')).toBe(false)
  })
})
