/**
 * Deterministic story-card copy validation (TITLE + DESCRIPTION).
 *
 * Extracted from app/api/v2/validate-script/route.ts so it can be unit-tested
 * without instantiating the route's Supabase/Anthropic clients.
 *
 * SFX-IN-BODY-001 (Marc Option B, 2026-10-05): [SFX: ...] cues are ALLOWED in the
 * audio-drama script body (the pipeline consumes them into sound-effect segments).
 * The ONLY SFX restriction is the reader-facing DESCRIPTION / story-card copy,
 * enforced deterministically here.
 */

export const TITLE_MAX_CHARS = 28
export const DESCRIPTION_MAX_CHARS = 70
/**
 * DESC-TENSE-001 (Marc 2026-10-29): the rule is "no past-tense sentences",
 * not a list of banned words. Only was/were/had are blocked here because
 * they nearly always mean a past-tense sentence. Words like "hidden",
 * "lost" or "found" are fine as descriptions ("hidden cameras record her");
 * whether a sentence is past tense is judged by the Claude validator
 * (score_validate_package, "DESCRIPTION must be present tense") and fixed
 * by its automatic DESCRIPTION repair.
 */
export const DESCRIPTION_PAST_TENSE_RE = /\b(was|were|had)\b/i
export const DESCRIPTION_SFX_RE = /\[sfx:/i

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export function extractHeader(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

export function validateCardCopy(script: string): string[] {
  const title = extractHeader(script, 'TITLE')
  const description = extractHeader(script, 'DESCRIPTION')
  const issues: string[] = []
  const titleWords = countWords(title)

  if (!title) {
    issues.push('TITLE is required.')
  } else {
    if (titleWords < 1 || titleWords > 5) {
      issues.push(`TITLE must be 1 to 5 words. Current: ${titleWords} words.`)
    }
    if (title.length > TITLE_MAX_CHARS) {
      issues.push(
        `TITLE must be ${TITLE_MAX_CHARS} characters or fewer so it fits one line on story cards. Current: ${title.length} characters.`
      )
    }
  }

  if (!description) {
    issues.push('DESCRIPTION is required.')
  } else {
    if (description.length > DESCRIPTION_MAX_CHARS) {
      issues.push(
        `DESCRIPTION must be ${DESCRIPTION_MAX_CHARS} characters or fewer so it fits two lines on story cards. Current: ${description.length} characters.`
      )
    }
    if (DESCRIPTION_PAST_TENSE_RE.test(description)) {
      issues.push('DESCRIPTION contains forbidden past-tense story-card phrasing.')
    }
    // SFX-IN-BODY-001: SFX cues are allowed in the body but never in the card copy.
    if (DESCRIPTION_SFX_RE.test(description)) {
      issues.push('DESCRIPTION must not contain SFX cues. SFX belongs only in the audio-drama script body.')
    }
  }

  return issues
}
