/**
 * EMOTION-PALETTE-001 — CANON decision 133 (Marc, Nov 10, 2026).
 *
 * Emotion is built, never announced. The palette is a menu: the series plan
 * picks one main emotion per episode (plus up to two supporting ones), starting
 * from the genre's set. Liking the protagonist is required in every story.
 * The clarity reviewer reports each planned emotion's setup and trigger
 * (report-only until Marc reviews three stories with it).
 */

export type Emotion = { name: string; recipe: string }

export const EMOTION_PALETTE: Emotion[] = [
  { name: 'liking', recipe: 'the hero does a kind or brave thing that costs them, wants something simple, has one small flaw; then the listener sees them keep trying' },
  { name: 'worry', recipe: 'the listener learns of a danger before the hero does, and the cost of failure is said plainly once; then the hero walks toward it' },
  { name: 'fear', recipe: 'the threat is close and real right now (a footstep in the room, a voice behind the door), told in short lines through what the hero hears and feels, with no way out yet; then the threat moves' },
  { name: 'stress', recipe: 'a clock, a narrowing choice, or a short pause before the answer; then the hero must act before they are ready' },
  { name: 'grief', recipe: 'the listener spends time with the person, place or thing first in a small specific moment (a joke, a habit, a promise); then it is lost, and the scene stays with the loss before moving on' },
  { name: 'love and warmth', recipe: 'a small act of care that costs the giver something, shown not described; then it is returned or remembered later' },
  { name: 'hate of the villain', recipe: 'the villain harms someone the listener already likes, on purpose, with no regret; then gets away with it for now' },
  { name: 'bad feeling at a villain win', recipe: 'the villain takes something the listener has seen the hero care about; never a loss the listener was never shown' },
  { name: 'glee', recipe: "the villain's fall comes from something set up earlier (a clue, a skill, an ally the listener met), through the hero's own choice, never luck or rescue by others" },
  { name: 'relief', recipe: 'real danger, then a release the hero earns, followed by a quiet moment' },
  { name: 'hope', recipe: 'a small win or a door opening after a low point, never a promise that everything will be fine' },
  { name: 'dread', recipe: 'small wrong details pile up (a sound, an object moved, someone who knows too much) before anything happens; then the feared thing starts' },
  { name: 'longing', recipe: 'the listener sees what two people could have and what keeps them apart; then they almost reach it and are pulled back' },
  { name: 'jealousy', recipe: 'the listener sees what the hero values, then a rival gets near it; then the hero sees it too and wants to act on it' },
  { name: 'betrayal', recipe: 'a character earns trust over time with real help; then turns, and the earlier help now reads differently' },
  { name: 'shame', recipe: 'the hero hides one thing the listener knows about; then it comes out in front of someone whose opinion matters to them' },
  { name: 'awe', recipe: 'something large or strange is described through one concrete detail, never a list; then the hero goes quiet before it' },
  { name: 'amusement', recipe: "a character's habit or way of talking is shown twice; then it pays off at the right moment, never at the cost of a serious beat" },
]

export const GENRE_EMOTION_SETS: Array<{ match: RegExp; set: string[] }> = [
  { match: /horror|ghost|haunt|supernatural/i, set: ['dread', 'fear', 'relief'] },
  { match: /romance|love|pocket ?fm/i, set: ['love and warmth', 'longing', 'jealousy', 'hope'] },
  { match: /revenge|vengeance/i, set: ['hate of the villain', 'bad feeling at a villain win', 'glee'] },
  { match: /con\b|heist|betray/i, set: ['betrayal', 'worry', 'glee'] },
  { match: /grief|family|drama/i, set: ['grief', 'love and warmth', 'hope'] },
  { match: /comedy|light|humou?r/i, set: ['amusement', 'love and warmth', 'relief'] },
  { match: /sci-?fi|science fiction|adventure|space/i, set: ['awe', 'worry', 'glee'] },
  { match: /thriller|mystery|suspense|crime|detective/i, set: ['worry', 'fear', 'glee'] },
]

const NAMES = EMOTION_PALETTE.map((e) => e.name)

/** Map loose words to palette names ("hate" -> "hate of the villain", "love" -> "love and warmth"). */
export function toPaletteName(raw: string): string | null {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return null
  const exact = NAMES.find((n) => n === s)
  if (exact) return exact
  const first = s.split(/[\s,/()-]+/)[0]
  return NAMES.find((n) => n.split(' ')[0] === first) || NAMES.find((n) => s.includes(n)) || null
}

/** Planned emotions for one episode: palette names only, at most 3, de-duplicated. */
export function normalizeEmotions(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : typeof list === 'string' ? list.split(/[,;]/) : []
  const out: string[] = []
  for (const x of arr) {
    const n = toPaletteName(String(x))
    if (n && !out.includes(n)) out.push(n)
    if (out.length >= 3) break
  }
  return out
}

export function genreStartingSet(genre: string | null | undefined): string[] {
  const g = String(genre || '')
  return (GENRE_EMOTION_SETS.find((x) => x.match.test(g))?.set || ['worry', 'hope', 'relief']).slice(0, 3)
}

/** Writer-prompt block. `planned` = the episode's planned emotions (may be empty: falls back to the genre set). */
export function emotionWriterBlock(planned: string[], genre?: string | null): string {
  const chosen = planned.length ? planned : genreStartingSet(genre)
  const recipes = chosen
    .map((n) => EMOTION_PALETTE.find((e) => e.name === n))
    .filter(Boolean)
    .map((e) => `- ${e!.name}: ${e!.recipe}`)
  const liking = EMOTION_PALETTE[0]
  return `EMOTION (canon decision 133): build feelings, never announce them.
- Characters and the narrator never name the listener's feeling for them ("I was terrified", "it was heartbreaking"). Show it through what happens, what is said, and what the hero does.
- Required in every story: the listener likes the protagonist within the first 3 minutes (${liking.recipe}).
- This episode's planned emotions (main first). Build each with its setup, then its trigger:
${recipes.join('\n')}
- Audio tools: short lines speed up stress and fear; longer lines slow grief; a beat of silence before a hard line; sound that belongs to the scene.`
}

/** Planner rules block (series plans). */
export function emotionPlannerRules(): string {
  return `  - Emotions (canon decision 133): for each episode name one main emotion the listener should feel and up to two supporting ones, from this menu: ${NAMES.join(', ')}. Start from the genre's usual set and vary across episodes so they do not all feel the same. Liking the protagonist is built in Episode 1.`
}
