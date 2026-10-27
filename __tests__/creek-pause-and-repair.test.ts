/**
 * CREEK-PAUSE-AND-REPAIR (Marc commission 2026-10-26)
 *
 * (A) truncation 3-part fix — exercises the pure predicates the fix relies on:
 *   (i)   duration-plausibility gate rejects cut-off buffers before paid extras
 *   (ii)  split-rescue chunk acceptance needs transcript-pass + duration-plausible
 *   (iii) loudnorm failure must surface (covered by code inspection: the catch
 *         in normalizeSpokenBuffer throws fail_invalid_loudness — no silent raw)
 * (B) per-episode spend ledger:
 *   cap math, ESTIMATED cost math, UNKNOWN-never-zero rule.
 *
 * DB-touching ledger IO (recordLedgerSpend / getEpisodeSpend) is NOT exercised
 * here: no paid operations, no production writes. The module fails open when
 * the ledger table is absent, and the pure enforcement math below is what the
 * run-next gate calls.
 */

import {
  ROUTINE_PRODUCTION_CAP_USD,
  ESTIMATED_COSTS,
  capAllowsSpend,
  estimateElevenLabsCostUsd,
  estimateWhisperCostUsd,
} from '@/app/lib/spend-ledger'
import {
  isAudioTooShortForText,
  minPlausibleSpeechSeconds,
  spokenWordCount,
} from '@/lib/speechDuration'

describe('spend ledger — routine-production cap', () => {
  test('cap is USD 10 per episode', () => {
    expect(ROUTINE_PRODUCTION_CAP_USD).toBe(10)
  })

  test('spend below cap is allowed; at/above cap is blocked', () => {
    expect(capAllowsSpend(0)).toBe(true)
    expect(capAllowsSpend(9.99)).toBe(true)
    expect(capAllowsSpend(10)).toBe(false)
    expect(capAllowsSpend(10.01)).toBe(false)
    expect(capAllowsSpend(250)).toBe(false)
  })
})

describe('spend ledger — ESTIMATED cost math (clearly labeled estimates)', () => {
  test('ElevenLabs mirrors the el-logger USD 0.30/1k-chars basis', () => {
    expect(ESTIMATED_COSTS.elevenlabsPerCharUsd).toBeCloseTo(0.0003, 6)
    expect(estimateElevenLabsCostUsd(1000)).toBeCloseTo(0.3, 4)
    // a typical ~120-char segment line costs a fraction of a cent
    const line = 'But here is what makes RNA remarkable. The sequence of letters determines how the molecule folds.'
    expect(estimateElevenLabsCostUsd(line.length)).toBeGreaterThan(0)
    expect(estimateElevenLabsCostUsd(line.length)).toBeLessThan(0.1)
  })

  test('ElevenLabs estimate is zero only for empty input', () => {
    expect(estimateElevenLabsCostUsd(0)).toBe(0)
    expect(estimateElevenLabsCostUsd(-5)).toBe(0)
    expect(estimateElevenLabsCostUsd(NaN)).toBe(0)
  })

  test('Whisper prorates USD 0.006/min by audio seconds', () => {
    expect(ESTIMATED_COSTS.whisperPerSecondUsd).toBeCloseTo(0.0001, 6)
    expect(estimateWhisperCostUsd(60)).toBeCloseTo(0.006, 4)
    expect(estimateWhisperCostUsd(6)).toBeCloseTo(0.0006, 4)
  })

  test('Whisper unknown duration falls back to a nonzero estimate — NEVER zero', () => {
    expect(estimateWhisperCostUsd(0)).toBeGreaterThan(0)
    expect(estimateWhisperCostUsd(-1)).toBeGreaterThan(0)
    expect(estimateWhisperCostUsd(NaN)).toBeGreaterThan(0)
  })
})

describe('duration gate (A)(i) — cut-off buffers rejected before paid extras', () => {
  const LONG_LINE =
    'But here is what makes RNA remarkable. The sequence of letters determines how the molecule folds. ' +
    'Nucleotides pair with each other, and the folded shape decides what the molecule can do.'

  test('2s of audio for a ~30-word line trips the gate', () => {
    expect(spokenWordCount(LONG_LINE)).toBeGreaterThanOrEqual(25)
    expect(isAudioTooShortForText(2.0, LONG_LINE)).toBe(true)
  })

  test('short lines keep the old rescue behaviour (no gate below 8 words)', () => {
    expect(isAudioTooShortForText(0.5, 'Yes, of course.')).toBe(false)
  })
})

describe('split-rescue chunk acceptance (A)(ii) — transcript-pass + duration-plausible', () => {
  const CHUNK = 'But here is what makes RNA remarkable in every living cell.'

  test('a full-length chunk read is duration-plausible (accepted regardless of LUFS floor)', () => {
    const words = spokenWordCount(CHUNK)
    const normalPaceSeconds = words / 2.6
    expect(normalPaceSeconds).toBeGreaterThan(minPlausibleSpeechSeconds(CHUNK))
    expect(isAudioTooShortForText(normalPaceSeconds, CHUNK)).toBe(false)
  })

  test('a cut-off chunk is duration-implausible (rejected even on transcript pass)', () => {
    expect(isAudioTooShortForText(0.8, CHUNK)).toBe(true)
  })
})
