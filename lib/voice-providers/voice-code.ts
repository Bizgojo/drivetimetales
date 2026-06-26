/**
 * Voice Code — Parser, Validator, Schema
 *
 * voice_code is a structured, provider-agnostic identifier for a voice spec.
 * It is used as a stable key across the registry, preflight, and generate_voices.
 *
 * === Format (v1): AA-BB-CC-DD-EE-FF ===
 *
 * Exactly 6 segments separated by hyphens.
 * Each segment is exactly 2 uppercase alphanumeric characters.
 * Total length: exactly 17 characters.
 *
 * Segment semantics (provisional v1):
 *   [0] ROLE   — NR=Narrator, CH=Character, AN=Announcer, HO=Host
 *   [1] GENDER — MA=Male, FE=Female, NB=Non-binary, UN=Unspecified
 *   [2] AGE    — 2-digit age band (e.g. "35", "28") or YA/MA/SA/EL
 *   [3] TONE   — WM=Warm, GV=Grave, HM=Humorous, DR=Dramatic, DP=Deep, NT=Neutral
 *   [4] ACCENT — US=US English, UK=British, AU=Australian, EN=Generic English
 *   [5] VER    — V1, V2, V3 ... (version slot for re-designs of same role)
 *
 * Examples:
 *   NR-MA-45-WM-US-V1  → Narrator, Male, ~45, Warm, US English, Version 1
 *   CH-FE-28-HM-UK-V2  → Character, Female, ~28, Humorous, British, Version 2
 *   AN-FE-32-WM-US-V1  → Announcer, Female, ~32, Warm, US English, Version 1 (Belle B)
 *
 * Malformed codes MUST fail preflight with structured error_json — they must never
 * reach generate_voices, which would fail vaguely with a missing voice_id.
 */

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------

/** Current schema version for voice_code format */
export const VOICE_CODE_SCHEMA_VERSION = 1

export const VOICE_CODE_SCHEMA_VERSIONS: Record<number, string> = {
  1: 'AA-BB-CC-DD-EE-FF (6 segments, 2 uppercase alphanumeric each)',
}

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/**
 * v1 pattern: exactly 6 groups of exactly 2 uppercase alphanumeric chars,
 * joined by hyphens.
 * Total: 17 characters.
 */
const VOICE_CODE_V1_RE = /^[A-Z0-9]{2}(-[A-Z0-9]{2}){5}$/

// ---------------------------------------------------------------------------
// Parsed form
// ---------------------------------------------------------------------------

export type VoiceCodeRole = 'NR' | 'CH' | 'AN' | 'HO' | (string & {})
export type VoiceCodeGender = 'MA' | 'FE' | 'NB' | 'UN' | (string & {})
export type VoiceCodeTone = 'WM' | 'GV' | 'HM' | 'DR' | 'DP' | 'NT' | (string & {})
export type VoiceCodeAccent = 'US' | 'UK' | 'AU' | 'EN' | (string & {})

export interface ParsedVoiceCode {
  raw: string
  schemaVersion: number
  role: VoiceCodeRole
  gender: VoiceCodeGender
  age: string
  tone: VoiceCodeTone
  accent: VoiceCodeAccent
  version: string
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface VoiceCodeValidationResult {
  valid: boolean
  parsed?: ParsedVoiceCode
  /** Structured error suitable for inclusion in error_json */
  error?: {
    code: 'MALFORMED_VOICE_CODE' | 'EMPTY_VOICE_CODE' | 'UNKNOWN_SCHEMA_VERSION'
    message: string
    received: string
    expected_format: string
    schema_version: number
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate and parse a voice_code string.
 *
 * Returns { valid: true, parsed } on success.
 * Returns { valid: false, error } on any format violation.
 * Never throws.
 */
export function parseVoiceCode(raw: string | null | undefined): VoiceCodeValidationResult {
  const expectedFormat = VOICE_CODE_SCHEMA_VERSIONS[VOICE_CODE_SCHEMA_VERSION]

  if (!raw || raw.trim() === '') {
    return {
      valid: false,
      error: {
        code: 'EMPTY_VOICE_CODE',
        message: 'voice_code is empty or null',
        received: String(raw ?? ''),
        expected_format: expectedFormat,
        schema_version: VOICE_CODE_SCHEMA_VERSION,
      },
    }
  }

  const trimmed = raw.trim()

  if (!VOICE_CODE_V1_RE.test(trimmed)) {
    return {
      valid: false,
      error: {
        code: 'MALFORMED_VOICE_CODE',
        message: `voice_code "${trimmed}" does not match the provisional v1 format (AA-BB-CC-DD-EE-FF). ` +
          `Each segment must be exactly 2 uppercase alphanumeric characters, separated by hyphens.`,
        received: trimmed,
        expected_format: expectedFormat,
        schema_version: VOICE_CODE_SCHEMA_VERSION,
      },
    }
  }

  const [role, gender, age, tone, accent, version] = trimmed.split('-')

  return {
    valid: true,
    parsed: {
      raw: trimmed,
      schemaVersion: VOICE_CODE_SCHEMA_VERSION,
      role: role as VoiceCodeRole,
      gender: gender as VoiceCodeGender,
      age,
      tone: tone as VoiceCodeTone,
      accent: accent as VoiceCodeAccent,
      version,
    },
  }
}

/**
 * Assert a voice_code is valid. Throws VoiceCodeValidationError if not.
 * Use at boundaries where a bad code must stop execution.
 */
export function assertVoiceCode(raw: string | null | undefined): ParsedVoiceCode {
  const result = parseVoiceCode(raw)
  if (!result.valid || !result.parsed) {
    throw new VoiceCodeValidationError(result.error!)
  }
  return result.parsed
}

/**
 * Returns true if the voice_code passes format validation.
 * Convenience wrapper — no error detail.
 */
export function isValidVoiceCode(raw: string | null | undefined): boolean {
  return parseVoiceCode(raw).valid
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class VoiceCodeValidationError extends Error {
  public readonly validationError: NonNullable<VoiceCodeValidationResult['error']>

  constructor(err: NonNullable<VoiceCodeValidationResult['error']>) {
    super(err.message)
    this.name = 'VoiceCodeValidationError'
    this.validationError = err
  }

  /** Returns a structured error_json suitable for VoiceProviderException */
  toErrorJson() {
    return {
      provider: 'voice-code-parser',
      endpoint: 'parse_voice_code',
      status_code: null as null,
      response_body_summary: this.validationError.message,
      retry_safe: false,
      original_cause: `${this.validationError.code}: received="${this.validationError.received}"`,
    }
  }
}
