/**
 * RERECORD-RUNNER-001 — pure helpers for scripts/rerecord-episodes.ts
 * (kept separate so they are unit-tested).
 */

/** File-name prefixes moved to backup before a full re-record. */
export const BACKUP_PREFIXES = ['segment_', 'intro_', 'outro_', 'announcement_'] as const
/** Legacy un-numbered Belle files generate-voices also treats as "existing". */
export const BACKUP_EXACT = ['intro.mp3', 'outro.mp3', 'announcement.mp3'] as const

/** From a folder listing (file names only), what to move and what to delete. */
export function filesToBackUp(fileNames: string[]): { backup: string[]; qcskips: string[] } {
  const qcskips = fileNames.filter((n) => n.endsWith('.qcskip.json'))
  const backup = fileNames.filter(
    (n) =>
      !n.endsWith('.qcskip.json') &&
      n.endsWith('.mp3') &&
      (BACKUP_PREFIXES.some((p) => n.startsWith(p)) || (BACKUP_EXACT as readonly string[]).includes(n)),
  )
  return { backup, qcskips }
}

/** segment_NNNN.mp3 names for the given 0-based indices. */
export function expectedSegmentNames(indices: number[]): string[] {
  return indices.map((i) => `segment_${String(i).padStart(4, '0')}.mp3`)
}

/** garble-detection-gate.js prints "JSON report: /tmp/garble-gate-….json". */
export function parseGarbleReportPath(output: string): string | null {
  const m = String(output || '').match(/JSON report:\s*(\S+\.json)/)
  return m ? m[1] : null
}

type GarbleRow = { segIndex?: number; segName?: string; status?: string; wer?: number | null }

/** Segment numbers whose garble status is "fail" (only these get a touch-up). */
export function failedSegmentNumbers(report: { results?: GarbleRow[] } | null | undefined): number[] {
  const rows = report?.results || []
  return rows
    .filter((r) => r.status === 'fail')
    .map((r) => {
      if (typeof r.segIndex === 'number') return r.segIndex
      const m = String(r.segName || '').match(/segment_(\d{4})/)
      return m ? Number(m[1]) : NaN
    })
    .filter((n) => Number.isInteger(n) && n >= 0)
}

export function summarizeGarble(report: { results?: GarbleRow[] } | null | undefined) {
  const rows = report?.results || []
  const count = (s: string) => rows.filter((r) => r.status === s).length
  return {
    ok: count('ok'),
    warn: count('warn'),
    fail: count('fail'),
    missing: count('missing'),
    /** warn rows with no WER = local Whisper crashed, the segment was never checked */
    unscored: rows.filter((r) => r.status === 'warn' && (r.wer === null || r.wer === undefined)).length,
    failRows: rows
      .filter((r) => r.status === 'fail')
      .map((r) => ({ segName: r.segName || `segment_${String(r.segIndex).padStart(4, '0')}`, wer: r.wer ?? null })),
  }
}

/** Why a garble report cannot be trusted as "checked", or null when it can. */
export function garbleReportProblem(report: { results?: GarbleRow[] } | null | undefined): string | null {
  const s = summarizeGarble(report)
  if (s.unscored > 0) return `local Whisper failed on ${s.unscored} segment(s) — audio not checked`
  if (s.missing > 0) return `${s.missing} segment file(s) missing at garble check`
  if (s.ok + s.warn + s.fail === 0) return 'garble check scored no segments'
  return null
}
