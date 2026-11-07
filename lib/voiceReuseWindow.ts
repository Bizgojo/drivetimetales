/**
 * VOICE-REUSE-001 (Marc 2026-11-07): a main character's voice cannot be reused
 * for 30 stories/series.
 *
 * Root cause of the repeats Marc heard: the old "last 20 stories" exclusion in
 * generate-voices read production_jobs with job_type='story' and a voiceMap in
 * state_json. No job has ever had either (series/standalone/single jobs, no
 * voiceMap), so the exclusion was always empty and voices repeated freely.
 *
 * This reads the real record of who voiced whom (character_voice_assignments),
 * groups it by series (or story, for singles), takes the 30 most recent groups,
 * and blocks the voices of each group's main characters (most spoken lines).
 * Pure functions here; the loader lives in generate-voices.
 */

export const VOICE_REUSE_GROUP_WINDOW = 30
export const MAIN_CHARACTERS_PER_GROUP = 3

export type VoiceAssignmentRow = {
  story_id: string | null
  series_id: string | null
  character_name: string | null
  character_name_normalized: string | null
  voice_id: string | null
  assigned_at: string | null
}

export type RecentGroup = { key: string; seriesId: string | null; storyIds: string[]; lastAt: string; assignments: VoiceAssignmentRow[] }

export const groupKey = (row: { series_id: string | null; story_id: string | null }) =>
  row.series_id ? `series:${row.series_id}` : `story:${row.story_id}`

const normName = (s: string | null | undefined) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** The most recent groups (series or single story), newest first, excluding the current one. */
export function recentGroups(rows: VoiceAssignmentRow[], currentKey: string, window = VOICE_REUSE_GROUP_WINDOW): RecentGroup[] {
  const byKey = new Map<string, RecentGroup>()
  for (const row of rows) {
    if (!row.voice_id || (!row.series_id && !row.story_id)) continue
    const key = groupKey(row)
    if (key === currentKey) continue
    const g = byKey.get(key) || { key, seriesId: row.series_id, storyIds: [], lastAt: '', assignments: [] }
    if (row.story_id && !g.storyIds.includes(row.story_id)) g.storyIds.push(row.story_id)
    if ((row.assigned_at || '') > g.lastAt) g.lastAt = row.assigned_at || ''
    g.assignments.push(row)
    byKey.set(key, g)
  }
  return [...byKey.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0)).slice(0, window)
}

/** Spoken lines per speaker label across scripts (story body only; narrator/Belle excluded). */
export function speakerLineCounts(scripts: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const script of scripts) {
    const s = String(script || '')
    const start = s.indexOf('[START AUDIO DRAMA SCRIPT]')
    const body = start >= 0 ? s.slice(start) : s
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*([A-Z][A-Za-z0-9 .'\-]{0,60}?)\s*:\s*\S/)
      if (!m) continue
      const label = normName(m[1])
      if (!label || /^(NARRATOR|BELLE B|BELLE|ANNOUNCER)$/.test(label)) continue
      counts.set(label, (counts.get(label) || 0) + 1)
    }
  }
  return counts
}

/** Lines spoken by a character name, matching "DANIEL" to "DANIEL REYES" and back. */
function linesFor(name: string, counts: Map<string, number>): number {
  const n = normName(name)
  if (!n) return 0
  let total = 0
  for (const [label, c] of counts) {
    if (label === n || label.startsWith(`${n} `) || n.startsWith(`${label} `)) total += c
  }
  return total
}

/** Voice ids of each group's main characters (top N by spoken lines). */
export function mainCharacterVoiceIds(groups: Array<RecentGroup & { scripts: string[] }>, perGroup = MAIN_CHARACTERS_PER_GROUP): Set<string> {
  const blocked = new Set<string>()
  for (const g of groups) {
    const counts = speakerLineCounts(g.scripts)
    const byVoice = new Map<string, number>()
    for (const a of g.assignments) {
      if (!a.voice_id) continue
      const name = a.character_name_normalized || a.character_name || ''
      if (/^(NARRATOR|BELLE B|BELLE)$/i.test(normName(name))) continue
      byVoice.set(a.voice_id, Math.max(byVoice.get(a.voice_id) || 0, linesFor(name, counts)))
    }
    const ranked = [...byVoice.entries()].filter(([, lines]) => lines > 0).sort((a, b) => b[1] - a[1]).slice(0, perGroup)
    for (const [voiceId] of ranked) blocked.add(voiceId)
  }
  return blocked
}
