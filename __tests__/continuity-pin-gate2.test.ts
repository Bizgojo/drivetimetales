/**
 * GATE 2 — CONTINUITY PIN tests.
 *
 * Spec: drafts/GATE-GAPS-SPEC-20261004.md §2 (PIPELINE-CANON-001 Rules 1–3).
 *
 * Covers:
 *  - hash stability (CRLF/LF/whitespace-twiddle)
 *  - pin-write on Ep2 generation captures Ep1 hash
 *  - package-final passes when prior scripts unchanged (matching hashes pass)
 *  - fails with correct ep + hash pair when Ep1 script edited post-consumption
 *  - Belle-only edit does NOT trip the pin (asset rows, not stories.script)
 *  - legacy pre-landing eps with no pins → pins_absent warn, not fail
 */

import {
  hashScript,
  buildContinuityPins,
  verifyContinuityPins,
} from '@/lib/continuityPin'

const EP1_SCRIPT = `TITLE: The First Light
DESCRIPTION: A beginning.

NARRATOR: The town woke slowly.
ELENA: We should go.
`

const EP2_SCRIPT = `TITLE: The Return
DESCRIPTION: A reckoning.

NARRATOR: She came back changed.
ELENA: It is over now.
`

describe('GATE 2 — hashScript stability', () => {
  test('CRLF and LF produce the same hash', () => {
    const lf = 'NARRATOR: Line one.\nELENA: Line two.'
    const crlf = 'NARRATOR: Line one.\r\nELENA: Line two.'
    expect(hashScript(lf)).toBe(hashScript(crlf))
  })

  test('bare CR normalizes to LF (same hash)', () => {
    const lf = 'a\nb\nc'
    const cr = 'a\rb\rc'
    expect(hashScript(cr)).toBe(hashScript(lf))
  })

  test('leading/trailing whitespace is trimmed (same hash)', () => {
    const base = 'NARRATOR: Hello.'
    expect(hashScript(`   \n${base}\n\n  `)).toBe(hashScript(base))
  })

  test('internal content change yields a different hash', () => {
    expect(hashScript('NARRATOR: A.')).not.toBe(hashScript('NARRATOR: B.'))
  })

  test('NFC normalization: composed vs decomposed accents hash identically', () => {
    const composed = 'ELENA: caf\u00e9'          // é as single codepoint
    const decomposed = 'ELENA: cafe\u0301'       // e + combining acute
    expect(hashScript(composed)).toBe(hashScript(decomposed))
  })

  test('null/undefined hashes as empty string', () => {
    expect(hashScript(null)).toBe(hashScript(''))
    expect(hashScript(undefined)).toBe(hashScript(''))
  })
})

describe('GATE 2 — buildContinuityPins (pin-write at generation)', () => {
  test('Ep2 generation captures Ep1 hash keyed by story id', () => {
    const priorEpisodes = [{ id: 'story-ep1', script: EP1_SCRIPT }]
    const pins = buildContinuityPins(priorEpisodes)
    expect(pins).toEqual({ 'story-ep1': hashScript(EP1_SCRIPT) })
  })

  test('episodes without a script are skipped', () => {
    const priorEpisodes = [
      { id: 'story-ep1', script: EP1_SCRIPT },
      { id: 'story-ep0', script: '' },
      { id: 'story-epx', script: null },
    ]
    const pins = buildContinuityPins(priorEpisodes)
    expect(Object.keys(pins)).toEqual(['story-ep1'])
  })

  test('captures multiple priors for Ep3', () => {
    const pins = buildContinuityPins([
      { id: 'ep1', script: EP1_SCRIPT },
      { id: 'ep2', script: EP2_SCRIPT },
    ])
    expect(pins).toEqual({
      ep1: hashScript(EP1_SCRIPT),
      ep2: hashScript(EP2_SCRIPT),
    })
  })
})

// Helper: build a downstream ep row with pins nested where the real generation
// site writes them (script_json.series_generation.continuity_pins_used).
function epRow(opts: {
  id: string
  epNum: number
  script: string
  pins?: Record<string, string>
}) {
  const sg: any = {
    generated_title: 'x',
    continuity_bundle_used: [],
  }
  if (opts.pins) sg.continuity_pins_used = opts.pins
  return {
    id: opts.id,
    episode_number: opts.epNum,
    script: opts.script,
    script_json: { series_generation: sg },
  }
}

