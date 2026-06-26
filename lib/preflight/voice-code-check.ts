/**
 * Preflight: Voice Code Check
 *
 * Validates voice_code assignments before generate_voices runs.
 * A malformed or unresolvable voice_code must block generate_voices
 * with a clear, actionable error — never a vague "voice_id undefined" failure.
 *
 * Integrated into runPreflightChecks() as the voiceCodeCheck step.
 */

import { parseVoiceCode, VOICE_CODE_SCHEMA_VERSION } from '../voice-providers/voice-code'
import { getRegistry } from '../voice-providers/registry'
import { VoiceProviderException } from '../voice-providers/types'
import type { CheckResult } from './validator'

export interface VoiceCodeAssignment {
  /** The character or role name this voice_code is assigned to */
  role: string
  /** The voice_code string to validate */
  voice_code: string
}

export interface VoiceCodeCheckResult {
  passed: boolean
  checked: number
  /** Assignments that passed validation + lookup */
  valid: Array<{
    role: string
    voice_code: string
    voice_id: string | null   // null if only format is validated (no registry hit)
    source: 'registry' | 'format_only'
  }>
  /** Assignments that failed */
  invalid: Array<{
    role: string
    voice_code: string
    failure: 'malformed' | 'not_found' | 'registry_error'
    error_json: object
    message: string
  }>
  blockers: string[]
  details: string[]
  suggestedFixes: string[]
}

/**
 * Check voice_code assignments.
 *
 * @param assignments     List of { role, voice_code } to validate
 * @param useRegistry     Whether to check DB registry (default true).
 *                        Set false in pure format-validation contexts.
 * @param requireResolved If true, any code not found in registry is also a failure.
 *                        Default false — format validity is the hard gate,
 *                        registry miss is a warning (voice will be created).
 */
export async function checkVoiceCodes(
  assignments: VoiceCodeAssignment[],
  options: {
    useRegistry?: boolean
    requireResolved?: boolean
  } = {}
): Promise<VoiceCodeCheckResult> {
  const { useRegistry = true, requireResolved = false } = options

  const result: VoiceCodeCheckResult = {
    passed: true,
    checked: assignments.length,
    valid: [],
    invalid: [],
    blockers: [],
    details: [],
    suggestedFixes: [],
  }

  if (assignments.length === 0) {
    result.details.push('No voice_code assignments to check.')
    return result
  }

  const registry = useRegistry ? getRegistry() : null

  for (const { role, voice_code } of assignments) {
    // 1. Format validation
    const parseResult = parseVoiceCode(voice_code)
    if (!parseResult.valid || !parseResult.parsed) {
      const err = parseResult.error!
      const error_json = {
        provider: 'voice-code-parser',
        endpoint: 'parse_voice_code',
        status_code: null,
        response_body_summary: err.message,
        retry_safe: false,
        original_cause: `${err.code}: received="${err.received}"`,
        schema_version: VOICE_CODE_SCHEMA_VERSION,
        expected_format: err.expected_format,
      }
      result.invalid.push({
        role,
        voice_code,
        failure: 'malformed',
        error_json,
        message: `[${role}] voice_code "${voice_code}" is malformed: ${err.message}`,
      })
      result.blockers.push(
        `MALFORMED voice_code for "${role}": "${voice_code}" — Expected format: ${err.expected_format}`
      )
      result.suggestedFixes.push(
        `Fix voice_code for "${role}": ensure exactly 6 two-character uppercase segments, e.g. NR-MA-35-WM-US-V1`
      )
      result.passed = false
      continue
    }

    // 2. Registry lookup (optional, non-blocking on miss)
    let voiceId: string | null = null
    let source: 'registry' | 'format_only' = 'format_only'

    if (registry) {
      try {
        const hit = await registry.lookup(voice_code)
        if (hit) {
          voiceId = hit.voice_id
          source = 'registry'
        } else if (requireResolved) {
          result.invalid.push({
            role,
            voice_code,
            failure: 'not_found',
            error_json: {
              provider: 'voice-code-registry',
              endpoint: 'registry.lookup',
              status_code: null,
              response_body_summary: `voice_code "${voice_code}" not found in registry`,
              retry_safe: true,
              original_cause: 'registry_miss',
            },
            message: `[${role}] voice_code "${voice_code}" passed format check but has no registry entry.`,
          })
          result.blockers.push(
            `voice_code "${voice_code}" (${role}) not found in registry — run createOrFetchVoice first`
          )
          result.passed = false
          continue
        }
      } catch (err) {
        // Registry read failure is non-fatal for preflight — warn, don't block
        const msg = err instanceof Error ? err.message : String(err)
        result.details.push(
          `⚠️ Registry lookup failed for "${role}" (${voice_code}): ${msg} — continuing with format-only validation`
        )
      }
    }

    result.valid.push({ role, voice_code, voice_id: voiceId, source })
    result.details.push(
      source === 'registry'
        ? `✅ [${role}] ${voice_code} → voice_id=${voiceId} (registry hit)`
        : `✅ [${role}] ${voice_code} format valid (no registry hit — voice will be created on first use)`
    )
  }

  return result
}

/**
 * Convert VoiceCodeCheckResult to a CheckResult for the PreflightReport.
 */
export function toCheckResult(r: VoiceCodeCheckResult): CheckResult {
  return {
    passed: r.passed,
    checkName: 'Voice Code Validation',
    findings: {
      checked: r.checked,
      valid: r.valid.length,
      invalid: r.invalid.length,
      invalid_codes: r.invalid.map((i) => i.voice_code),
    },
    details: [...r.details, ...r.invalid.map((i) => `❌ ${i.message}`)],
    suggestedFixes: r.suggestedFixes,
  }
}
