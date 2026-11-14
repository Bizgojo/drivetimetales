/**
 * SERIES-PROGRESS-STOP-001 (canon decision 152, Marc Nov 13, 2026, option B).
 * A series keeps going through series reads while its fixes work. It stops for Marc's
 * "ship" or "fix N" when:
 *   1. a blocker that an earlier read reported (and that was sent to be fixed) comes back;
 *   2. a blocker quotes a line that a fix just changed (the fix made a new problem);
 *   3. the series reaches MAX_SERIES_READS series reads that found blockers (cost ceiling).
 * New blockers in lines nobody touched count as progress.
 */

export const MAX_SERIES_READS = 6

/** Stored in state_json.seriesContinuity.seriesProgress. */
export type SeriesProgress = {
  /** Blockers already sent to a fix: "<episode>|<normalized quoted line>". */
  fixed: string[]
  /** Lines a fix wrote: "<episode>|<normalized new text>". */
  changed: string[]
}

export type ProgressIssue = { episode: number; problem: string; fix?: string | null }

const MIN_MATCH = 20
const MAX_KEEP = 200

export function emptyProgress(): SeriesProgress {
  return { fixed: [], changed: [] }
}

export function readProgress(value: unknown): SeriesProgress {
  const v = value && typeof value === 'object' ? (value as any) : {}
  return {
    fixed: Array.isArray(v.fixed) ? v.fixed.map(String) : [],
    changed: Array.isArray(v.changed) ? v.changed.map(String) : [],
  }
}

/** Lower case, no speaker label, letters/digits/spaces only. */
export function normalizeLine(text: string): string {
  return String(text || '')
    .replace(/^\s*\[?[A-Z][A-Z .'-]{1,30}\]?\s*:\s*/, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The script line a blocker quotes: the first "…" quote in the problem text (or fix-free problem). */
export function quotedLine(problem: string): string {
  const s = String(problem || '')
  const m = s.match(/["“]([^"”]{12,})["”]/)
  return normalizeLine(m ? m[1] : '')
}

function key(episode: number, line: string): string {
  return `${Number(episode) || 0}|${line}`
}

function overlaps(a: string, b: string): boolean {
  const [ea, la] = [a.slice(0, a.indexOf('|')), a.slice(a.indexOf('|') + 1)]
  const [eb, lb] = [b.slice(0, b.indexOf('|')), b.slice(b.indexOf('|') + 1)]
  if (ea !== eb) return false
  if (la.length < MIN_MATCH || lb.length < MIN_MATCH) return la === lb && la.length > 0
  return la.includes(lb) || lb.includes(la)
}

/** Decide whether this read (which found blockers) should stop the series. */
export function progressStop(input: { blockerReads: number; issues: ProgressIssue[]; progress: SeriesProgress }): { stop: boolean; reason: string | null } {
  const { blockerReads, issues, progress } = input
  for (const issue of issues) {
    const line = quotedLine(issue.problem)
    if (!line) continue
    const k = key(issue.episode, line)
    if (progress.fixed.some((f) => overlaps(f, k))) return { stop: true, reason: `a fixed blocker came back (EP${issue.episode})` }
    if (progress.changed.some((c) => overlaps(c, k))) return { stop: true, reason: `a fix made a new blocker (EP${issue.episode})` }
  }
  if (blockerReads >= MAX_SERIES_READS) return { stop: true, reason: `${MAX_SERIES_READS} series reads` }
  return { stop: false, reason: null }
}

/** After a patch: remember which blockers were sent to be fixed and which lines the fix wrote. */
export function recordPatch(progress: SeriesProgress, input: { issues: ProgressIssue[]; edits: { episode: number; replace: string }[] }): SeriesProgress {
  const fixed = input.issues.map((i) => quotedLine(i.problem)).map((l, n) => (l ? key(input.issues[n].episode, l) : '')).filter(Boolean)
  const changed = input.edits
    .flatMap((e) => String(e.replace || '').split('\n').map((l) => normalizeLine(l)).filter((l) => l.length >= MIN_MATCH).map((l) => key(e.episode, l)))
  return {
    fixed: Array.from(new Set([...progress.fixed, ...fixed])).slice(-MAX_KEEP),
    changed: Array.from(new Set([...progress.changed, ...changed])).slice(-MAX_KEEP),
  }
}

export function progressStopSummary(reason: string | null): string {
  return `SERIES-HARD-STOP-001: fixes stopped working (${reason || 'no progress'}) — Marc decides: "ship" or "fix N"`
}
