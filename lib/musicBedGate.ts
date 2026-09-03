/**
 * Music Bed Gate — Phase 4 Item 12 (MUSIC-002)
 *
 * Verifies the assembled episode's music-bed envelope matches MUSIC-002's
 * canonical gain values. Uses dB ratios relative to a Belle-intro reference
 * (where music is provably silent per MUSIC-002) rather than absolute dBFS,
 * so the check is invariant to the underlying Suno track's natural loudness.
 */
import { spawnSync } from 'child_process'

// Same portable ffmpeg binary approach as stingDetectorGate.ts
let FF = 'ffmpeg'
try { FF = (eval('require')('@ffmpeg-installer/ffmpeg') as { path: string }).path } catch { /* system ffmpeg */ }

// ── MUSIC-002 expected dB deltas relative to Belle-intro reference ────────────
// All computed as 20·log10(gain / belleGain) where belleGain=1.5 (BELLE-008).
const EXPECTED_SWELL_DELTA_DB      = 20 * Math.log10(1.30 / 1.50)  // ≈ −1.2 dB
const EXPECTED_DUCK_DELTA_DB       = 20 * Math.log10(0.13 / 1.50)  // ≈ −21.2 dB
const EXPECTED_OUTRO_RISE_DELTA_DB = 20 * Math.log10(0.50 / 1.50)  // ≈ −9.5 dB
const TOLERANCE_DB = 3.0  // ±3 dB per phase — starting point, confirmed/adjusted via known-good test

// Seconds to sample for outro duck/rise point measurements
const SAMPLE_DUR_SEC = 2.0

// ── getMaxVolume — verbatim from lib/stingDetectorGate.ts ─────────────────────
function getMaxVolume(filePath: string, startSec: number, durationSec: number | null): number {
  const args = ['-i', filePath]
  if (startSec > 0) args.push('-ss', String(startSec))
  if (durationSec !== null) args.push('-t', String(durationSec))
  args.push('-af', 'volumedetect', '-f', 'null', '-')
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const out = ((r.stderr ?? Buffer.alloc(0)) as unknown as { toString(): string }).toString()
  const m = out.match(/max_volume:\s*([-\d.]+)/)
  return m ? parseFloat(m[1]) : -999
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface MusicBedGateOutcome {
  passed: boolean
  measurements: {
    belleIntroRefDb: number
    storyStartSwellDb: number
    storyStartDeltaDb: number
    bodyDuckDb: number
    bodyDuckDeltaDb: number
    storyEndSwellDb: number
    storyEndDeltaDb: number
    outroDuckDb: number
    outroDuckDeltaDb: number
    outroRiseDb: number
    outroRiseDeltaDb: number
  }
  failures: string[]
}

export async function runMusicBedGate(
  assembledFilePath: string,
  timing: {
    belleIntroWindow: { startSec: number; durationSec: number }
    storyStartSwellWindow: { startSec: number; durationSec: number }
    bodyDuckWindow: { startSec: number; durationSec: number }
    storyEndSwellWindow: { startSec: number; durationSec: number }
    outroDuckStartSec: number
    outroRiseAtBelleEndSec: number
  }
): Promise<MusicBedGateOutcome> {
  // 1. Belle-intro reference — music provably silent here per MUSIC-002
  const belleIntroRefDb = getMaxVolume(
    assembledFilePath,
    timing.belleIntroWindow.startSec,
    timing.belleIntroWindow.durationSec
  )

  // 2–6. All remaining phases measured as delta from the Belle-intro reference
  const storyStartSwellDb = getMaxVolume(assembledFilePath, timing.storyStartSwellWindow.startSec, timing.storyStartSwellWindow.durationSec)
  const storyStartDeltaDb = storyStartSwellDb - belleIntroRefDb

  const bodyDuckDb = getMaxVolume(assembledFilePath, timing.bodyDuckWindow.startSec, timing.bodyDuckWindow.durationSec)
  const bodyDuckDeltaDb = bodyDuckDb - belleIntroRefDb

  const storyEndSwellDb = getMaxVolume(assembledFilePath, timing.storyEndSwellWindow.startSec, timing.storyEndSwellWindow.durationSec)
  const storyEndDeltaDb = storyEndSwellDb - belleIntroRefDb

  const outroDuckDb = getMaxVolume(assembledFilePath, timing.outroDuckStartSec, SAMPLE_DUR_SEC)
  const outroDuckDeltaDb = outroDuckDb - belleIntroRefDb

  const outroRiseSampleStart = Math.max(0, timing.outroRiseAtBelleEndSec - SAMPLE_DUR_SEC)
  const outroRiseDb = getMaxVolume(assembledFilePath, outroRiseSampleStart, SAMPLE_DUR_SEC)
  const outroRiseDeltaDb = outroRiseDb - belleIntroRefDb

  // ── Phase checks ─────────────────────────────────────────────────────────────
  const failures: string[] = []

  if (Math.abs(storyStartDeltaDb - EXPECTED_SWELL_DELTA_DB) > TOLERANCE_DB) {
    failures.push(
      `story-body-start-swell: delta ${storyStartDeltaDb.toFixed(1)} dB (expected ${EXPECTED_SWELL_DELTA_DB.toFixed(1)} ±${TOLERANCE_DB} dB)`
    )
  }
  if (Math.abs(bodyDuckDeltaDb - EXPECTED_DUCK_DELTA_DB) > TOLERANCE_DB) {
    failures.push(
      `story-body-duck: delta ${bodyDuckDeltaDb.toFixed(1)} dB (expected ${EXPECTED_DUCK_DELTA_DB.toFixed(1)} ±${TOLERANCE_DB} dB)`
    )
  }
  if (Math.abs(storyEndDeltaDb - EXPECTED_SWELL_DELTA_DB) > TOLERANCE_DB) {
    failures.push(
      `story-body-end-swell: delta ${storyEndDeltaDb.toFixed(1)} dB (expected ${EXPECTED_SWELL_DELTA_DB.toFixed(1)} ±${TOLERANCE_DB} dB)`
    )
  }
  if (Math.abs(outroDuckDeltaDb - EXPECTED_DUCK_DELTA_DB) > TOLERANCE_DB) {
    failures.push(
      `outro-duck: delta ${outroDuckDeltaDb.toFixed(1)} dB (expected ${EXPECTED_DUCK_DELTA_DB.toFixed(1)} ±${TOLERANCE_DB} dB)`
    )
  }
  if (Math.abs(outroRiseDeltaDb - EXPECTED_OUTRO_RISE_DELTA_DB) > TOLERANCE_DB) {
    failures.push(
      `outro-rise: delta ${outroRiseDeltaDb.toFixed(1)} dB (expected ${EXPECTED_OUTRO_RISE_DELTA_DB.toFixed(1)} ±${TOLERANCE_DB} dB)`
    )
  }

  return {
    passed: failures.length === 0,
    measurements: {
      belleIntroRefDb,
      storyStartSwellDb,
      storyStartDeltaDb,
      bodyDuckDb,
      bodyDuckDeltaDb,
      storyEndSwellDb,
      storyEndDeltaDb,
      outroDuckDb,
      outroDuckDeltaDb,
      outroRiseDb,
      outroRiseDeltaDb,
    },
    failures,
  }
}
