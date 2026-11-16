/**
 * RETRY-QC-001 (Marc GO 2026-11-16 15:40 EST): auto-resume a production job
 * that stopped because segment transcript QC rejected a take — but ONLY when
 * the specific QC rule that rejected it has since been fixed and deployed.
 *
 * Marc's rule, verbatim: "Only allow it when the QC rule that failed has since
 * been fixed and deployed."
 *
 * Trigger: Mercy Island (job 2f68f4cb) sat failed ~16h at
 * series_generate_voices with
 *   Segment transcript QC failed for segment_0015.mp3:
 *   expected "Nell.", detected "now." (similarity: 57.1%)
 * Neither existing resume class matched it (not a transport error, not a Belle
 * block), so nothing ever revived it. The real cause was a QC gap fixed in
 * QC-ONE-WORD-NAME-001 (PR #667). Retrying while that fix was un-deployed would
 * have failed identically and cost a fresh ElevenLabs take each time.
 *
 * So the decision has three parts:
 *   1. Is the error a RESUMABLE QC verdict?      (not truncation/ambiguity/credits)
 *   2. WHICH rule failed?                        (derived from the error)
 *   3. Has that rule's fix been DEPLOYED since the job failed?
 * Anything we cannot positively confirm on all three stays failed for a human.
 * Failing closed is deliberate: a wrong resume spends money.
 */

/** Total automatic resumes of a QC-rejected job before it goes to a human. */
export const MAX_QC_RESUMES = 3

/** Back-off before each resume: 5, 15, 30 minutes. QC disagreement is not a blip. */
export const QC_RESUME_BACKOFF_MS = [5, 15, 30].map((m) => m * 60_000)

/**
 * Rules whose fix is known by name. `fixedIn` is the commit that introduced the
 * fix; the gate compares it against the DEPLOYED commit, not against main.
 *
 * Add an entry here when a QC rule is relaxed/added to accept a case that was
 * previously rejected. Without an entry the job is never auto-resumed — which
 * is the safe default: unknown fix = human decides.
 */
export type QcRule = {
  /** Rule id as used in commit messages / docs. */
  id: string
  /** Commit that introduced the fix (full or unique-prefix sha). */
  fixedIn: string
  /** Human-readable note for the job log. */
  note: string
}

export const QC_RULE_FIXES: QcRule[] = [
  {
    id: 'QC-ONE-WORD-NAME-001',
    fixedIn: '6cfbd7b033f64b9a81606eafa1357095b0d64a78',
    note: 'a line that is only a cast name passes when Whisper heard 1-2 words',
  },
]

/**
 * QC verdicts that a retry can clear.
 * Matched against the failing call's error text.
 */
const RESUMABLE_QC_PATTERNS: RegExp[] = [
  // "Segment transcript QC failed for segment_0015.mp3: expected "Nell.", detected "now." (similarity: 57.1%)"
  /Segment transcript QC failed for \S+/,
  // "Segment loudness QC failed for segment_0015.mp3: best candidate ... LUFS"
  /Segment loudness QC failed for \S+/,
]

/**
 * QC verdicts that a retry cannot fix — the audio itself is wrong or the
 * detector is provably stuck. Checked FIRST so they can never be resumed.
 */
const NON_RESUMABLE_QC_PATTERNS: RegExp[] = [
  /REPEATED_IDENTICAL_TRUNCATION/,
  /TRANSCRIPT_AMBIGUOUS/,
  /Whisper returned "\?""?/,
  /Retrying will not help/i,
]

/** Causes that need a human (keys / balances) — never auto-resumed here. */
const ACCOUNT_WIDE = new Set(['elevenlabs_auth_or_quota', 'anthropic_auth_or_credit', 'openai_quota'])

type JobLike = {
  status?: string | null
  current_step?: string | null
  job_type?: string | null
  updated_at?: string | null
  error_json?: unknown
  state_json?: unknown
}

/**
 * Pull the failing call's text out of a job's error_json. Mirrors
 * errorTextOf() in lib/transientResume.ts but ALSO reaches the per-episode
 * series wrapper, where the QC message sits under
 * `episodeResult` / `voiceGenerationReport.failures[]`.
 */
