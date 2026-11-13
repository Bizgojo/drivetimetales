/**
 * SERIES-PATCH-001 (Weekend Wife in Miami, job fe4c8778, Nov 12, 2026):
 * the whole-series read (continuity check + Gemini story read) returns exact,
 * line-level fixes ("change 'October' to 'November'"). SERIES-REWRITE-001 then
 * regenerated whole episodes. Each rewrite fixed the listed errors and invented
 * new ones (dinner time, who confessed, "eight months" vs "two years" survived
 * three rounds), until the rewrite budget ran out and the job failed.
 *
 * Now: before any whole-episode rewrite, the pipeline writer applies the read's
 * fixes as targeted edits to the existing scripts. Each edit must quote text
 * that appears exactly once in the script; anything that does not apply cleanly
 * falls back to the old rewrite loop. Patched episodes go back through the
 * per-episode validator and the whole-series read like any new draft.
 * Bounded: MAX_SERIES_PATCH_RUNS per job. SERIES_PATCH=off disables it.
 * The pipeline writer makes every edit; no agent edits scripts (CANON-99 #18).
 */

import { hashScript } from './continuityPin'

/**
 * PATCH-BUDGET-002 (Nov 13, 2026): the budget was 2 patch runs per JOB, so a 7-episode
 * series used it up on early episodes and later one-line problems (one decorative SFX cue
 * in Weekend Wife EP4; "Saturday" for "Wednesday" in Widow EP2) went to whole rewrites that
 * brought new problems. Now each episode gets up to 2 patches, with a job-wide safety cap.
 */
export const MAX_SERIES_PATCH_RUNS = 8
export const MAX_PATCHES_PER_EPISODE = 2
/** More issues than this is a story problem, not a patch job. */
export const MAX_SERIES_PATCH_ISSUES = 12
/** A patch that changes more than this share of an episode is a rewrite in disguise. */
export const MAX_PATCH_CHANGE_SHARE = 0.25

export type SeriesReadIssue = { episode: number; problem: string; fix: string }
export type PatchEdit = { find: string; replace: string }

export function seriesPatchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SERIES_PATCH || '').trim().toLowerCase() !== 'off'
}

/** Whether this failure is a patch job, and why not when it isn't. */
export function planSeriesPatch(input: {
  issues: SeriesReadIssue[] | null | undefined
  patchRuns: number
  frozenEpisodes: Set<number>
  episodesWithScript: Set<number>
  /** PATCH-BUDGET-002: patches already applied per episode number. */
  patchCounts?: Record<string, number>
}): { action: 'patch'; run: number; byEpisode: Map<number, SeriesReadIssue[]> } | { action: 'skip'; reason: string } {
  const issues = Array.isArray(input.issues) ? input.issues.filter((i) => i && Number.isFinite(i.episode) && i.episode > 0) : []
  if (!issues.length) return { action: 'skip', reason: 'no series-read issues' }
  if (input.patchRuns >= MAX_SERIES_PATCH_RUNS) return { action: 'skip', reason: `patch budget used (${input.patchRuns}/${MAX_SERIES_PATCH_RUNS})` }
  if (issues.length > MAX_SERIES_PATCH_ISSUES) return { action: 'skip', reason: `${issues.length} issues — too many to patch` }
  const byEpisode = new Map<number, SeriesReadIssue[]>()
  let capped = 0
  for (const issue of issues) {
    if (input.frozenEpisodes.has(issue.episode)) continue
    // LINE-FIX-FIRST-001: a problem that quotes the exact text to fix is never sent to a
    // whole-episode rewrite because of the per-episode count; only the job cap applies.
    if (!isLineLevelIssue(issue) && Number(input.patchCounts?.[String(issue.episode)] || 0) >= MAX_PATCHES_PER_EPISODE) { capped += 1; continue }
    if (!input.episodesWithScript.has(issue.episode)) return { action: 'skip', reason: `episode ${issue.episode} has no script` }
    byEpisode.set(issue.episode, [...(byEpisode.get(issue.episode) || []), issue])
  }
  if (!byEpisode.size) return { action: 'skip', reason: capped ? `per-episode patch budget used (${MAX_PATCHES_PER_EPISODE} each)` : 'every issue is in a published episode' }
  return { action: 'patch', run: input.patchRuns + 1, byEpisode }
}

