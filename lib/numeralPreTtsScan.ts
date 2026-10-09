/**
 * GATE 5 — NUMERAL PRE-TTS SCAN
 * Spec: drafts/GATE-GAPS-SPEC-20261004.md §5 (NUMERAL PRE-TTS SCAN)
 *
 * Problem: TTS (ElevenLabs) misreads digit-form numerals ("4.6", "13.8",
 * "2,000"). Normalization exists ONLY comparison-side (lib/transcriptQC.ts,
 * lib/normalizeForWer.ts) — it reconciles Whisper's transcript AFTER the audio
 * is already generated. Nothing blocks digit numerals BEFORE TTS.
 *
 * This is the generation-side gate: a pure, segment-granular scan run at
 * voice_preflight (standalone + series) on the story script BEFORE any
 * ElevenLabs call. Any digit-form numeral in a spoken voice line is a BLOCKING
 * failure (Rule 2) — the story is a Class B story/metadata defect and is sent
 * back to generate_script for Hal to spell the numeral out in words.
 *
 * v1 scope:
 *   - any digit-form numeral incl. decimals and grouped thousands
 *     ("4.6", "13.8", "2,000")
 *   - scale-word / symbol adjacency (million|billion|thousand|hundred|dozen|
 *     percent|°|%) within 2 tokens after a digit hit → included in the span
 *   - Exclusions: HEADER_KEYS block, SUNO PROMPT, version/brand numerals ("2.0"),
 *     and bare 4-digit years ("1776", "1780", "2026") — see YEAR-DIGITS-001.
 *     Years are written as digits and pronounced as years by EL default
 *     normalization ("seventeen seventy-six"), so they PASS. Grouped thousands
 *     ("2,000"), decimals ("4.6"), and clock-time fragments still fail.
 *   - Segment-granular: reuses parseScriptPositions; reports per parsed voice line
 *
 * v2 reserved: allowlist (unused in v1; e.g. legit model numbers).
 */

import { parseScriptPositions, type ScriptPosition } from '@/lib/scriptLineIndex'
import { isEpisodeNumberPassThrough } from '@/lib/unifiedGateEngine'

export interface NumeralFailure {
  /** padded segment label for expected voice segments; announcer lines use their speaker */
  segmentLabel: string
  /** 0-based parser index of the position */
  segmentIndex: number
  speaker: string
  /** the offending span (digit numeral + any adjacent scale word/symbol) */
  offendingText: string
  /** 1-based raw line number in the original script */
  line: number
}

export interface NumeralScanResult {
  passed: boolean
  failures: NumeralFailure[]
}

export interface NumeralScanOptions {
  /** v2 reserved — unused in v1 */
  allowlist?: string[]
  /**
   * ALDERTON-CONTRADICTION-001 (gate-engine) + Marc decision
   * alderton-optionA-oct8-2323 (2026-10-08): narrow episode-number-token
   * pass-through. When set, a bare integer token equal to this episode number
   * occurring in "Episode N" context (the digit the package check requires in
   * the canonical series intro) is TTS-safe and is NOT flagged. All other
   * digit spans still fail. Standalone path leaves this unset (no Episode-N
   * intro exists there), so standalone behavior is unchanged. The package
   * title validator is untouched and still REQUIRES the canonical digit.
   */
  episodeNumberPassThrough?: number
}

// Any digit-form numeral including decimals and grouped thousands.
//   "4.6"  "13.8"  "2,000"  "2026"  "100"
// \b anchors avoid matching digits glued inside identifiers/words.
const DIGIT_NUMERAL_RE = /\b\d[\d,]*(?:\.\d+)?\b/g

// Scale words / symbols that, when adjacent (within 2 tokens) after a digit hit,
// are folded into the offending span so the hint is actionable.
const SCALE_WORD_RE = /^(million|billion|thousand|hundred|dozen|percent)$/i
const SCALE_SYMBOL_RE = /[°%]/