export function qcErrorTextOf(errorJson: unknown): string {
  if (!errorJson) return ''
  if (typeof errorJson === 'string') return errorJson
  if (typeof errorJson !== 'object') return String(errorJson)
  const e = errorJson as Record<string, unknown>
  const parts: unknown[] = [e.message, e.error, e.reason]
  if (e.detail && typeof e.detail === 'object') parts.push((e.detail as Record<string, unknown>).error)
  else parts.push(e.detail)

  for (const key of ['voiceGenerationReport', 'preflightReport', 'episodeResult', 'report']) {
    const nested = e[key]
    if (!nested || typeof nested !== 'object') continue
    const n = nested as Record<string, unknown>
    parts.push(n.error, n.message)
    if (Array.isArray(n.failures)) {
      for (const f of n.failures) {
        if (typeof f === 'string') parts.push(f)
        else if (f && typeof f === 'object') parts.push((f as Record<string, unknown>).error, (f as Record<string, unknown>).message)
      }
    }
  }
  return parts.filter((p) => typeof p === 'string' && p.trim()).join('\n')
}

/** True when the text is a QC verdict a plain retry could clear. */
export function isResumableQcFailure(text: string): boolean {
  if (!text) return false
  if (NON_RESUMABLE_QC_PATTERNS.some((re) => re.test(text))) return false
  return RESUMABLE_QC_PATTERNS.some((re) => re.test(text))
}

/**
 * Extract `expected "…"` / `detected "…"` from a transcript QC message so the
 * shape of the disagreement can be classified. Returns nulls when absent.
 */
export function parseQcMismatch(text: string): { expected: string | null; detected: string | null } {
  const m = /expected\s+"([^"]*)"[^"]*detected\s+"([^"]*)"/.exec(text)
  if (!m) return { expected: null, detected: null }
  return { expected: m[1], detected: m[2] }
}

