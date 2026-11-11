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

/**
 * RERECORD-RUNNER-002 — classify a failed run-render-final-mix-local.ts as
 * story-specific (this episode's audio/script/assets) vs. account/environment
 * wide (DB, network, disk, a crashed child process). Conservative: an
 * UNRECOGNIZED failure defaults to 'batch' — the batch stops rather than
 * silently skipping something that might be an outage affecting every
 * remaining episode. Recognized markers are the render core's own error text
 * (app/api/asc3/render-final-mix/core.ts) for defects that are provably about
 * THIS story: missing/empty/duplicate segment or asset files, post-render
 * quality checks (silence, Belle outro fade), and upload/storage-shape
 * mismatches for this story's folder.
 */
const STORY_LEVEL_RENDER_MARKERS = [
  'PARSER CONTRACT FAILURE',
  'Post-render validation failed',
  'No audio files found',
  'No story segments found',
  'No announcement audio found',
  'No outro audio found',
  'Split intro incomplete',
  'Missing story segment file',
  'Missing story-specific background_music.mp3',
  'Duplicate story segment numbers found',
  'Segment file is empty',
  'Segment file too small',
  'Segment inventory entry is missing a filename',
  'LOUDNESS-001',
]

/**
 * Systemic causes that CAN appear inside an otherwise story-specific wrapper
 * (e.g. "Failed to prepare story segment X: <network/disk error>") and must
 * never be classified 'episode' even if a story-level marker is also present.
 * Review finding: MISSING_CORRECTED_INTRO/OUTRO and "Failed to prepare..."
 * wrap ANY exception from a download/ffmpeg step, including a network drop,
 * a Supabase 5xx, or a full disk — none of which are this story's fault.
 */
const SYSTEMIC_OVERRIDE_MARKERS = [
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENOSPC',
  'fetch failed', 'socket hang up', 'network', 'timed out', 'timeout',
  /\b5\d\d\b/, // any 5xx status text
]

export function classifyRenderFailure(output: string): 'episode' | 'batch' {
  const text = String(output || '')
  if (SYSTEMIC_OVERRIDE_MARKERS.some((m) => (m instanceof RegExp ? m.test(text) : text.toLowerCase().includes(m.toLowerCase())))) {
    return 'batch'
  }
  return STORY_LEVEL_RENDER_MARKERS.some((m) => text.includes(m)) ? 'episode' : 'batch'
}