export function buildPatchPrompt(input: { seriesTitle: string; episodeNumber: number; title: string; script: string; issues: SeriesReadIssue[]; facts?: string[] }): string {
  const list = input.issues.map((i, n) => `${n + 1}. ${i.problem}${i.fix ? `\n   Requested fix: ${i.fix}` : ''}`).join('\n')
  return `You are the script editor for the audio drama series "${input.seriesTitle}". A reviewer read the whole series and found the problems below in Episode ${input.episodeNumber}, "${input.title}". Fix ONLY these problems with the smallest edits that work. Do not rewrite, restyle or improve anything else.

PROBLEMS TO FIX IN THIS EPISODE:
${list}

RULES FOR EDITS:
1. Each edit has "find" and "replace". "find" must be copied character for character from the script below, must be one or more WHOLE lines, and must appear exactly once in the script.
2. "replace" is the new text for those lines. Use an empty string to delete lines.
3. Keep the script format: speaker lines are "NAME: text"; sound cues are "[SFX: ...]". Use only speaker names already in the script.
4. Write every number as words.
5. A scene with too many speakers: remove or reassign lines (or have characters leave) so that at most three characters speak in that scene. Keep the story events the same.
6. Change the character guide or cast list only when a problem is about it.
7. Do not change the BELLE B lines unless a problem is about them.
7b. A sound cue that does not match what happens in the story (EPISODE-PATCH-001): delete that [SFX: ...] line. Never invent a new sound name; you may only reuse a cue name already in this script when it matches.
8. Fix every listed problem. If one cannot be fixed with small edits, still return the edits you can make and name it in "unfixed".
${input.facts?.length ? `9. FIXED FACTS (SERIES-FACTS-BACKFILL-001): every edit must agree with these exactly. When a problem's requested fix disagrees with a fixed fact, follow the fixed fact.\n${input.facts.map((f) => `   - ${f}`).join('\n')}\n` : ''}
Return JSON only, no markdown:
{"edits": [{"find": "...", "replace": "..."}], "unfixed": ["..."]}

===== SCRIPT: EPISODE ${input.episodeNumber} =====
${input.script}`
}

/** Pull {edits, unfixed} out of the writer's reply. Null when there is no usable JSON. */
export function parsePatchReply(raw: string): { edits: PatchEdit[]; unfixed: string[] } | null {
  const text = String(raw || '').trim()
  let obj: any = null
  try { obj = JSON.parse(text) } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { obj = JSON.parse(m[0]) } catch { obj = null } }
  }
  if (!obj || !Array.isArray(obj.edits)) return null
  const edits = obj.edits
    .map((e: any) => ({ find: String(e?.find ?? ''), replace: String(e?.replace ?? '') }))
    .filter((e: PatchEdit) => e.find.trim().length > 0 && e.find !== e.replace)
  const unfixed = Array.isArray(obj.unfixed) ? obj.unfixed.map((u: any) => String(u)).filter((u: string) => u.trim()) : []
  return { edits, unfixed }
}

/**
 * SERIES-PATCH-QUOTES-001 (Weekend Wife EP6, Nov 12): both patch runs failed with "text not
 * found" on lines that differed only in quote marks: scripts use curly apostrophes (’) and the
 * writer quotes them back as straight ones ('). Matching ignores that difference. Every mapping
 * is one character to one character, so positions found in the matching copy are the same
 * positions in the real script, and only the matched span is replaced.
 */
const MATCH_CHAR_MAP: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201B': "'", '\u2032': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u2033': '"',
  '\u2013': '-', '\u2014': '-', '\u2212': '-',
  '\u00A0': ' ', '\u2009': ' ', '\u202F': ' ',
}
export function matchKey(text: string): string {
  return String(text || '').replace(/[\u2018\u2019\u201B\u2032\u201C\u201D\u201E\u2033\u2013\u2014\u2212\u00A0\u2009\u202F]/g, (c) => MATCH_CHAR_MAP[c] || c)
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let at = haystack.indexOf(needle)
  while (at >= 0) { count += 1; at = haystack.indexOf(needle, at + needle.length) }
  return count
}

/**
 * Where a quoted block sits in the script. First an exact match (quote-insensitive,
 * SERIES-PATCH-QUOTES-001). If that finds nothing, SERIES-PATCH-LINES-001 (Weekend Wife EP6,
 * Nov 12, 2:07 PM): scripts put a blank line between spoken lines, and the writer quotes
 * several lines back without the blank lines, so the block is matched line by line, ignoring
 * blank lines and trailing spaces. Either way the block must occur exactly once.
 */
export function locatePatchSpan(script: string, find: string): { at: number; endAt: number } | { error: string } {
  const outKey = matchKey(script)
  const findKey = matchKey(find)
  const n = countOccurrences(outKey, findKey)
  if (n === 1) {
    const at = outKey.indexOf(findKey)
    return { at, endAt: at + find.length }
  }
  if (n > 1) return { error: `text found ${n} times` }
  const want = find.split('\n').map((l) => matchKey(l).trimEnd()).filter((l) => l.trim().length > 0)
  if (!want.length) return { error: 'text not found' }
  const lines: Array<{ key: string; start: number; end: number }> = []
  let pos = 0
  for (const line of script.split('\n')) {
    if (line.trim().length > 0) lines.push({ key: matchKey(line).trimEnd(), start: pos, end: pos + line.length })
    pos += line.length + 1
  }
  const hits: Array<{ at: number; endAt: number }> = []
  for (let i = 0; i + want.length <= lines.length; i += 1) {
    let ok = true
    for (let j = 0; j < want.length; j += 1) {
      if (lines[i + j].key !== want[j]) { ok = false; break }
    }
    if (ok) hits.push({ at: lines[i].start, endAt: lines[i + want.length - 1].end })
  }
  if (hits.length === 1) return hits[0]
  return { error: hits.length ? `text found ${hits.length} times` : 'text not found' }
}

/**
 * Apply edits in order. Every "find" must appear exactly once at the moment it is applied.
 * Fails as a whole (script unchanged) on any bad edit or an over-large change.
 */
export function applyPatchEdits(script: string, edits: PatchEdit[]): { ok: true; script: string; changedChars: number } | { ok: false; error: string } {
  if (!edits.length) return { ok: false, error: 'no edits returned' }
  let out = String(script || '')
  let changedChars = 0
  for (let i = 0; i < edits.length; i += 1) {
    const edit = edits[i]
    // Tolerate trailing whitespace/newline differences at the ends of a quoted block.
    const find = edit.find.replace(/^\n+|\s+$/g, '')
    if (!find) return { ok: false, error: `edit ${i + 1}: empty find` }
    const span = locatePatchSpan(out, find)
    if ('error' in span) return { ok: false, error: `edit ${i + 1}: ${span.error}: "${find.slice(0, 80)}"` }
    const at = span.at
    const startsLine = at === 0 || out[at - 1] === '\n'
    const endAt = span.endAt
    const endsLine = endAt === out.length || out[endAt] === '\n'
    if (!startsLine || !endsLine) return { ok: false, error: `edit ${i + 1}: must cover whole lines: "${find.slice(0, 80)}"` }
    const replace = edit.replace.replace(/\s+$/g, '')
    const before = out.slice(0, at)
    let after = out.slice(endAt)
    // Deleting lines: drop the line break that followed them too.
    if (!replace && after.startsWith('\n')) after = after.slice(1)
    out = before + replace + after
    changedChars += Math.max(find.length, replace.length)
  }
  const share = changedChars / Math.max(1, String(script || '').length)
  if (share > MAX_PATCH_CHANGE_SHARE) return { ok: false, error: `patch changes ${Math.round(share * 100)}% of the episode (limit ${Math.round(MAX_PATCH_CHANGE_SHARE * 100)}%)` }
  return { ok: true, script: out, changedChars }
}

/**
 * GATE 2 (continuity pins) fails closed when a prior script changes after a later episode
 * consumed it. A patch is exactly such a change, but it is followed by a fresh whole-series
 * read, which is a stronger check than the pin. So every episode that pinned a patched script
 * is re-pinned to the patched text. Returns the new script_json for each episode that changes.
 */
export function repinAfterPatch(episodes: any[], patchedScripts: Map<string, string>): Map<string, any> {
  const out = new Map<string, any>()
  for (const ep of episodes || []) {
    const sj = ep?.script_json && typeof ep.script_json === 'object' ? ep.script_json : null
    const gen = sj?.series_generation && typeof sj.series_generation === 'object' ? sj.series_generation : null
    const pins = gen?.continuity_pins_used && typeof gen.continuity_pins_used === 'object' ? gen.continuity_pins_used : null
    if (!pins) continue
    let changed = false
    const nextPins: Record<string, string> = { ...pins }
    for (const priorId of Object.keys(pins)) {
      const patched = patchedScripts.get(String(priorId))
      if (patched == null) continue
      nextPins[priorId] = hashScript(patched)
      changed = true
    }
    if (changed) out.set(String(ep.id), { ...sj, series_generation: { ...gen, continuity_pins_used: nextPins } })
  }
  return out
}

/**
 * SERIES-PATCH-RETRY-001: the one retry message when the first reply's edits do not apply.
 * It names what failed and repeats the copy rule; the whole edit list is redone so edits
 * that did apply are not lost.
 */
export function buildPatchRetryMessage(why: string): string {
  return `Those edits could not be applied: ${String(why || '').trim()}
Every "find" must be copied character for character from the script, including punctuation, quote marks and dashes, and must cover whole lines. Copy the lines directly from the script above; do not retype them from memory.
Return the complete corrected JSON for ALL edits (not only the one that failed), in the same format.`
}

/**
 * EPISODE-PATCH-001 (Second Rise EP7 and Widow EP3, Nov 12, 2026): a single-episode validator
 * failure on a few lines ("[SFX: Door, wood, closes]" with no door, "[SFX: Clock, ticking]"
 * with no clock) used to re-write that episode and every later one, and each new draft brought
 * new wrong cues. The validator's fix list now goes to the same in-place patcher first. Returns
 * no issues when the report is not a FAIL, so a pass or an unreadable report never patches.
 */
export function validatorIssuesForPatch(report: unknown, episodeNumber: number): SeriesReadIssue[] {
  const text = String(report || '')
  const m = text.match(/VALIDATOR RESULT:\s*FAIL\**\s*([\s\S]*)$/i)
  if (!m || !(episodeNumber >= 1)) return []
  const body = m[1].replace(/^\s*Do not send to production\.?[^\n]*\n?/i, '').trim()
  const items: string[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (bullet) items.push(bullet[1])
    else if (items.length) items[items.length - 1] += ` ${line}`
  }
  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const list = (items.length ? items : body ? [body.slice(0, 1500)] : []).map(clean).filter(Boolean)
  return list.slice(0, MAX_SERIES_PATCH_ISSUES).map((problem) => ({ episode: episodeNumber, problem, fix: '' }))
}


/**
 * LINE-FIX-FIRST-001 (canon item 146, Nov 13, 2026): on Nov 13 all three re-planned hook
 * series used their last whole-episode rewrite on one-line problems (a decorative sound cue,
 * one past-tense word, one paragraph printed twice), and each rewrite invented new mistakes.
 * A problem is line-level when it quotes the exact script text it is about (a line in quotes
 * or backticks, or an [SFX: ...] cue). Line-level problems are always fixed in place.
 */
export function isLineLevelIssue(issue: SeriesReadIssue): boolean {
  const t = `${issue?.problem || ''} ${issue?.fix || ''}`
  return /\[SFX:[^\]\n]+\]/i.test(t) || /["“][^"”\n]{8,}["”]/.test(t) || /`[^`\n]{4,}`/.test(t)
}

/** SFX-DELETE-001: at most this many cue lines deleted per job (loop guard). */
export const MAX_SFX_DELETES_PER_JOB = 12

const SFX_WORDS = /\b(SFX|sound cue|sound effect|cue)\b/i

function sfxLineIndexes(script: string, cue: string): number[] {
  const want = matchKey(cue).replace(/\s+/g, ' ').trim().toLowerCase()
  const out: number[] = []
  String(script || '').split('\n').forEach((line, i) => {
    if (matchKey(line).replace(/\s+/g, ' ').trim().toLowerCase() === want) out.push(i)
  })
  return out
}

/**
 * SFX-DELETE-001 (canon item 146): when every problem is a wrong or decorative sound cue that
 * the problem quotes, and that cue is a whole line found exactly once in its episode, the cue
 * line is deleted with no AI call. Deleting a sound line cannot change the story. Returns
 * null when any problem is not such a cue (the AI patcher handles those as before).
 */
export function planSfxDeletions(issues: SeriesReadIssue[] | null | undefined, scripts: Map<number, string>, frozenEpisodes: Set<number> = new Set()): Map<number, string[]> | null {
  const list = Array.isArray(issues) ? issues.filter((i) => i && i.episode > 0) : []
  if (!list.length) return null
  const out = new Map<number, string[]>()
  for (const issue of list) {
    if (frozenEpisodes.has(issue.episode)) return null
    const script = scripts.get(issue.episode)
    if (!script || !SFX_WORDS.test(issue.problem)) return null
    const mentioned = Array.from(new Set(Array.from(String(issue.problem).matchAll(/\[SFX:[^\]\n]+\]/gi)).map((m) => m[0])))
    const present = mentioned.filter((c) => sfxLineIndexes(script, c).length > 0)
    if (present.length !== 1 || sfxLineIndexes(script, present[0]).length !== 1) return null
    const cues = out.get(issue.episode) || []
    if (!cues.includes(present[0])) cues.push(present[0])
    out.set(issue.episode, cues)
  }
  return out.size ? out : null
}

/** Remove whole cue lines (each found exactly once) and the blank line left behind. */
export function deleteSfxLines(script: string, cues: string[]): string {
  let lines = String(script || '').split('\n')
  for (const cue of cues) {
    const idx = sfxLineIndexes(lines.join('\n'), cue)
    if (idx.length !== 1) continue
    const i = idx[0]
    const blankAfter = i + 1 < lines.length && !lines[i + 1].trim() && (i === 0 || !lines[i - 1].trim())
    lines.splice(i, blankAfter ? 2 : 1)
  }
  return lines.join('\n')
}
