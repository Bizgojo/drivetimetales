/**
 * PACKAGE-VALIDATION EVIDENCE — kill the evidence-free preset PASS reuse
 * (PUBLICATION-HOLD-001, commission lake-marion-permanent-hold-1433, Marc 2026-10-23).
 *
 * Ground truth: run-next scoreValidateSeriesPackage reused
 * `existingValidation.packageReport` verbatim whenever `.pass === true`,
 * so a fabricated/preset PASS survived into production with zero earned
 * evidence. Fix: a carried packageReport is accepted ONLY when it carries
 * evidence stamped by THIS job against THESE episode scripts
 * (job id + series id + per-episode script hashes + timestamp). Anything
 * else — including a bare {pass:true} — is re-validated from scratch.
 *
 * Evidence lives on the report as `evidence` (persisted via the audited
 * production_jobs state_json path, same as the report itself). Old states
 * without it simply recompute — safe by default.
 */

import { hashScript } from './continuityPin'

export type PackageEvidence = {
  /** Production job id that earned the verdict. Must equal the consuming job. */
  jobId: string
  /** Series the verdict was earned against. */
  seriesId: string
  /** ISO timestamp the verdict was earned. */
  validatedAt: string
  /** How the verdict was earned: fresh AI run or a Marc-ruled skip. */
  kind: 'series-package-validator' | 'landing-skip'
  /** sha256 (continuityPin hashScript) of every validated episode script, by story id. */
  episodeHashes: Record<string, string>
  /** Human-readable provenance (model, ruling ref). */
  note: string
}

export type PackageReportLike = {
  pass?: unknown
  evidence?: unknown
  [key: string]: unknown
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function episodeId(ep: Record<string, unknown>, index: number): string {
  return clean((ep as { id?: unknown }).id) || `index:${index}`
}

/** Script-hash fingerprint of the episode set a verdict covers. */
export function episodeScriptHashes(episodes: Array<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {}
  ;(episodes || []).forEach((ep, i) => {
    out[episodeId(ep, i)] = hashScript(String((ep as { script?: unknown }).script ?? ''))
  })
  return out
}

/**
 * Stamp earned evidence onto a freshly produced package report. Call at the
 * single point the verdict is earned (fresh AI run or Marc-ruled skip)
 * before persisting it to job state.
 */
export function stampPackageEvidence<T extends PackageReportLike>(
  report: T,
  args: {
    jobId: string
    seriesId: string
    episodes: Array<Record<string, unknown>>
    kind: PackageEvidence['kind']
    note: string
    at?: string
  }
): T & { evidence: PackageEvidence } {
  return {
    ...report,
    evidence: {
      jobId: clean(args.jobId),
      seriesId: clean(args.seriesId),
      validatedAt: args.at || new Date().toISOString(),
      kind: args.kind,
      episodeHashes: episodeScriptHashes(args.episodes),
      note: clean(args.note).slice(0, 500),
    },
  }
}

/**
 * Accept a carried packageReport ONLY with earned evidence: stamped by the
 * SAME job, for the SAME series, covering the CURRENT episode scripts
 * (hash match on every episode id). A bare {pass:true} — preset, seeded, or
 * carried from another job/run — returns false and must be re-validated.
 */
export function hasEarnedPackageEvidence(
  report: PackageReportLike | null | undefined,
  args: {
    jobId: string
    seriesId: string
    episodes: Array<Record<string, unknown>>
  }
): boolean {
  if (!report || typeof report !== 'object') return false
  if (report.pass !== true) return false
  const ev = report.evidence as Partial<PackageEvidence> | null | undefined
  if (!ev || typeof ev !== 'object') return false
  if (clean(ev.jobId) !== clean(args.jobId) || !clean(args.jobId)) return false
  if (clean(ev.seriesId) !== clean(args.seriesId)) return false
  const hashes = (ev as PackageEvidence).episodeHashes
  if (!hashes || typeof hashes !== 'object') return false
  const current = episodeScriptHashes(args.episodes)
  const currentIds = Object.keys(current)
  if (currentIds.length === 0) return false
  for (const id of currentIds) {
    if (!hashes[id] || hashes[id] !== current[id]) return false
  }
  // No extra-hash requirement: a re-run that dropped an episode recomputes
  // anyway via the id-set mismatch above only if ids differ... require exact
  // set equality so added episodes also force re-validation.
  const evIds = Object.keys(hashes)
  if (evIds.length !== currentIds.length) return false
  return true
}
