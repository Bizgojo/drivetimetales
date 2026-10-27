/**
 * EMPTY-TRANSCRIPT-RETRY-001 — true when a segment failed because EVERY
 * candidate's transcript came back empty (REPEATED_IDENTICAL_TRUNCATION with
 * detected ""). That is not a script problem (the line is never seen at all),
 * so one fresh regeneration is worth trying before stopping the job.
 */
export function isEmptyTranscriptFailure(error: string): boolean {
  return /\[REPEATED_IDENTICAL_TRUNCATION\]: Whisper returned the same partial output ""/.test(String(error || ''))
}

/**
 * DURATION-GATE-CONFIRM-001 — a duration-gate rejection is overridden only
 * when the transcript proves the WHOLE line is in the audio: QC passed,
 * Whisper really ran (not skipped), coverage and similarity both >= 0.9.
 * A genuinely cut-off read cannot meet this.
 */
export function durationGateTranscriptConfirms(check: {
  passed?: boolean
  qcSkipped?: boolean
  coverage?: number
  similarity?: number
} | null | undefined): boolean {
  if (!check || !check.passed || check.qcSkipped) return false
  return Number(check.coverage ?? 0) >= 0.9 && Number(check.similarity ?? 0) >= 0.9
}
