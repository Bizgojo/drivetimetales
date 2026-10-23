/**
 * SCRIPT-RUNTIME-PREFLIGHT-001 (Marc order 2026-10-22 23:34 EDT)
 *
 * Pre-spend runtime gate: estimate finished-episode minutes from script
 * spoken-word counts BEFORE any ElevenLabs voice generation spend, and
 * bounce short scripts back for development. The existing final measured
 * gate (RUNTIME-GATE-001, ±10% vs brief on the rendered mix) stays intact
 * and unchanged — division of labor:
 *   - THIS gate: cheap pre-spend floor (is the script long enough to EVER
 *     reach the 15-min product minimum?). Catches short scripts before
 *     narration money is spent.
 *   - RUNTIME-GATE-001: precise post-render check vs the briefed runtime
 *     (e.g. a 20-min brief delivering 16 min still fails there).
 *
 * Method: spoken words are counted with the pipeline's own canonical
 * segment parser (parseScriptPositions, ATL-PARSER-001 — the same function
 * generate-voices and render-final-mix use), so the estimate counts
 * exactly the lines that become audio. Finished minutes = spoken words /
 * calibrated rate. Silence/SFX/music-bed overhead is absorbed end-to-end
 * by the calibration (script → final mix), not modeled separately.
 *
 * CALIBRATION (measured final_mix.mp3 durations via ffprobe vs spoken
 * words via parseScriptPositions on the shipped scripts, 2026-10-22):
 *
 *   Harbor Light Ep1 "The Wrong Tide"   2273 words / 830.6s → 164.2 wpm
 *   Harbor Light Ep2 "The Logbook"      1991 words / 767.2s → 155.7 wpm
 *   Harbor Light Ep3 "The Lighting"     1924 words / 723.2s → 159.6 wpm
 *   Creek Ep1 "The Satchel"             1754 words / 619.6s → 169.9 wpm
 *   Creek Ep2 "The Parcel Line"         1822 words / 699.8s → 156.2 wpm
 *   Creek Ep3 "What the Creek Knew"     1778 words / 635.2s → 168.0 wpm
 *
 *   Range 155.7–169.9 wpm, mean ≈162.3. CALIBRATED_WPM=160 is rounded
 *   DOWN from the mean (lenient direction: lower rate → higher minute
 *   estimate → fewer false bounces of good scripts).
 *
 *   Gate bar: 15-min product minimum + 0.5-min margin = 15.5 min →
 *   2480 spoken words at 160 wpm. Every one of the six calibration
 *   episodes (all shipped short of 15 min) falls below the bar — i.e.
 *   this gate would have bounced each of them pre-spend.
 *
 * Unmeasurable input (zero parseable spoken words) does NOT block: the
 * caller records a persistent skipped marker and continues. Rationale:
 * an empty script spends ~nothing downstream (no lines → no ElevenLabs
 * calls) and existing gates own that case; blocking on a parser miss
 * could strand good work. Mirrors RUNTIME-GATE-001's unmeasured-skip
 * pattern.
 */

import { parseScriptPositions } from '@/lib/scriptLineIndex'
import { spokenWordCount } from '@/lib/speechDuration'

export const SCRIPT_RUNTIME_PREFLIGHT_ID = 'SCRIPT-RUNTIME-PREFLIGHT-001'

/** Single constants block — all thresholds live here. */
export const SCRIPT_RUNTIME_PREFLIGHT = {
  /** Calibrated narration rate, words/min (Harbor Light + Creek, n=6). */
  CALIBRATED_WPM: 160,
  /** 15-min product minimum + 0.5-min margin. */
  MIN_ESTIMATED_MINUTES: 15.5,
  /** Derived spoken-word floor: 15.5 × 160 = 2480. */
  MIN_SPOKEN_WORDS: 2480,
  /** error_json.kind for a short script bounced pre-spend. */
  SHORT_KIND: 'script_runtime_short',
} as const

export interface ScriptRuntimeEstimate {
  /** Spoken words across all kind='voice' positions (incl. Belle announcer lines, which ship in the mix). */
  spokenWords: number
  voiceSegments: number
  estimatedSecs: number
  estimatedMins: number
}

/** Pure estimate: script text → finished-episode minutes. */
export function estimateScriptRuntime(script: string | null | undefined): ScriptRuntimeEstimate {
  const positions = parseScriptPositions(String(script ?? ''))
  const voice = positions.filter((p) => p.kind === 'voice')
  const spokenWords = voice.reduce((n, p) => n + spokenWordCount(p.text), 0)
  const estimatedMins = spokenWords / SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM
  return {
    spokenWords,
    voiceSegments: voice.length,
    estimatedSecs: estimatedMins * 60,
    estimatedMins,
  }
}

export interface ScriptRuntimeCheck extends ScriptRuntimeEstimate {
  pass: boolean
  skipped: boolean
  skipReason?: string
}

/**
 * Pure floor check. pass=false ONLY when a parseable script estimates
 * below MIN_ESTIMATED_MINUTES. Zero spoken words → skipped (not a pass,
 * not a block — the caller records the persistent marker and continues).
 */
export function checkScriptRuntimeMeetsMinimum(
  script: string | null | undefined,
  minMinutes: number = SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES,
): ScriptRuntimeCheck {
  const estimate = estimateScriptRuntime(script)
  if (estimate.spokenWords <= 0) {
    return {
      ...estimate,
      pass: false,
      skipped: true,
      skipReason:
        'no parseable spoken lines (script empty or no SPEAKER: lines) — runtime unmeasurable, deferred to downstream gates',
    }
  }
  return {
    ...estimate,
    pass: estimate.estimatedMins >= minMinutes,
    skipped: false,
  }
}

/** Human-readable blocker for preflight reports and Marc-facing errors. */
export function formatScriptRuntimeShortMessage(check: ScriptRuntimeCheck): string {
  return (
    `Script estimates ${check.estimatedMins.toFixed(1)} min finished audio ` +
    `(${check.spokenWords} spoken words across ${check.voiceSegments} voice segments at ` +
    `${SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM} wpm calibrated) — below the ` +
    `${SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES}-min pre-spend floor ` +
    `(15-min minimum + margin; need ≥${SCRIPT_RUNTIME_PREFLIGHT.MIN_SPOKEN_WORDS} spoken words). ` +
    `Extend the script before narration spend.`
  )
}
