/**
 * SCRIPT-RUNTIME-PREFLIGHT-001 — focused tests (Marc order 2026-10-22 23:34 EDT)
 *
 * 1. Short script bounced pre-spend (Harbor Light Ep2 shape: ~1991 words → ~12.4 min).
 * 2. Borderline margin logic (1999 words fails, 2000 passes).
 * 3. Normal script passes (~3000 words → ~18.75 min).
 * 4. Final measured gate (RUNTIME-GATE-001) still catches misses — intact.
 * 5. Calibration anchors: all six measured Harbor Light/Creek episodes fall
 *    below the pre-spend floor (they all shipped short of 15 min).
 * 6. Unmeasurable script (no spoken lines) skips instead of blocking.
 */
import {
  estimateScriptRuntime,
  checkScriptRuntimeMeetsMinimum,
  formatScriptRuntimeShortMessage,
  SCRIPT_RUNTIME_PREFLIGHT,
} from '@/lib/scriptRuntimeEstimate'
import { checkRuntimeVsBrief } from '@/lib/runtimeGate'

/** Build a drama-body script with EXACTLY `wordCount` spoken words. */
function buildScript(wordCount: number): string {
  const body: string[] = []
  let emitted = 0
  let line = 0
  const speakers = ['NARRATOR', 'LUCY BRENNAN', 'JONAH REYES']
  while (emitted < wordCount) {
    const take = Math.min(10, wordCount - emitted)
    const words = Array.from({ length: take }, (_, i) => `w${emitted + i}`)
    body.push(`${speakers[line % speakers.length]}: ${words.join(' ')}`)
    emitted += take
    line++
  }
  return [
    'TITLE: Test Episode',
    'SERIES: Test Series',
    'NARRATOR: Test Voice',
    'CHARACTER GUIDE',
    '---',
    'LUCY BRENNAN — test character.',
    '---',
    '[START AUDIO DRAMA SCRIPT]',
    ...body,
    '[SFX: harbor bell]',
    '[PAUSE:2]',
    '[END AUDIO DRAMA SCRIPT]',
  ].join('\n')
}

describe('SCRIPT-RUNTIME-PREFLIGHT-001', () => {
  test('short script is bounced pre-spend (Harbor Light Ep2 shape)', () => {
    // RUNTIME-FLOOR-SPEC-001: floor is now 12.5 min (2000 words). An
    // ~8-min script (CEO series shape, ~1300 words) must still bounce.
    const check = checkScriptRuntimeMeetsMinimum(buildScript(1300))
    expect(check.skipped).toBe(false)
    expect(check.pass).toBe(false)
    expect(check.estimatedMins).toBeLessThan(12)
    expect(check.estimatedMins).toBeCloseTo(1300 / 160, 1)
    const msg = formatScriptRuntimeShortMessage(check)
    expect(msg).toMatch(/8\.1 min/)
    expect(msg).toMatch(/2000/)
  })

  test('borderline margin logic: 1999 fails, 2000 passes', () => {
    expect(checkScriptRuntimeMeetsMinimum(buildScript(1999)).pass).toBe(false)
    const at = checkScriptRuntimeMeetsMinimum(buildScript(2000))
    expect(at.skipped).toBe(false)
    expect(at.pass).toBe(true)
    expect(at.estimatedMins).toBeGreaterThanOrEqual(
      SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES,
    )
  })

  test('normal script passes', () => {
    const check = checkScriptRuntimeMeetsMinimum(buildScript(3000))
    expect(check.pass).toBe(true)
    expect(check.estimatedMins).toBeCloseTo(3000 / 160, 0)
  })

  test('final measured gate (RUNTIME-GATE-001) still catches misses — intact', () => {
    // A 12.8-min mix against a 15-min brief must still fail the final gate.
    const gate = checkRuntimeVsBrief(12.8 * 60, 15 * 60)
    expect(gate.skipped).toBe(false)
    expect(gate.pass).toBe(false)
    // And a good 16.2-min mix still passes it.
    expect(checkRuntimeVsBrief(16.2 * 60, 15 * 60).pass).toBe(true)
  })

  test('calibration anchors vs the spec floor (RUNTIME-FLOOR-SPEC-001, 12.5 min)', () => {
    // Under PUBLISHED_STORY_SPEC v1.5 (12–18 min), every anchor that shipped
    // under 12 minutes must still bounce pre-spend; Harbor Light Ep1
    // (13.8 min actual) must pass.
    const anchors: Array<[string, number, number]> = [
      ['Harbor Light Ep1', 2273, 830.6],
      ['Harbor Light Ep2', 1991, 767.2],
      ['Harbor Light Ep3', 1924, 723.2],
      ['Creek Ep1', 1754, 619.6],
      ['Creek Ep2', 1822, 699.8],
      ['Creek Ep3', 1778, 635.2],
    ]
    for (const [name, words, actualSecs] of anchors) {
      const mins = words / SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM
      if (actualSecs < 12 * 60) {
        expect(mins).toBeLessThan(SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES, name)
      }
    }
    expect(2273 / SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM).toBeGreaterThanOrEqual(SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES)
  })

  test('historical: all six anchors were below the old 15.5-min floor', () => {
    // Spoken-word counts from parseScriptPositions on shipped scripts (2026-10-22).
    const measured: Array<[string, number, number]> = [
      ['Harbor Light Ep1', 2273, 830.6],
      ['Harbor Light Ep2', 1991, 767.2],
      ['Harbor Light Ep3', 1924, 723.2],
      ['Creek Ep1', 1754, 619.6],
      ['Creek Ep2', 1822, 699.8],
      ['Creek Ep3', 1778, 635.2],
    ]
    for (const [name, words, actualSecs] of measured) {
      // Every one shipped short of 15 min…
      expect(actualSecs).toBeLessThan(15 * 60, name)
      // …and every one would have bounced at the old 15.5-min floor.
      const mins = words / SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM
      expect(mins).toBeLessThan(15.5, name)
    }
  })

  test('unmeasurable script skips instead of blocking', () => {
    for (const script of ['', 'TITLE: Empty\nNo speaker lines here.\n', '[START AUDIO DRAMA SCRIPT]\n[PAUSE]\n[END AUDIO DRAMA SCRIPT]']) {
      const check = checkScriptRuntimeMeetsMinimum(script)
      expect(check.skipped).toBe(true, JSON.stringify(script))
      expect(check.pass).toBe(false)
    }
  })

  test('route wiring reads the documented check field (regression pin)', () => {
    // Codex review caught route.ts reading `runtimeCheck.passed` (undefined —
    // would bounce EVERY script) instead of the `pass` field this lib returns.
    // The route handler is not unit-importable, so pin the wiring statically.
    const fs = require('fs')
    const path = require('path')
    const src: string = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'production-jobs', 'run-next', 'route.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/runtimeCheck\.passed/)
    // Two gate conditions (solo + series) and two persisted markers.
    expect((src.match(/if \(!runtimeCheck\.pass && !runtimeCheck\.skipped\)/g) || []).length).toBe(2)
    expect((src.match(/passed: runtimeCheck\.pass,/g) || []).length).toBe(2)
  })

  test('estimate counts only voice positions (headers/SFX/silence excluded)', () => {
    const est = estimateScriptRuntime(buildScript(160))
    expect(est.spokenWords).toBe(160)
    expect(est.voiceSegments).toBe(16)
    expect(est.estimatedSecs).toBe(est.estimatedMins * 60)
  })
})
