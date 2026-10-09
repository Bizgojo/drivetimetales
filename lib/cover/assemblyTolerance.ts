/**
 * COVER-PIPELINE-DECOUPLE-001 — Alderton assembly tolerance (Task 6)
 *
 * Missing cover = warning + "cover_missing" flag, NOT a blocking error.
 * Episodes assemble with covers pending; covers are addable later
 * (see coverPostPublish.ts).
 *
 * This module holds the PURE tolerance helpers so both the standalone and
 * series assembly paths share one rule and the regression tests can prove
 * it without a database:
 *   - partitionAssemblyBlockers(): split a missing-fields list into hard
 *     blockers vs the (non-blocking) cover warning.
 *   - isCoverMissingOnly(): true when cover_url is the SOLE reason assembly
 *     would have failed — the exact Alderton Inheritance EP2/EP3 shape.
 *
 * Callers (run-next verifySeriesPackageEpisode / verifyStandaloneReadyForReview,
 * complete-story-package) keep every other missing field blocking; only
 * cover_url is demoted to a warning flag.
 */

export const COVER_MISSING_FLAG = 'cover_missing'

/** Fields that demote to cover_missing warnings instead of blocking assembly. */
const COVER_TOLERATED_FIELDS = new Set(['cover_url'])

export interface PartitionedBlockers {
  /** Hard blockers — assembly still fails when non-empty. */
  blocking: string[]
  /** Cover warnings — recorded as cover_missing flags, never block. */
  coverWarnings: string[]
  /** True when at least one cover asset is pending. */
  coverMissing: boolean
}

/** Split missing fields into hard blockers vs non-blocking cover warnings. */
export function partitionAssemblyBlockers(missingFields: string[]): PartitionedBlockers {
  const fields = Array.isArray(missingFields) ? missingFields : []
  const blocking = fields.filter((f) => !COVER_TOLERATED_FIELDS.has(String(f)))
  const coverWarnings = fields.filter((f) => COVER_TOLERATED_FIELDS.has(String(f)))
  return { blocking, coverWarnings, coverMissing: coverWarnings.length > 0 }
}

/**
 * True when cover_url is the ONLY missing field — i.e. assembly would have
 * been blocked solely by a missing cover (Alderton EP2/EP3 shape).
 */
export function isCoverMissingOnly(missingFields: string[]): boolean {
  const { blocking, coverMissing } = partitionAssemblyBlockers(missingFields)
  return coverMissing && blocking.length === 0
}
