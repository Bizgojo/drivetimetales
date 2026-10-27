/**
 * EMPTY-TRANSCRIPT-RETRY-001 — true when a segment failed because EVERY
 * candidate's transcript came back empty (REPEATED_IDENTICAL_TRUNCATION with
 * detected ""). That is not a script problem (the line is never seen at all),
 * so one fresh regeneration is worth trying before stopping the job.
 */
export function isEmptyTranscriptFailure(error: string): boolean {
  return /\[REPEATED_IDENTICAL_TRUNCATION\]: Whisper returned the same partial output ""/.test(String(error || ''))
}
