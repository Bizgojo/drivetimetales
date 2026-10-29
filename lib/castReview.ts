/**
 * CAST-REVIEW-001 (Marc standing rule, 2026-10-29 09:06 EDT): "before you
 * begin the voices, let me listen to the voices you have chosen for a story
 * and allow me to make changes or approve."
 *
 * Flow (series jobs, when CAST_REVIEW=on):
 *   series_voice_preflight → [cast review] → series_generate_voices
 *   1. Every episode is cast up front (generate-voices castOnly — the normal
 *      casting rules, persisted to the series roster and story assignments).
 *   2. One short clip per character (a real line of theirs) is sent to the
 *      "Voices Ready" Telegram group with a caption: who they are, their
 *      voice, which episodes, how many lines.
 *   3. The job parks in status waiting_for_external until approved
 *      (state_json.castReview.approvedAt). Changes go through the usual
 *      recast tooling before approval; nothing has been recorded yet.
 *
 * This file is the pure part (building the review, captions, gating rules).
 */

export const CAST_REVIEW_STATE_KEY = 'castReview'
export const DEFAULT_CAST_REVIEW_CHAT_ID = '-5596605542' // Telegram "Voices Ready" group

export type CastReviewRosterRow = {
  canonical_name: string
  aliases?: string[] | null
  description?: string | null
  voice_id?: string | null
  voice_name?: string | null
}

export type CastReviewEpisode = { episodeNumber: number; script: string }

export type CastReviewItem = {
  name: string
  voiceId: string
  voiceName: string
  description: string
  episodes: number[]
  lines: number
  sampleLine: string
}

const NON_CHARACTER_LABELS = new Set([
  'TITLE', 'DESCRIPTION', 'NARRATOR', 'AUTHOR', 'GENRE', 'BELLE B', 'BELLE', 'SFX', 'MUSIC',
  'EPISODE', 'SERIES', 'ANNOUNCER', 'SUNO PROMPT', 'CHARACTER GUIDE', 'SETTING', 'NOTE', 'NOTES',
])

function norm(s: string): string {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Does a script speaker label belong to this roster character? */
export function labelMatchesCharacter(label: string, row: CastReviewRosterRow): boolean {
  const l = norm(label)
  const canon = norm(row.canonical_name)
  if (!l || !canon) return false
  if (l === canon) return true
  if ((row.aliases || []).some((a) => norm(a) === l)) return true
  const parts = canon.split(' ')
  return parts.length > 1 && (l === parts[0] || l === parts[parts.length - 1])
}

/** Spoken character lines in a script: [label, text]. */
export function characterLines(script: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const raw of String(script || '').split('\n')) {
    const m = raw.match(/^([A-Z][A-Z .'\-]+):\s*(.+)$/)
    if (!m) continue
    const label = norm(m[1])
    if (NON_CHARACTER_LABELS.has(label)) continue
    out.push([label, m[2].trim()])
  }
  return out
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

/** A clean line to audition: 8–30 words, no cues/brackets/quotes. Falls back to the longest line. */
export function pickSampleLine(lines: string[]): string {
  const clean = lines
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t && !/[\[\]{}"]/.test(t))
  const good = clean.filter((t) => wordCount(t) >= 8 && wordCount(t) <= 30)
  const pool = good.length ? good : clean
  if (!pool.length) return ''
  return pool.slice().sort((a, b) => wordCount(b) - wordCount(a))[0]
}

/** Strip the "NAME — " prefix the character guide repeats in descriptions. */
export function shortDescription(row: CastReviewRosterRow): string {
  const d = String(row.description || '').trim()
  const stripped = d.replace(new RegExp(`^${norm(row.canonical_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–-]\\s*`, 'i'), '')
  return stripped.length > 220 ? `${stripped.slice(0, 217)}…` : stripped
}

/**
 * One review item per roster character who actually speaks, ordered by
 * number of lines (biggest parts first). Characters with no lines are left
 * out (they would never be recorded).
 */
export function buildCastReview(roster: CastReviewRosterRow[], episodes: CastReviewEpisode[]): CastReviewItem[] {
  const perEpisode = episodes.map((ep) => ({ ep: ep.episodeNumber, lines: characterLines(ep.script) }))
  const items: CastReviewItem[] = []
  for (const row of roster) {
    if (!row.voice_id) continue
    const eps = new Set<number>()
    const texts: string[] = []
    for (const { ep, lines } of perEpisode) {
      for (const [label, text] of lines) {
        if (!labelMatchesCharacter(label, row)) continue
        eps.add(ep)
        texts.push(text)
      }
    }
    if (!texts.length) continue
    items.push({
      name: row.canonical_name,
      voiceId: String(row.voice_id),
      voiceName: String(row.voice_name || row.voice_id),
      description: shortDescription(row),
      episodes: Array.from(eps).sort((a, b) => a - b),
      lines: texts.length,
      sampleLine: pickSampleLine(texts),
    })
  }
  return items.sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name))
}

export function formatEpisodes(eps: number[]): string {
  if (!eps.length) return 'no episodes'
  const ranges: string[] = []
  let start = eps[0]
  let prev = eps[0]
  for (const n of eps.slice(1).concat([Number.NaN])) {
    if (n === prev + 1) { prev = n; continue }
    ranges.push(start === prev ? String(start) : `${start}–${prev}`)
    start = n
    prev = n
  }
  return `${eps.length === 1 ? 'Episode' : 'Episodes'} ${ranges.join(', ')}`
}

/** Telegram caption under each clip (max 1024 chars). */
export function castReviewCaption(item: CastReviewItem, index: number): string {
  const voice = item.voiceName.split(/\s+[-–—]\s+/)[0].trim()
  const text = `${index}. ${item.name} — voice: ${voice}\n${item.description}\n${formatEpisodes(item.episodes)} · ${item.lines} line${item.lines === 1 ? '' : 's'}`
  return text.length > 1024 ? `${text.slice(0, 1021)}…` : text
}

export function castReviewHeader(seriesTitle: string, itemCount: number, narratorName?: string | null): string {
  return (
    `🎙 VOICES READY — ${seriesTitle}\n` +
    `${itemCount} character voice${itemCount === 1 ? '' : 's'} below${narratorName ? ` (narrator: ${narratorName})` : ''}.\n` +
    `Nothing is recorded yet. Reply to Claude with "approve", or a change like "2 = deeper".`
  )
}

export function castReviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.CAST_REVIEW || '').trim().toLowerCase() === 'on'
}

/**
 * Should this series job stop for cast review before recording?
 * Never for a job that already approved, and never for one that has already
 * started recording (an in-flight series is not paused retroactively).
 */
export function needsCastReview(stateJson: unknown, env: Record<string, string | undefined> = process.env): boolean {
  if (!castReviewEnabled(env)) return false
  const state = stateJson && typeof stateJson === 'object' ? (stateJson as Record<string, unknown>) : {}
  const review = state[CAST_REVIEW_STATE_KEY] as Record<string, unknown> | undefined
  if (review && review.approvedAt) return false
  const svg = state.seriesVoiceGeneration as Record<string, unknown> | undefined
  if (svg && (Number(svg.presentCount || 0) > 0 || (svg.progressByEpisode && Object.keys(svg.progressByEpisode as object).length > 0))) return false
  return true
}
