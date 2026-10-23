/**
 * CAST-COLLISION-001 — shared cast-collision gate regression tests.
 *
 * Guard (HAL PACKAGE ACCEPTANCE GATE, Marc 2026-10-23): cast-collision
 * checks must run the ACTUAL deployed predicate — never a hand-assembled
 * inventory. These tests pin the manifest-level gate (lib/castCollision.ts):
 * Sarah's voice is blocked, Matilda's voice is clear, the Belle wrapper
 * path is exempt ONLY via explicit flag, and a full clear cast passes.
 */

import {
  CAST_COLLISION_GATE_ID,
  checkCastCollisions,
  formatCastCollisions,
  isBelleWrapperSpeaker,
} from '@/lib/castCollision'
import { isBelleBVoiceId } from '@/lib/voiceConstants'

const SARAH_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const MATILDA_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'

describe('CAST-COLLISION-001 shared cast gate', () => {
  test('gate id is stable', () => {
    expect(CAST_COLLISION_GATE_ID).toBe('CAST-COLLISION-001')
  })

  test('Sarah (EXAVITQu4vr4xnSDxMaL) as a character is BLOCKED', () => {
    // Cross-check the operative predicate directly — the shared gate must
    // agree with it, not with any copied list.
    expect(isBelleBVoiceId(SARAH_VOICE_ID)).toBe(true)
    const result = checkCastCollisions({ SARAH: SARAH_VOICE_ID })
    expect(result.passed).toBe(false)
    expect(result.collisions).toEqual([{ character: 'SARAH', voiceId: SARAH_VOICE_ID }])
    expect(formatCastCollisions(result)).toMatch(/FAIL/)
    expect(formatCastCollisions(result)).toMatch(/SARAH/)
  })

  test('Matilda (XrExE9yKIg1WjnnlVkGX) as a character is CLEAR', () => {
    expect(isBelleBVoiceId(MATILDA_VOICE_ID)).toBe(false)
    const result = checkCastCollisions({ MATILDA: MATILDA_VOICE_ID })
    expect(result.passed).toBe(true)
    expect(result.collisions).toEqual([])
  })

  test('full clear cast passes; one Sarah entry fails the whole manifest', () => {
    const clearCast = {
      MATILDA: MATILDA_VOICE_ID,
      NORA: 'narrator-voice-id-1',
      ELIAS: 'narrator-voice-id-2',
    }
    const clear = checkCastCollisions(clearCast)
    expect(clear.passed).toBe(true)
    expect(clear.checked).toBe(3)
    expect(formatCastCollisions(clear)).toMatch(/PASS/)

    const tainted = checkCastCollisions({ ...clearCast, SARAH: SARAH_VOICE_ID })
    expect(tainted.passed).toBe(false)
    expect(tainted.collisions).toHaveLength(1)
  })

  test('Belle wrapper speakers exempt ONLY with explicit flag', () => {
    expect(isBelleWrapperSpeaker('BELLE')).toBe(true)
    expect(isBelleWrapperSpeaker('Belle B')).toBe(true)
    expect(isBelleWrapperSpeaker('Matilda')).toBe(false)

    const manifest = { 'BELLE B': 'GMhgX8fCR9GUtd3kmlKC' }
    const strict = checkCastCollisions(manifest)
    expect(strict.passed).toBe(false)

    const exempt = checkCastCollisions(manifest, { allowBelleWrapper: true })
    expect(exempt.passed).toBe(true)
    expect(exempt.exempted).toEqual(['BELLE B'])
  })

  test('flag does not exempt characters', () => {
    const result = checkCastCollisions({ SARAH: SARAH_VOICE_ID }, { allowBelleWrapper: true })
    expect(result.passed).toBe(false)
  })

  test('empty manifest passes; blank voice ids are not collisions', () => {
    expect(checkCastCollisions({}).passed).toBe(true)
    expect(checkCastCollisions({ GHOST: '' }).passed).toBe(true)
    expect(checkCastCollisions({ GHOST: null }).passed).toBe(true)
  })
})
