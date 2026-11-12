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

export const MAX_SERIES_PATCH_RUNS = 2
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
}): { action: 'patch'; run: number; byEpisode: Map<number, SeriesReadIssue[]> } | { action: 'skip'; reason: string } {
  const issues = Array.isArray(input.issues) ? input.issues.filter((i) => i && Number.isFinite(i.episode) && i.episode > 0) : []
  if (!issues.length) return { action: 'skip', reason: 'no series-read issues' }
  if (input.patchRuns >= MAX_SERIES_PATCH_RUNS) return { action: 'skip', reason: `patch budget used (${input.patchRuns}/${MAX_SERIES_PATCH_RUNS})` }
  if (issues.length > MAX_SERIES_PATCH_ISSUES) return { action: 'skip', reason: `${issues.length} issues — too many to patch` }
  const byEpisode = new Map<number, SeriesReadIssue[]>()
  for (const issue of issues) {
    if (input.frozenEpisodes.has(issue.episode)) continue
    if (!input.episodesWithScript.has(issue.episode)) return { action: 'skip', reason: `episode ${issue.episode} has no script` }
    byEpisode.set(issue.episode, [...(byEpisode.get(issue.episode) || []), issue])
  }
  if (!byEpisode.size) return { action: 'skip', reason: 'every issue is in a published episode' }
  return { action: 'patch', run: input.patchRuns + 1, byEpisode }
}

export function buildPatchPrompt(input: { seriesTitle: string; episodeNumber: number; title: string; script: string; issues: SeriesReadIssue[] }): string {
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
8. Fix every listed problem. If one cannot be fixed with small edits, still return the edits you can make and name it in "unfixed".

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
    // SERIES-PATCH-QUOTES-001: match on the quote-insensitive copy; same length, same positions.
    const outKey = matchKey(out)
    const findKey = matchKey(find)
    const n = countOccurrences(outKey, findKey)
    if (n !== 1) return { ok: false, error: `edit ${i + 1}: text ${n === 0 ? 'not found' : `found ${n} times`}: "${find.slice(0, 80)}"` }
    const at = outKey.indexOf(findKey)
    const startsLine = at === 0 || out[at - 1] === '\n'
    const endAt = at + find.length
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
