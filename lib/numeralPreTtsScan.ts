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
 *   - Exclusions: HEADER_KEYS block, SUNO PROMPT, years are NOT excluded
 *     (TTS reads "2026" badly too — spell out)
 *   - Segment-granular: reuses parseScriptPositions; reports per parsed voice line
 *
 * v2 reserved: allowlist (unused in v1; e.g. legit model numbers).
 */

import { parseScriptPositions, type ScriptPosition } from '@/lib/scriptLineIndex'

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
}

// Any digit-form numeral including decimals and grouped thousands.
//   "4.6"  "13.8"  "2,000"  "2026"  "100"
// \b anchors avoid matching digits glued inside identifiers/words.
const DIGIT_NUMERAL_RE = /\b\d[\d,]*(?:\.\d+)?\b/g

// Scale words / symbols that, when adjacent (within 2 tokens) after a digit hit,
// are folded into the offending span so the hint is actionable.
const SCALE_WORD_RE = /^(million|billion|thousand|hundred|dozen|percent)$/i
const SCALE_SYMBOL_RE = /[°%]/

/**
 * Pure numeral scan over a single spoken text fragment.
 * Returns the list of offending spans (digit numeral + any adjacent scale token).
 * Exported for unit testing of the core pattern.
 */
export function scanTextForDigitNumerals(text: string): string[] {
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
  _options: NumeralScanOptions = {}
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
    const spans = scanTextForDigitNumerals(text)
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