describe('GATE 2 — verifyContinuityPins (package-arc final step)', () => {
  test('matching hashes pass (prior scripts unchanged)', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    const ep2 = epRow({
      id: 'ep2',
      epNum: 2,
      script: EP2_SCRIPT,
      pins: { ep1: hashScript(EP1_SCRIPT) },
    })
    const result = verifyContinuityPins([ep1, ep2])
    expect(result.ok).toBe(true)
    expect(result.mismatches).toEqual([])
    expect(result.pins_absent).toBe(false)
    expect(result.checkedEpisodes).toBe(1)
  })

  test('hard fail with correct ep + hash pair when Ep1 edited post-consumption', () => {
    const consumedHash = hashScript(EP1_SCRIPT)
    // Ep1 script corrected AFTER Ep2 consumed it:
    const ep1Corrected = EP1_SCRIPT.replace('The town woke slowly.', 'The town woke to sirens.')
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: ep1Corrected })
    const ep2 = epRow({
      id: 'ep2',
      epNum: 2,
      script: EP2_SCRIPT,
      pins: { ep1: consumedHash },
    })
    const result = verifyContinuityPins([ep1, ep2])
    expect(result.ok).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    const m = result.mismatches[0]
    expect(m.episodeNumber).toBe(2)
    expect(m.storyId).toBe('ep2')
    expect(m.priorStoryId).toBe('ep1')
    expect(m.expectedHash).toBe(consumedHash)
    expect(m.actualHash).toBe(hashScript(ep1Corrected))
    expect(m.actualHash).not.toBe(consumedHash)
  })

  test('Belle-only edit does NOT trip the pin', () => {
    // Belle edits mutate Belle asset rows, never stories.script. Simulate: the
    // ep's belle asset text changes but script column is byte-identical.
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    const ep2 = {
      ...epRow({ id: 'ep2', epNum: 2, script: EP2_SCRIPT, pins: { ep1: hashScript(EP1_SCRIPT) } }),
      belle_intro_text: 'Welcome back, friend — a brand new Belle intro.',
      belle_outro_text: 'Different outro text entirely.',
    }
    // Ep1 also gets a Belle edit (separate column), script untouched:
    const ep1WithBelle = { ...ep1, belle_intro_text: 'Totally reworded Belle intro for Ep1.' }
    const result = verifyContinuityPins([ep1WithBelle, ep2])
    expect(result.ok).toBe(true)
    expect(result.mismatches).toEqual([])
  })

  test('whitespace-only re-save of prior script does NOT trip (hash normalized)', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: `\n\n${EP1_SCRIPT.replace(/\n/g, '\r\n')}\n  ` })
    const ep2 = epRow({
      id: 'ep2',
      epNum: 2,
      script: EP2_SCRIPT,
      pins: { ep1: hashScript(EP1_SCRIPT) },
    })
    const result = verifyContinuityPins([ep1, ep2])
    expect(result.ok).toBe(true)
  })

  test('legacy pre-landing eps with no pins → pins_absent warn, not fail', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    // Ep2 generated before the gate landed: no continuity_pins_used key.
    const ep2 = epRow({ id: 'ep2', epNum: 2, script: EP2_SCRIPT }) // no pins
    const result = verifyContinuityPins([ep1, ep2])
    expect(result.ok).toBe(true)                 // not a hard fail
    expect(result.pins_absent).toBe(true)
    expect(result.pinsAbsentEpisodes).toContain(2)
    expect(result.checkedEpisodes).toBe(0)
  })

  test('mixed: Ep2 pinned+ok, Ep3 legacy → pass with pins_absent for Ep3', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    const ep2 = epRow({ id: 'ep2', epNum: 2, script: EP2_SCRIPT, pins: { ep1: hashScript(EP1_SCRIPT) } })
    const ep3 = epRow({ id: 'ep3', epNum: 3, script: 'TITLE: Three\nNARRATOR: End.' }) // legacy
    const result = verifyContinuityPins([ep1, ep2, ep3])
    expect(result.ok).toBe(true)
    expect(result.pins_absent).toBe(true)
    expect(result.pinsAbsentEpisodes).toEqual([3])
    expect(result.checkedEpisodes).toBe(1)
  })

  test('vanished prior (not in current set) fails closed as missing', () => {
    // Ep2 pinned ep1, but ep1 is no longer present (e.g. cold-storage swap).
    const ep2 = epRow({ id: 'ep2', epNum: 2, script: EP2_SCRIPT, pins: { ep1: hashScript(EP1_SCRIPT) } })
    const result = verifyContinuityPins([ep2])
    expect(result.ok).toBe(false)
    expect(result.mismatches[0].actualHash).toBe('missing')
    expect(result.mismatches[0].priorStoryId).toBe('ep1')
  })

  test('Ep1 (no priors) is never checked or flagged', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    const result = verifyContinuityPins([ep1])
    expect(result.ok).toBe(true)
    expect(result.pins_absent).toBe(false)
    expect(result.checkedEpisodes).toBe(0)
  })

  test('multiple pins on one ep: any single mismatch fails', () => {
    const ep1 = epRow({ id: 'ep1', epNum: 1, script: EP1_SCRIPT })
    const ep2 = epRow({ id: 'ep2', epNum: 2, script: EP2_SCRIPT })
    const ep3 = epRow({
      id: 'ep3',
      epNum: 3,
      script: 'TITLE: Three\nNARRATOR: End.',
      pins: { ep1: hashScript(EP1_SCRIPT), ep2: hashScript('changed') },
    })
    const result = verifyContinuityPins([ep1, ep2, ep3])
    expect(result.ok).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0].priorStoryId).toBe('ep2')
  })
})
