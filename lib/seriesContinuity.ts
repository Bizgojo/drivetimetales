/**
 * SERIES-CONTINUITY-001 (Chicago "Wrong Side of the River"): the existing
 * package check only reads each episode's last ~1,800 characters, so it never
 * saw that the girl was rescued in a middle episode and again in the finale.
 *
 * Now (always on; SERIES_CONTINUITY=off disables): after every episode passes its own review, one
 * check reads the FULL story text of all episodes together and fails on
 * clear contradictions — an event resolved twice, a character under two
 * names, a dead or captured character back without explanation, facts that
 * disagree. A failure feeds the existing SERIES-REWRITE-001 loop (rewrite the
 * named episode and every later one, bounded). Pure rules here.
 */

export const MAX_SERIES_CONTINUITY_RUNS = 3

export function seriesContinuityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  // Marc 2026-10-29 23:44 EDT: permanent for all future stories. Default ON; only an explicit SERIES_CONTINUITY=off disables it.
  return String(env.SERIES_CONTINUITY || '').trim().toLowerCase() !== 'off'
}

/** Spoken story body only: after [START AUDIO DRAMA SCRIPT], before the Belle B outro. */
export function storyBodyText(script: string): string {
  const s = String(script || '')
  const start = s.indexOf('[START AUDIO DRAMA SCRIPT]')
  let body = start >= 0 ? s.slice(start + '[START AUDIO DRAMA SCRIPT]'.length) : s
  const outro = body.search(/\n\s*BELLE B OUTRO\b/i)
  if (outro >= 0) body = body.slice(0, outro)
  return body.replace(/\n{3,}/g, '\n\n').trim()
}

export function buildContinuityPrompt(input: {
  seriesTitle: string
  outlineText?: string
  /** SERIES-NEMESIS-001 exception text, if any. */
  exceptionNote?: string
  episodes: Array<{ episodeNumber: number; title: string; body: string }>
}): string {
  return `You are the continuity editor for the audio drama series "${input.seriesTitle}" (${input.episodes.length} episodes). Read every episode in full, in order, and find CLEAR continuity errors a listener would notice.

Fail the series only for these:
1. The same event resolved twice — a person rescued, found, caught, freed, killed or unmasked in one episode and then again as if new in a later one.
2. One character appearing under two different names or speaker labels, or two different characters sharing a name.
3. A dead, jailed or captured character back later with no explanation.
4. Facts that contradict each other across episodes (who did what, where someone is, what an object is).
5. A later episode ignoring something major that happened earlier.

Do NOT report style, pacing, or small details. If there is nothing clear, pass.${input.exceptionNote ? `\n${input.exceptionNote}` : ''}
For each problem, name the ONE episode that should be rewritten to fix it (usually the earlier episode that resolves something too soon, or the later one that contradicts it) and say exactly what to change.
${input.outlineText ? `\nTHE SERIES PLAN THE EPISODES WERE WRITTEN FROM:\n${input.outlineText}\n` : ''}
Return JSON only, no markdown:
{"pass": true|false, "issues": [{"episode": <number to rewrite>, "problem": "...", "fix": "..."}]}

${input.episodes.map((e) => `===== EPISODE ${e.episodeNumber}: ${e.title} =====\n${e.body}`).join('\n\n')}`
}

export type ContinuityIssue = { episode: number; problem: string; fix: string }
export type ContinuityVerdict = { pass: boolean; issues: ContinuityIssue[] }

export function parseContinuityVerdict(raw: unknown, totalEpisodes: number): ContinuityVerdict {
  const o = raw && typeof raw === 'object' ? (raw as any) : {}
  const issues: ContinuityIssue[] = (Array.isArray(o.issues) ? o.issues : [])
    .map((i: any) => ({ episode: Math.round(Number(i?.episode)), problem: String(i?.problem || '').trim(), fix: String(i?.fix || '').trim() }))
    .filter((i: ContinuityIssue) => i.problem && i.episode >= 1 && i.episode <= totalEpisodes)
  // Issues win over a contradictory "pass": true.
  return { pass: issues.length === 0 && o.pass !== false, issues }
}

/** Earliest episode to rewrite, and the fix list for it in the validator's report format. */
export function continuityRewriteTarget(verdict: ContinuityVerdict): { episodeNumber: number; report: string } | null {
  if (verdict.pass || !verdict.issues.length) return null
  const episodeNumber = Math.min(...verdict.issues.map((i) => i.episode))
  const lines = verdict.issues
    .slice()
    .sort((a, b) => a.episode - b.episode)
    .map((i) => `- Episode ${i.episode}: ${i.problem}${i.fix ? ` — Fix: ${i.fix}` : ''}`)
  return {
    episodeNumber,
    report: `SERIES CONTINUITY CHECK (all episodes read together)\nVALIDATOR RESULT: FAIL\nFix these continuity errors (the episodes after this one are rewritten too, so they will follow your new version):\n${lines.join('\n')}`,
  }
}

/** Cheap fingerprint of the scripts a verdict was made on. */
export function scriptsFingerprint(scripts: string[]): string {
  let h = 2166136261
  for (const s of scripts) {
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    h ^= 0x2c; h = Math.imul(h, 16777619) >>> 0
  }
  return `${scripts.length}:${h.toString(16)}`
}