// SEEDLIGHT FIX (numeral_pre_tts false-positive, 2026-10-04):
// Version / brand numerals like "2.0" in a title or series name (e.g. "Origin 2.0")
// are NOT unspoken narration numerals — TTS reads "two point oh" correctly and Hal
// legitimately writes them this way in brand/title lines. The old matcher flagged
// "2.0" as a blocking pre-TTS numeral, which then drove the destructive autonomous
// retry that cleared a PASS-validated script and regenerated a new story
// ("The Seedlight" incident, learning id ce49ed18).
//
// Scope is deliberately tight: only the classic "<major>.0" version shape
// (e.g. "2.0", "3.0", "10.0"). Genuine mispronounced decimals from narration
// ("4.6", "13.8"), grouped thousands ("2,000"), and bare integers/years
// ("42", "2026") are UNAFFECTED and still flagged.
const VERSION_NUMERAL_RE = /^(?:[1-9]\d?)\.0$/

/**
 * True when a standalone digit span looks like a version / brand numeral
 * ("2.0", "3.0", "10.0") rather than an unspoken narration quantity. Only the
 * "<major>.0" shape is whitelisted so we do not accidentally pass real decimals
 * like "4.6" or "13.8" that TTS would mispronounce.
 */
export function isVersionBrandNumeral(span: string): boolean {
  return VERSION_NUMERAL_RE.test(span.trim())
}

// YEAR-DIGITS-001 (Marc standing rule, 2026-10-05): Years are written as DIGITS
// and pronounced as years — "1776" is read "seventeen seventy-six", NOT spelled
// out as "one thousand seven hundred seventy-six". ElevenLabs' default text
// normalization (eleven_multilingual_v2) reads bare 4-digit year tokens in
// year-form, so forcing Hal to spell years out (the old gate behavior) was wrong
// and produced unnatural scripts. A bare 4-digit year token therefore PASSES.
//
// Scope is deliberately tight to avoid swallowing non-year quantities:
//   - exactly 4 digits, no grouping comma, no decimal point
//   - leading digit 1 or 2 (range 1000–2999) — covers all plausible story years
//   - NOT part of a larger span (no scale word/symbol folded in)
// So "2,000" (grouped thousands), "4.6" (decimal), "23"/"48" (clock-time halves,
// which the scanner already sees as separate 2-digit tokens), "42", "300", and
// 5-digit+ numbers all still FAIL and must be spelled out.
const YEAR_NUMERAL_RE = /^[12]\d{3}$/

/**
 * True when a standalone digit span is a bare 4-digit year (1000–2999). Only the
 * plain 4-digit integer shape is whitelisted; grouped thousands ("2,000"),
 * decimals, and clock-time digit fragments are unaffected and still flagged.
 */
export function isYearNumeral(span: string): boolean {
  return YEAR_NUMERAL_RE.test(span.trim())
}

/**
 * Pure numeral scan over a single spoken text fragment.
 * Returns the list of offending spans (digit numeral + any adjacent scale token).
 * Exported for unit testing of the core pattern.
 */
