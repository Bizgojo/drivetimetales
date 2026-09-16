/**
 * voiceConformanceGate.ts
 *
 * Scans a generated script for banned phrases defined in a voice_profile row.
 * Called by the production pipeline after generate_script, before validate_script.
 *
 * Rules:
 *   - For each item in voiceProfile.banned_list, count case-insensitive whole-phrase
 *     occurrences in the script.
 *   - If any item appears >= 3 times → violation.
 *   - No violations → passed: true.
 *   - Violations + attempts < 2 → shouldRegenerate: true (pipeline resets to generate_script).
 *   - Violations + attempts >= 2 → exhausted: true (pipeline advances with needs_attention=true).
 */

export interface VoiceProfile {
  id: string
  style_slug: string
  display_name: string
  version: number
  essence: string
  diction_and_rhythm: string
  signature_techniques: string[]
  tone_handling: string
  banned_list: string[]
  anchors: string[]
  created_at?: string
  updated_at?: string
}

export interface VoiceConformanceViolation {
  bannedItem: string
  count: number
}

export interface VoiceConformanceResult {
  /** True when no violations were found. */
  passed: boolean
  /** All banned phrases that appear >= 3 times in the script. */
  violations: VoiceConformanceViolation[]
  /** True when violations were found AND attempts < 2. Pipeline should reset to generate_script. */
  shouldRegenerate: boolean
  /** True when attempts >= 2. Pipeline should advance and flag needs_attention. */
  exhausted: boolean
}

/**
 * Count case-insensitive whole-phrase occurrences of `phrase` in `text`.
 *
 * "Whole-phrase" here means the phrase is matched with word-boundary anchors at
 * each end only when the phrase starts/ends with a word character.  This prevents
 * false negatives on phrases that start or end with punctuation (e.g. apostrophes).
 */
function countPhrase(text: string, phrase: string): number {
  if (!phrase) return 0

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Build boundary-aware pattern
  const leftBound = /^\w/.test(phrase) ? '\\b' : ''
  const rightBound = /\w$/.test(phrase) ? '\\b' : ''

  const pattern = new RegExp(`${leftBound}${escaped}${rightBound}`, 'gi')
  return (text.match(pattern) || []).length
}

/**
 * Run the voice conformance gate against a generated script.
 *
 * @param params.script              The full generated script text.
 * @param params.voiceProfile        The loaded voice_profiles row.
 * @param params.storyId             The story being checked (for logging context).
 * @param params.attempts            state_json.voiceConformanceAttempts ?? 0
 */
export async function runVoiceConformanceGate(params: {
  script: string
  voiceProfile: VoiceProfile
  storyId: string
  attempts: number
}): Promise<VoiceConformanceResult> {
  const { script, voiceProfile, storyId, attempts } = params

  const violations: VoiceConformanceViolation[] = []

  for (const bannedItem of voiceProfile.banned_list) {
    const count = countPhrase(script, bannedItem)
    if (count >= 3) {
      violations.push({ bannedItem, count })
    }
  }

  if (violations.length === 0) {
    console.log(
      `[voice-conformance] PASS story=${storyId} ` +
      `profile=${voiceProfile.style_slug} v${voiceProfile.version} ` +
      `attempts=${attempts}`,
    )
    return { passed: true, violations: [], shouldRegenerate: false, exhausted: false }
  }

  const violationSummary = violations
    .map((v) => `"${v.bannedItem}" (×${v.count})`)
    .join(', ')

  if (attempts < 2) {
    console.warn(
      `[voice-conformance] FAIL shouldRegenerate story=${storyId} ` +
      `profile=${voiceProfile.style_slug} v${voiceProfile.version} ` +
      `attempts=${attempts} violations=[${violationSummary}]`,
    )
    return { passed: false, violations, shouldRegenerate: true, exhausted: false }
  }

  console.warn(
    `[voice-conformance] FAIL exhausted story=${storyId} ` +
    `profile=${voiceProfile.style_slug} v${voiceProfile.version} ` +
    `attempts=${attempts} violations=[${violationSummary}]`,
  )
  return { passed: false, violations, shouldRegenerate: false, exhausted: true }
}
