/**
 * DESC-WORDCOUNT-TRUTH-001 (job 9a961907, 2026-10-28): the LLM series validator
 * failed "The Pension Floor" because its DESCRIPTION was "26 words" against the
 * 24-word limit. It was 24 words. Two description auto-repairs were spent, then
 * the series stopped. Word count is arithmetic, not judgment: when the
 * validator's ONLY failure is the description word count and the real count is
 * within the old limit, the episode passes.
 *
 * DESC-100-CHAR-001 (Marc 2026-11-05): the description rule is now 100 characters
 * (lib/validateCardCopy.ts). DESCRIPTION_MAX_WORDS is retired. This truth-check
 * remains for jobs that may have recorded word-count failures against the old rule;
 * onlyDescriptionWordCountFailure() is still callable for those legacy error_json rows.
 */
/** @deprecated Use DESCRIPTION_MAX_CHARS from lib/validateCardCopy.ts instead (100 chars). */
export const DESCRIPTION_MAX_WORDS = 24 // legacy; no longer enforced by the pipeline

export function countDescriptionWords(description: string): number {
  return String(description || '').trim().split(/\s+/).filter(Boolean).length
}

const WORD_COUNT_LINE = /\bwords?\b/i
const WORD_LIMIT_HINT = /\b24\b|limit|exceed|too long|or fewer|word count/i
const OTHER_RULE = /present tense|past[- ]tense|blocked word|characters|spoiler|reveal|protagonist|role|hook|title|sfx|belle|cliffhanger|numeral/i

/** True when every validator failure line is only about the description's word count. */
/** Quoted text (the description itself, the quoted rule) is not the validator's verdict. */
function withoutQuotes(line: string): string {
  return line.replace(/\*?"[^"]*"\*?/g, ' ').replace(/\*?“[^”]*”\*?/g, ' ')
}

export function onlyDescriptionWordCountFailure(failureLines: string[]): boolean {
  if (!failureLines.length) return false
  return failureLines.every((raw) => {
    const line = withoutQuotes(raw)
    return /description/i.test(line) && WORD_COUNT_LINE.test(line) && WORD_LIMIT_HINT.test(line) && !OTHER_RULE.test(line)
  })
}

export function descriptionWordCountMiscount(failureLines: string[], description: string): { override: boolean; actual: number } {
  const actual = countDescriptionWords(description)
  return { override: actual > 0 && actual <= DESCRIPTION_MAX_WORDS && onlyDescriptionWordCountFailure(failureLines), actual }
}