function wordCount(s: string | null): number {
  if (!s) return 0
  return String(s).replace(/[^A-Za-z'\s-]/g, ' ').trim().split(/\s+/).filter(Boolean).length
}

/**
 * Which known QC rule does this verdict correspond to? null = no known rule, so
 * we cannot prove a fix exists and must not resume.
 *
 * QC-ONE-WORD-NAME-001 is NOT "any single-word mismatch". The deployed fix
 * (oneWordCastNameLine in lib/transcriptQC.ts) accepts the take only when the
 * expected line is itself a CAST NAME:
 *
 *   if (!names.has(words[0].toLowerCase())) return false
 *
 * Matching on word count alone would resume `expected "Yes." / detected "No."`
 * — a genuinely wrong take the fix does not accept — burning three ElevenLabs
 * retakes on a failure the deployed rule still rejects. So the cast-name test is
 * duplicated here, and a mismatch we cannot tie to a cast name stays for a human.
 */
export function identifyQcRule(
  text: string,
  castNames?: Iterable<string> | null,
): QcRule | null {
  if (!text) return null
  const { expected, detected } = parseQcMismatch(text)
  if (wordCount(expected) !== 1 || wordCount(detected) < 1 || wordCount(detected) > 2) return null

  // require the expected word to BE a cast name — mirrors the deployed fix
  const names = new Set(
    Array.from(castNames ?? [], (n) => String(n ?? '').trim().toLowerCase()).filter(Boolean),
  )
  const expectedWord = String(expected ?? '')
    .replace(/[^A-Za-z'\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0]
  if (!expectedWord || !names.has(expectedWord.toLowerCase())) return null

  return QC_RULE_FIXES.find((r) => r.id === 'QC-ONE-WORD-NAME-001') ?? null
}

/**
 * Cast names for the job's series, read from the error envelope when present,
 * else looked up by the caller. Present but empty = we could not learn them,
 * which means no QC resume (fail closed).
 */
export function castNamesOf(errorJson: unknown): string[] | null {
  if (!errorJson || typeof errorJson !== 'object') return null
  const e = errorJson as Record<string, unknown>
  for (const key of ['castNames', 'characterNames', 'cast']) {
    const v = e[key]
    if (Array.isArray(v)) {
      const names = v
        .map((x) => (typeof x === 'string' ? x : (x as Record<string, unknown>)?.name))
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      if (names.length) return names
    }
  }
  const report = e.voiceGenerationReport as Record<string, unknown> | undefined
  if (report && Array.isArray(report.castNames)) {
    const names = (report.castNames as unknown[]).filter((x): x is string => typeof x === 'string')
    if (names.length) return names
  }
  return null
}

/** Pull the bare sha out of a version string ("2353ef695a3c-mwjotfgw"). */
export function shaOf(version: string | null | undefined): string {
  return String(version || '').trim().toLowerCase().split('-')[0]
}

/**
 * True only when `deployed` provably CONTAINS the fix commit `fixedIn`.
 *
 * A plain string compare is wrong: production reported `2353ef695a3c` while the
 * fix is `6cfbd7b033` — the fix is an ANCESTOR of the deployed commit, so the two
 * shas share no prefix. Ancestry is a property of the git history, not of the
 * text, so the caller passes a resolver (the route answers it with `git
 * merge-base --is-ancestor`).
 *
 * `resolveAncestry` returns true/false, or null when it cannot tell. Null is
 * treated as NOT deployed — the gate fails closed.
 */
export function fixIsDeployed(
  fixedIn: string,
  deployed: string,
  resolveAncestry: (fixSha: string, deployedSha: string) => boolean | null,
): boolean {
  const fix = String(fixedIn || '').trim().toLowerCase()
  const dep = shaOf(deployed)
  if (!fix || dep.length < 7) return false
  if (fix.startsWith(dep) || dep === fix) return true
  const verdict = resolveAncestry(fix, dep)
  return verdict === true
}

export type QcResumeDecision =
  | { action: 'resume'; attempt: number; step: string; ruleId: string; deployed: string }
  | { action: 'wait'; attempt: number; retryAtMs: number }
  | { action: 'exhausted'; attempt: number }
  | { action: 'blocked'; reason: string }
  | null

export type QcResumeOptions = {
  /** The commit currently running in production (e.g. "2353ef695a3c-mwjotfgw"). */
  deployedVersion?: string | null
  /** Answers "does deployedSha contain fixSha?" — null when it cannot tell. */
  resolveAncestry?: (fixSha: string, deployedSha: string) => boolean | null
  /** Cast names for the job's series; required to identify the name rule. */
  castNames?: string[] | null
  nowMs?: number
}

/**
 * Pure decision for one failed job.
 *   null      — not a QC verdict at all (leave it for a human, silently)
 *   blocked   — a QC verdict, but the rule fix is not deployed yet (explain why)
 *   wait      — eligible, still inside back-off
 *   resume    — rule fix IS deployed; re-queue at the same step
 */
export function qcResumeDecision(job: JobLike, opts: QcResumeOptions = {}): QcResumeDecision {
  if (!job || job.status !== 'failed') return null
  if (String(job.job_type || '').startsWith('TEST_')) return null
  const step = String(job.current_step || '').trim()
  if (!step) return null
  const err = job.error_json && typeof job.error_json === 'object' ? (job.error_json as Record<string, unknown>) : null
  if (err && ACCOUNT_WIDE.has(String(err.transient_cause || ''))) return null
  if (err && err.exhausted === true) return null

  const text = qcErrorTextOf(job.error_json)
  if (!isResumableQcFailure(text)) return null

  // ── the gate Marc asked for: only resume when the failing rule is fixed AND deployed
  const castNames = opts.castNames ?? castNamesOf(job.error_json)
  const rule = identifyQcRule(text, castNames)
  if (!rule) {
    return {
      action: 'blocked',
      reason: castNames?.length
        ? 'no known fix for this QC verdict — leaving it for a human'
        : 'cast names unavailable, so the failing rule cannot be pinned to a fix',
    }
  }
  const deployed = String(opts.deployedVersion || '').trim()
  if (!deployed) {
    return { action: 'blocked', reason: `cannot confirm the deployed version; ${rule.id} unverified` }
  }
  const ancestry = opts.resolveAncestry
  const deployedHasFix = ancestry
    ? fixIsDeployed(rule.fixedIn, deployed, ancestry)
    : false
  if (!deployedHasFix) {
    return { action: 'blocked', reason: `${rule.id} fix not in deployed build ${deployed}` }
  }

  const state = job.state_json && typeof job.state_json === 'object' ? (job.state_json as Record<string, unknown>) : {}
  const done = Number(state.qcResumeCount ?? 0) || 0
  if (done >= MAX_QC_RESUMES) return { action: 'exhausted', attempt: done }

  const nowMs = Number(opts.nowMs ?? Date.now())
  const failedAt = Date.parse(String(job.updated_at || ''))
  const backoff = QC_RESUME_BACKOFF_MS[Math.min(done, QC_RESUME_BACKOFF_MS.length - 1)]
  if (Number.isFinite(failedAt) && nowMs - failedAt < backoff) {
    return { action: 'wait', attempt: done + 1, retryAtMs: failedAt + backoff }
  }
  return { action: 'resume', attempt: done + 1, step, ruleId: rule.id, deployed }
}
