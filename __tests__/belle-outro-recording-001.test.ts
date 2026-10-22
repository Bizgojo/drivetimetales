/**
 * BELLE-OUTRO-RECORDING-001 regression test.
 *
 * Creek Ep1 (2026-10-22): corrected outro text was marked Belle-done with no
 * new recording — the skip filter matched stale `outro_with_music.mp3` via
 * `startsWith('outro_')`, and render input resolution would have baked the
 * same stale composite. A composite must never satisfy the requirement for a
 * standalone outro recording.
 */
import { isStandaloneOutroRecording } from '@/lib/belleOutroRecording'

describe('isStandaloneOutroRecording', () => {
  test('accepts genuine standalone recordings', () => {
    expect(isStandaloneOutroRecording('outro.mp3')).toBe(true)
    expect(isStandaloneOutroRecording('outro_0066.mp3')).toBe(true)
    expect(isStandaloneOutroRecording('outro_0000.mp3')).toBe(true)
  })

  test('rejects the Creek failure: lone stale composite matches nothing', () => {
    // Exact Ep1 storage state that produced the false done flag.
    const files = [{ name: 'outro_with_music.mp3' }]
    const match = files.find((f) => isStandaloneOutroRecording(f.name))
    expect(match).toBeUndefined()
  })

  test('rejects composites and corrected-canon files', () => {
    expect(isStandaloneOutroRecording('outro_with_music.mp3')).toBe(false)
    expect(isStandaloneOutroRecording('outro_corrected.mp3')).toBe(false)
    expect(isStandaloneOutroRecording('outro_corrected_v2.mp3')).toBe(false)
  })

  test('rejects non-outro files', () => {
    expect(isStandaloneOutroRecording('story_body_with_outro.mp3')).toBe(false)
    expect(isStandaloneOutroRecording('intro_00.1.mp3')).toBe(false)
    expect(isStandaloneOutroRecording('final_mix.mp3')).toBe(false)
    expect(isStandaloneOutroRecording('')).toBe(false)
  })

  test('composite present alongside genuine recording still resolves genuine', () => {
    const files = [{ name: 'outro_with_music.mp3' }, { name: 'outro_0066.mp3' }]
    const match = files.find((f) => isStandaloneOutroRecording(f.name))
    expect(match && match.name).toBe('outro_0066.mp3')
  })
})
