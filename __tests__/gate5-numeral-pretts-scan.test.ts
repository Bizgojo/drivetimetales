// GATE 5 — NUMERAL PRE-TTS SCAN
// Spec: drafts/GATE-GAPS-SPEC-20261004.md §5 (NUMERAL PRE-TTS SCAN)
//
// Problem: TTS misreads digit-form numerals ("4.6", "13.8"). Normalization
// existed only comparison-side; nothing blocked digit numerals BEFORE TTS.
// This gate adds a generation-side scan at voice_preflight (standalone + series)
// that runs on the story script BEFORE generate_voices and rejects/flags digit
// numerals before any ElevenLabs call (Rule 2 BLOCKING; Class B story defect).
//
// Spec test checklist:
//   - "4.6" / "13.8" / "2,000" / "3 million" flagged with correct segment
//   - "four point six" passes
//   - header block ignored (TITLE/DESCRIPTION/SUNO PROMPT)
//   - series path flags per-episode
//   - hint string present in payload

import {
  numeralPreTtsScan,
  scanTextForDigitNumerals,
  buildNumeralPreflightFailure,
  NUMERAL_PRETTS_HINT,
} from '@/lib/numeralPreTtsScan'

import * as fs from 'fs'
import * as path from 'path'

function buildScript(bodyLines: string[], headerLines: string[] = []): string {
  return [
    'TITLE: Gate 5 Fixture',
    'DESCRIPTION: A short present-tense description for the card.',
    ...headerLines,
    '[START AUDIO DRAMA SCRIPT]',
    ...bodyLines,
  ].join('\n')
}

describe('GATE 5 — numeral pre-TTS scan (spec §5)', () => {
  // ── Core pattern: digit numerals flagged, spelled-out numerals pass ────────
  test('flags "4.6" (decimal) with the correct segment', () => {
    const script = buildScript(['NARRATOR: The rating was 4.6 out of five.'])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0].offendingText).toBe('4.6')
    expect(r.failures[0].segmentLabel).toBe('segment_0000')
    expect(r.failures[0].speaker).toBe('NARRATOR')
  })

  test('flags "13.8" / "13.8 billion" with scale-word adjacency folded in', () => {
    expect(scanTextForDigitNumerals('We lost 13.8 billion in the crash.')).toEqual(['13.8 billion'])
    const script = buildScript(['ALICE: We lost 13.8 billion in the crash.'])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures[0].offendingText).toBe('13.8 billion')
    expect(r.failures[0].speaker).toBe('ALICE')
  })

  test('flags "2,000" (grouped thousands)', () => {
    const script = buildScript(['BOB: There were 2,000 people there that night.'])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures[0].offendingText).toBe('2,000')
  })

  test('flags "3 million" (digit + scale word)', () => {
    const script = buildScript(['CARA: It cost 3 million dollars in the end.'])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures[0].offendingText).toBe('3 million')
  })

  test('"four point six" (spelled out) passes', () => {
    expect(scanTextForDigitNumerals('four point six was enough')).toEqual([])
    const script = buildScript([
      'NARRATOR: She said four point six was enough.',
      'ALICE: Thirteen point eight billion vanished overnight.',
    ])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(true)
    expect(r.failures).toEqual([])
  })

  // ── Years are NOT excluded (spec §5) ───────────────────────────────────────
  test('years ("2026") are flagged — not excluded in v1', () => {
    const script = buildScript(['NARRATOR: It all began back in 2026, they say.'])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures[0].offendingText).toBe('2026')
  })

  // ── Header / SUNO block ignored ────────────────────────────────────────────
  test('header block ignored: TITLE / DESCRIPTION / SUNO PROMPT digits do not flag', () => {
    const script = buildScript(
      ['NARRATOR: A clean body line with no digits at all here.'],
      ['SUNO PROMPT: cinematic 120 bpm orchestral swell', 'EPISODE: 7']
    )
    // DESCRIPTION in buildScript header has no digits; add one to prove exclusion:
    const withDigitHeader = script.replace(
      'DESCRIPTION: A short present-tense description for the card.',
      'DESCRIPTION: A tale across 7 chapters and 3 continents.'
    )
    const r = numeralPreTtsScan(withDigitHeader)
    expect(r.passed).toBe(true)
    expect(r.failures).toEqual([])
  })

  // ── Segment-granular: multiple offending lines reported separately ─────────
  test('reports per voice line with correct segment indices', () => {
    const script = buildScript([
      'NARRATOR: The rating was 4.6 out of five.',
      'ALICE: We lost 13.8 billion in the crash.',
      'BOB: There were 2,000 people there that night.',
      'CARA: It cost 3 million dollars in the end.',
    ])
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures.map((f) => f.segmentLabel)).toEqual([
      'segment_0000',
      'segment_0001',
      'segment_0002',
      'segment_0003',
    ])
    expect(r.failures.map((f) => f.offendingText)).toEqual([
      '4.6',
      '13.8 billion',
      '2,000',
      '3 million',
    ])
  })

  // ── Payload shape + hint string present ────────────────────────────────────
  test('voice_preflight FAIL payload has stage/kind/failures and the hint string', () => {
    const script = buildScript(['NARRATOR: The rating was 4.6 out of five.'])
    const r = numeralPreTtsScan(script)
    const payload = buildNumeralPreflightFailure(r.failures)
    expect(payload.success).toBe(false)
    expect(payload.stage).toBe('voice_preflight')
    expect(payload.kind).toBe('numeral_pre_tts')
    expect(Array.isArray(payload.failures)).toBe(true)
    expect(payload.failures.length).toBeGreaterThan(0)
    expect(payload.hint).toBe(NUMERAL_PRETTS_HINT)
    expect(payload.hint).toContain('four point six')
    // blockingReasons feed the handler's existing classifier/log path
    expect(payload.blockingReasons[0]).toContain('4.6')
  })

  // ── Wiring guards: R calls the scan at BOTH preflight sites before TTS ──────
  test('R wires the scan into standalone + series preflight before the ElevenLabs call', () => {
    const routeSrc = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'),
      'utf8'
    )
    // single import site
    expect(routeSrc).toContain(
      "import { numeralPreTtsScan, buildNumeralPreflightFailure } from '@/lib/numeralPreTtsScan'"
    )
    // standalone: scan on the narrator-fetched script before the preflight request
    const standaloneScanIdx = routeSrc.indexOf('numeralPreTtsScan(storyForNarrator.script')
    expect(standaloneScanIdx).toBeGreaterThan(-1)
    const standaloneReqIdx = routeSrc.indexOf(
      'runGenerateVoicesPreflightRequest(origin, String(storyId))',
      standaloneScanIdx
    )
    expect(standaloneReqIdx).toBeGreaterThan(standaloneScanIdx)

    // series: scan per episode script before the per-episode preflight request
    const seriesScanIdx = routeSrc.indexOf('numeralPreTtsScan((nextEpisode as any).script')
    expect(seriesScanIdx).toBeGreaterThan(-1)
    const seriesReqIdx = routeSrc.indexOf(
      'runGenerateVoicesPreflightRequest(origin, storyId)',
      seriesScanIdx
    )
    expect(seriesReqIdx).toBeGreaterThan(seriesScanIdx)

    // handler routes numeral failures to the autonomous-retry generate_script path
    expect(routeSrc).toContain("(result.report as any)?.kind === 'numeral_pre_tts'")
    expect(routeSrc).toMatch(/isNumeralPreTts[\s\S]{0,120}markStoryNeedsAttention/)
  })
})
