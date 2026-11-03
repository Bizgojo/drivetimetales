/**
 * AUTHOR-WRITTEN-EXEMPT-001 (Marc commission 2026-11-03, decision
 * author-written-exempt-20261103; Sunset series e9f3ff76-9401-4bf5-bf5a-36d83b5398f7 only).
 *
 * Series-level flag: when `series.author_written` is true, the pipeline
 * treats episode scripts + Belle copy as author-written and skips every
 * gate that would rewrite, repair, or bounce that copy on quality grounds:
 *
 *   SKIPPED when ON (series path)
 *   - series pre-spend runtime floor (SCRIPT-RUNTIME-PREFLIGHT-001, 12.5-min)
 *   - pre-voice Belle content gate (hook, Belle text incl. outro
 *     residue/companion via seriesEpisodeBelleContentIssues)
 *   - intro/outro position validation at series package completion
 *   - any auto repair / regeneration of script or Belle copy
 *     (series Belle auto-retry loop fails closed for Marc instead)
 *
 *   SKIPPED when ON (standalone path — commission
 *   author-written-standalone-20261103; Sunset episodes run standalone jobs
 *   with job_type single even though their stories carry series_id)
 *   - standalone pre-spend runtime floor (runStandaloneVoicePreflight)
 *   - standalone pre-voice Belle content gate (runStandaloneVoicePreflight)
 *   - standalone Belle quality check (validateStandaloneBelleQuality,
 *     deterministic + LLM judge)
 *   - standalone Belle AI repair NEVER runs (repairStandaloneBelleQuality
 *     fails closed for Marc instead — no rewrite, no save)
 *
 *   KEPT when ON (unchanged)
 *   - numeral pre-TTS scan, narrator / locked-roster voice validation
 *   - transcript QC, loudness, measured duration gate (RUNTIME-GATE-001),
 *     publish guard, artifact gate
 *
 * Flag defaults false (today's behavior). Set true on Sunset only via the
 * accompanying migration. Flag lookup for standalone jobs reads the
 * story's series_id (story_type series_episode).
 */

export const AUTHOR_WRITTEN_EXEMPT_ID = 'AUTHOR-WRITTEN-EXEMPT-001'

/** Series row carrying the exemption flag (Sunset only). */
export const AUTHOR_WRITTEN_SUNSET_SERIES_ID =
  'e9f3ff76-9401-4bf5-bf5a-36d83b5398f7'

/** Gates bypassed while the flag is on (observability + tests). */
export const AUTHOR_WRITTEN_SKIPPED_GATES = [
  'series_runtime_floor',
  'series_prevoice_belle_content',
  'series_belle_position_validation',
  'series_belle_auto_repair',
  'standalone_runtime_floor',
  'standalone_prevoice_belle_content',
  'standalone_belle_quality',
  'standalone_belle_auto_repair',
] as const

/** Gates that stay enforced while the flag is on (observability + tests). */
export const AUTHOR_WRITTEN_KEPT_GATES = [
  'numeral_pre_tts_scan',
  'narrator_roster_voices',
  'transcript_qc',
  'loudness',
  'runtime_gate_measured',
  'publish_guard',
  'artifact_gate',
] as const

export type AuthorWrittenSeriesRow = {
  author_written?: unknown
} | null | undefined

/** True only when the series row explicitly opts into author-written mode. */
export function isAuthorWrittenSeries(
  series: AuthorWrittenSeriesRow,
): boolean {
  return (series as { author_written?: unknown } | null | undefined)?.author_written === true
}
