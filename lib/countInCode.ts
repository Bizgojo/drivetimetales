/**
 * COUNT-IN-CODE-001 (canon item 147, Marc Nov 13, 2026): "a lot of the problems are AI's
 * inability to count." The AI script checker was asked to count title words, description
 * characters, banned words, required blocks and "the first ~400 words" — and counted the same
 * description as 88 characters on one pass and 91 on the next. Code already checks the card
 * copy (validateCardCopy) before the AI runs. Now code also checks that the required blocks
 * are present and cuts the exact opening the five-question test reads. The AI checker is told
 * never to count and never to fail a script for a length, a count or a missing block.
 */

export const OPENING_EXCERPT_WORDS = 400

/** Required blocks the writer template always produces. LANDING-STORY-001 scripts have no Belle. */
export function scriptStructureIssues(script: string, opts: { belleExempt?: boolean } = {}): string[] {
  const s = String(script || '')
  const issues: string[] = []
  if (!/(^|\n)CHARACTER GUIDE[ \t]*\r?\n/i.test(s)) issues.push('The script has no CHARACTER GUIDE block.')
  if (!/(^|\n)NARRATOR:[ \t]*\S/i.test(s)) issues.push('The script has no NARRATOR header.')
  if (!opts.belleExempt && !/(^|\n)BELLE B (ANNOUNCEMENT|INTRO)[ \t]*\r?\n/i.test(s)) issues.push('The script has no BELLE B ANNOUNCEMENT block.')
  return issues
}

/**
 * The first OPENING_EXCERPT_WORDS spoken words of the story, after the Belle B announcement:
 * speaker lines only (no SFX cues, comments or Belle lines), labels kept so the reader knows
 * who speaks. Cut by code so the five-question test always reads the same opening.
 */
export function openingExcerpt(script: string, maxWords = OPENING_EXCERPT_WORDS): string {
  const s = String(script || '').replace(/<!--[\s\S]*?-->/g, '')
  // The story starts at [START AUDIO DRAMA SCRIPT]; without it, after the last BELLE B line of the
  // announcement block, else after the CHARACTER GUIDE. Headers (NARRATOR: <voice>) are never story.
  let start = s.search(/\[START AUDIO DRAMA SCRIPT\]/i)
  if (start < 0) {
    const ann = s.search(/(^|\n)BELLE B (ANNOUNCEMENT|INTRO)[ \t]*\r?\n/i)
    const belleLine = ann >= 0 ? s.slice(ann).search(/\nBELLE B:[^\n]*/i) : -1
    start = belleLine >= 0 ? ann + belleLine + 1 + (s.slice(ann + belleLine + 1).indexOf('\n') + 1 || 0) : Math.max(0, s.search(/(^|\n)CHARACTER GUIDE/i))
  }
  const lines = s.slice(start).split('\n')
  const out: string[] = []
  let words = 0
  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^([A-Z][A-Z .'\-]{1,40}):\s*(.+)$/)
    if (!m) continue
    const label = m[1].trim()
    if (/^BELLE B$/.test(label) || /^(TITLE|SERIES|EPISODE|EPISODE_TITLE|SERIES_TOTAL_EPISODES|SERIES_IS_FINALE|AUTHOR|GENRE|DESCRIPTION|ANNOUNCER|NARRATIVE_VOICE|NARRATOR_IS_CHARACTER|VARIANT)$/.test(label)) continue
    const spoken = m[2].trim().split(/\s+/)
    if (words + spoken.length > maxWords) {
      const keep = spoken.slice(0, Math.max(0, maxWords - words))
      if (keep.length) out.push(`${label}: ${keep.join(' ')}`)
      words = maxWords
      break
    }
    out.push(`${label}: ${spoken.join(' ')}`)
    words += spoken.length
  }
  return out.join('\n')
}

export const NO_COUNTING_RULE = `- COUNT-IN-CODE-001: code has already checked every count and length (title words and characters, description characters, Belle line lengths, required blocks). Never count words, characters, lines or minutes yourself, and never fail a script for a length, a count, or a missing block.`

/**
 * SCENE-MARKERS-001 (canon item 148, Marc Nov 13, 2026): the writer starts every scene with one
 * silent line "[SCENE: place, time]". Audio never reads bracket lines (lib/scriptLineIndex.ts).
 * Code then counts the speaking characters in each scene; the AI no longer counts them.
 * Scripts without markers (written before this rule) keep the AI count as a fallback.
 */
export const SCENE_MARKER_RE = /^\[SCENE:\s*([^\]\n]*)\]\s*$/i
const NON_CHARACTER_SPEAKERS = new Set(['NARRATOR', 'BELLE B', 'ANNOUNCER', 'SANDY'])

export type SceneVoices = { scene: number; place: string; speakers: string[]; firstLines: Record<string, string> }

/** null when the script has no scene markers (fallback to the AI count). */
export function scenesWithSpeakers(script: string): SceneVoices[] | null {
  const s = String(script || '').replace(/<!--[\s\S]*?-->/g, '')
  const start = s.search(/\[START AUDIO DRAMA SCRIPT\]/i)
  const lines = (start >= 0 ? s.slice(start) : s).split('\n').map((l) => l.trim())
  if (!lines.some((l) => SCENE_MARKER_RE.test(l))) return null
  const scenes: SceneVoices[] = []
  let current: SceneVoices | null = null
  for (const line of lines) {
    const marker = line.match(SCENE_MARKER_RE)
    if (marker) { current = { scene: scenes.length + 1, place: marker[1].trim(), speakers: [], firstLines: {} }; scenes.push(current); continue }
    const m = line.match(/^([A-Z][A-Z .'\-]{1,40}):\s*(.+)$/)
    if (!m || !current) continue
    const who = m[1].trim()
    if (NON_CHARACTER_SPEAKERS.has(who)) continue
    if (!current.speakers.includes(who)) { current.speakers.push(who); current.firstLines[who] = `${who}: ${m[2].trim()}` }
  }
  return scenes
}

/** One problem per scene with too many speakers, quoting each speaker's first line so it can be fixed in place. */
export function sceneVoiceIssues(script: string, max = 3): string[] | null {
  const scenes = scenesWithSpeakers(script)
  if (!scenes) return null
  return scenes
    .filter((sc) => sc.speakers.length > max)
    .map((sc) => `Scene ${sc.scene} (${sc.place || 'no place given'}) has ${sc.speakers.length} speaking characters (limit ${max}): ${sc.speakers.map((w) => `"${sc.firstLines[w]}"`).join(' ')}. Keep at most ${max}; give the others' lines to a character already speaking, or have them stay silent.`)
}