export function scanTextForDigitNumerals(text: string, options: NumeralScanOptions = {}): string[] {
  if (!text) return []
  const spans: string[] = []

  // Tokenize on whitespace so we can test scale-word adjacency (within 2 tokens).
  const tokens = text.split(/\s+/)

  let match: RegExpExecArray | null
  DIGIT_NUMERAL_RE.lastIndex = 0
  while ((match = DIGIT_NUMERAL_RE.exec(text)) !== null) {
    let span = match[0]

    // Scale-word / symbol adjacency: look at up to 2 tokens after the token that
    // contains this digit hit. If a scale word or scale symbol appears, extend
    // the reported span to include it.
    const digit = match[0]
    const hitTokenIdx = tokens.findIndex((t) => t.includes(digit))
    if (hitTokenIdx !== -1) {
      for (let k = 1; k <= 2; k++) {
        const nxt = tokens[hitTokenIdx + k]
        if (!nxt) break
        const cleaned = nxt.replace(/[^\p{L}\p{N}%°]/gu, '')
        if (SCALE_WORD_RE.test(cleaned) || SCALE_SYMBOL_RE.test(nxt)) {
          // include everything from the digit token through this scale token
          span = tokens.slice(hitTokenIdx, hitTokenIdx + k + 1).join(' ')
          break
        }
      }
    }

    // Also fold a trailing '%' or '°' glued directly to the numeral ("50%", "20°").
    const glued = text.slice(match.index + match[0].length).match(/^\s*[°%]/)
    if (glued && !SCALE_SYMBOL_RE.test(span)) {
      span = (span + glued[0]).trim()
    }

    // SEEDLIGHT FIX: skip version/brand numerals ("2.0") only when the span is the
    // bare version token with no scale word/symbol folded in. If a scale word or
    // symbol was attached (e.g. "2.0 million", "2.0%"), it is a real quantity and
    // must still be flagged — so we only short-circuit the untouched "<major>.0" span.
    if (span === match[0] && isVersionBrandNumeral(span)) {
      continue
    }

    // YEAR-DIGITS-001: skip bare 4-digit years ("1780", "1987", "2026") only when
    // the span is the untouched year token with no scale word/symbol folded in.
    // A scale word/symbol adjacency (e.g. "2000 years", "1900s" folded) would make
    // span !== match[0] and still flag. Grouped thousands ("2,000") never match
    // YEAR_NUMERAL_RE because of the comma, so they still fail correctly.
    if (span === match[0] && isYearNumeral(span)) {
      continue
    }

    // ALDERTON-CONTRADICTION-001: skip the episode-number token the package
    // check requires (bare digit in "Episode N" context — TTS reads it correctly).
    if (span === match[0] && isEpisodeNumberPassThrough(span, text, options.episodeNumberPassThrough)) {
      continue
    }

    spans.push(span)
  }

  return spans
}

/**
 * Scan a full story script for digit-form numerals in spoken voice lines.
 *
 * Reuses parseScriptPositions so the scan is segment-granular and shares the
 * canonical header/exclusion logic (HEADER_KEYS, SUNO PROMPT, [SFX], silence,
 * and pre-script lines are never classified as `voice` and so are never scanned).
 * Years are intentionally NOT excluded per spec §5.
 */
export function numeralPreTtsScan(
  script: string,
  options: NumeralScanOptions = {}
): NumeralScanResult {
  const failures: NumeralFailure[] = []
  if (!script) return { passed: true, failures }

  const positions: ScriptPosition[] = parseScriptPositions(script)

  for (const pos of positions) {
    // Only spoken voice lines reach TTS. silence ([BEAT]/[PAUSE]) and sfx cues
    // are not spoken by the voice model; HEADER_KEYS / SUNO PROMPT / pre-script
    // lines are never emitted as `voice` positions by parseScriptPositions.
    if (pos.kind !== 'voice') continue
    const text = pos.text || ''
    const spans = scanTextForDigitNumerals(text, options)
    if (spans.length === 0) continue

    const segmentLabel = pos.isExpected
      ? `segment_${String(pos.index).padStart(4, '0')}`
      : (pos.speaker || 'ANNOUNCER')

    for (const span of spans) {
      failures.push({
        segmentLabel,
        segmentIndex: pos.index,
        speaker: pos.speaker || 'UNKNOWN',
        offendingText: span,
        line: pos.rawLineNumber,
      })
    }
  }

  return { passed: failures.length === 0, failures }
}

/** Spec §5 hint string — shared by both preflight call sites. */
export const NUMERAL_PRETTS_HINT =
  'Spell out numerals in words (4.6 → four point six; 13.8 billion → thirteen point eight billion) and re-submit.'

/**
 * Build the spec §5 voice_preflight FAIL payload for a failed scan.
 * Shape: { success:false, stage:'voice_preflight', kind:'numeral_pre_tts',
 *          failures:[...], hint:'...' }
 */
export function buildNumeralPreflightFailure(failures: NumeralFailure[]) {
  return {
    success: false,
    preflightOnly: true,
    stage: 'voice_preflight' as const,
    kind: 'numeral_pre_tts' as const,
    failures,
    // blockingReasons feeds the handler's existing voice_preflight classifier/log path
    blockingReasons: failures
      .slice(0, 5)
      .map((f) => `Digit numeral "${f.offendingText}" in ${f.segmentLabel} (${f.speaker}, line ${f.line})`),
    hint: NUMERAL_PRETTS_HINT,
  }
}
