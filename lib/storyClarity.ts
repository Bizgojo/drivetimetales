/**
 * STORY-CLARITY-001 — the seven-part clarity check (CANON-03 rules 15–17, 22, 43–46;
 * CANON-01 rule 7; canon decisions 25, 66, 85). Runs on every series episode after the
 * script validator passes and BEFORE any voicing money is spent. A fail is sent back to
 * the pipeline writer through the normal rewrite path with the quoted reasons.
 *
 * Two parts:
 *  - free, deterministic checks (cast limit, new characters per episode) plus reading-level
 *    numbers that are REPORTED ONLY until Marc approves a grade-level rule (CANON-99 item 129);
 *  - one reviewer call that reads the script cold, as a first-time listener, and answers the
 *    seven checks as JSON.
 */
import { parseScriptPositions } from './scriptLineIndex'
import { CANON } from './canon/numbers'

export const CLARITY_GOAL_BY_WORDS = 480 // decision 66: ~3 minutes at 160 wpm
export const CLARITY_MAX_NEW_CHARACTERS_PER_EPISODE = 2
export const CLARITY_MAX_PURPOSELESS_SCENES = 1 // 2 or more = fail (rule 22)

const NON_CHARACTER = /^(NARRATOR|ANNOUNCER|BELLE|BELLE B|SANDY)$/i

export type ClarityCheckId =
  | 'THREE-SENTENCE' | 'GOAL-EARLY' | 'CAST-LIMIT' | 'INSIDER-WORDS'
  | 'SCENE-PURPOSE' | 'RECAP-LINE' | 'FOLLOW-BY-EAR'
  | 'READING-LEVEL' | 'TWIST-BUDGET' | 'OPEN-QUESTIONS'

export type ClarityCheck = { id: ClarityCheckId; pass: boolean; detail: string; quotes?: string[] }

export type EmotionFinding = { emotion: string; setup: string; trigger: string; found: boolean }

export type ClarityResult = {
  passed: boolean
  /** CANON decision 133: report-only. */
  emotions?: EmotionFinding[]
  announced?: string[]
  twists: string[]
  openQuestions: string[]
  checks: ClarityCheck[]
  threeSentences: { want: string; obstacle: string; stakes: string } | null
  metrics: ReadingMetrics & { namedSpeakers: string[]; newSpeakers: string[] }
}

export type ReadingMetrics = { words: number; sentences: number; avgSentenceWords: number; grade: number }

/** Speaking characters in the drama (not narrator or Belle). */
export function namedSpeakers(script: string): string[] {
  const set = new Set<string>()
  for (const p of parseScriptPositions(String(script || ''))) {
    if (p.kind !== 'voice' || !p.speaker) continue
    const s = String(p.speaker).trim().toUpperCase()
    if (!s || NON_CHARACTER.test(s)) continue
    set.add(s)
  }
  return Array.from(set)
}

function spokenText(script: string): string {
  return parseScriptPositions(String(script || ''))
    .filter((p) => p.kind === 'voice' && p.text && !/^(ANNOUNCER|BELLE|BELLE B|SANDY)$/i.test(String(p.speaker || '')))
    .map((p) => String(p.text).trim())
    .join(' ')
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Flesch-Kincaid grade of the spoken story text (reported, not blocking). */
export function readingMetrics(script: string): ReadingMetrics {
  const text = spokenText(script)
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length)
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  const wc = Math.max(1, words.length)
  const grade = 0.39 * (wc / sentences) + 11.8 * (syl / wc) - 15.59
  return { words: words.length, sentences, avgSentenceWords: Math.round((wc / sentences) * 10) / 10, grade: Math.round(grade * 10) / 10 }
}

/** Deterministic cast checks (CANON-03 rule 44, decision 6). */
export function castCheck(script: string, opts: { totalEpisodes: number; episodeNumber: number; priorSpeakers?: string[] }): ClarityCheck & { speakers: string[]; newSpeakers: string[] } {
  const speakers = namedSpeakers(script)
  const limit = opts.totalEpisodes <= 3 ? CANON.CAST_SHORT : CANON.CAST_LONG
  // Name variants count as the same person ("DANIEL" and "DANIEL REYES").
  const first = (s: string) => s.toUpperCase().replace(/^THE\s+/, '').split(/\s+/)[0]
  const prior = new Set((opts.priorSpeakers || []).flatMap((s) => [s.toUpperCase(), first(s)]))
  const newSpeakers = opts.episodeNumber > 1 ? speakers.filter((s) => !prior.has(s) && !prior.has(first(s))) : []
  const problems: string[] = []
  if (speakers.length > limit) problems.push(`${speakers.length} named speaking characters in this episode (limit ${limit}): ${speakers.join(', ')}`)
  if (opts.episodeNumber > 1 && newSpeakers.length > CLARITY_MAX_NEW_CHARACTERS_PER_EPISODE) {
    problems.push(`${newSpeakers.length} new named characters introduced in this episode (limit ${CLARITY_MAX_NEW_CHARACTERS_PER_EPISODE}): ${newSpeakers.join(', ')}`)
  }
  return { id: 'CAST-LIMIT', pass: problems.length === 0, detail: problems.join('; ') || 'within the cast limit', speakers, newSpeakers }
}

export function buildClarityPrompt(script: string, opts: { episodeNumber: number; totalEpisodes: number; seriesTitle?: string; plannedEmotions?: string[] }): string {
  const planned = opts.plannedEmotions && opts.plannedEmotions.length ? opts.plannedEmotions : []
  const isLaterEpisode = opts.episodeNumber > 1
  return `You are a first-time listener hearing this audio drama while driving. You cannot re-read anything. Judge ONLY whether it is easy to follow. Do not judge style or taste.

This is ${opts.totalEpisodes > 1 ? `Episode ${opts.episodeNumber} of ${opts.totalEpisodes} of the series "${opts.seriesTitle || ''}"` : 'a standalone story'}. Ignore the header lines, the CHARACTER GUIDE and Belle B's announcement/outro; judge the story itself.

Answer these checks:
1. THREE-SENTENCE: from the script alone, in one sentence each: what does the main character want (concrete, not a feeling)? what is stopping them? what happens if they fail? FAIL if any answer is vague or missing.
2. GOAL-EARLY: are the main character's goal and the obstacle clear within the first ${CLARITY_GOAL_BY_WORDS} spoken words of the story? FAIL if not. Quote the line where it becomes clear, if any.
3. INSIDER-WORDS: list every acronym, trade term, local place name or organization name a typical US driver would not know that is NOT explained in plain words the first time it is heard. FAIL if any.
4. SCENE-PURPOSE: name any scene that moves neither the goal, the obstacle nor a relationship forward. FAIL if 2 or more such scenes.
5. RECAP-LINE: ${isLaterEpisode ? 'within the first 30 seconds of the story (about 80 spoken words after Belle), does one line from a character or the narrator say where things stand? FAIL if not.' : 'not required for Episode 1 or a standalone: always pass.'}
6. FOLLOW-BY-EAR: quote any stretch where a listener could not tell who is speaking, or where/when the scene is. FAIL if any.

${planned.length ? `EMOTIONS (report only, canon decision 133): the plan wants the listener to feel: ${['liking the protagonist', ...planned].join(', ')}. For each, quote the line that sets it up and the line that triggers it, or say it is missing. Also list "announced": lines where a character or the narrator names a feeling instead of showing it ("I was terrified", "it was heartbreaking").

` : ''}Also list: "twists" = each MAJOR twist or reveal in this episode (a turn that changes what the listener believes; not ordinary plot steps); "open_questions" = the main story questions still unanswered at the end of the episode (not minor details). Be strict but fair; list only real ones.

Return ONLY JSON, no other text:
{"want":"...","obstacle":"...","stakes":"...","twists":["..."],"open_questions":["..."],${planned.length ? '"emotions":[{"emotion":"...","setup":"quoted line or empty","trigger":"quoted line or empty","found":true}],"announced":["..."],' : ''}
 "checks":[{"id":"THREE-SENTENCE","pass":true,"detail":"...","quotes":[]},{"id":"GOAL-EARLY","pass":true,"detail":"...","quotes":[]},{"id":"INSIDER-WORDS","pass":true,"detail":"...","quotes":[]},{"id":"SCENE-PURPOSE","pass":true,"detail":"...","quotes":[]},{"id":"RECAP-LINE","pass":true,"detail":"...","quotes":[]},{"id":"FOLLOW-BY-EAR","pass":true,"detail":"...","quotes":[]}]}

SCRIPT:
${script}`
}

const LLM_IDS: ClarityCheckId[] = ['THREE-SENTENCE', 'GOAL-EARLY', 'INSIDER-WORDS', 'SCENE-PURPOSE', 'RECAP-LINE', 'FOLLOW-BY-EAR']

/** Parse the reviewer's JSON. Unreadable output is a FAIL (fail closed), never a pass. */
export function parseClarityReview(raw: string, episodeNumber: number): { checks: ClarityCheck[]; threeSentences: ClarityResult['threeSentences']; twists: string[]; openQuestions: string[]; emotions?: EmotionFinding[]; announced?: string[] } {
  const text = String(raw || '')
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  let obj: any = null
  try { obj = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null } catch { obj = null }
  if (!obj || !Array.isArray(obj.checks)) {
    return { checks: [{ id: 'FOLLOW-BY-EAR', pass: false, detail: 'clarity reviewer returned unreadable output (fail closed)' }], threeSentences: null, twists: [], openQuestions: [] }
  }
  const checks: ClarityCheck[] = LLM_IDS.map((id) => {
    const c = obj.checks.find((x: any) => String(x?.id || '').toUpperCase() === id)
    if (id === 'RECAP-LINE' && episodeNumber <= 1) return { id, pass: true, detail: 'not required for Episode 1' }
    if (!c) return { id, pass: false, detail: 'reviewer did not answer this check (fail closed)' }
    return { id, pass: c.pass === true, detail: String(c.detail || '').slice(0, 400), quotes: Array.isArray(c.quotes) ? c.quotes.map((q: any) => String(q).slice(0, 200)).slice(0, 6) : [] }
  })
  const three = obj.want || obj.obstacle || obj.stakes
    ? { want: String(obj.want || ''), obstacle: String(obj.obstacle || ''), stakes: String(obj.stakes || '') }
    : null
  const list = (v: any) => (Array.isArray(v) ? v.map((x: any) => String(x).slice(0, 200)).slice(0, 10) : [])
  const emotions: EmotionFinding[] = Array.isArray(obj.emotions)
    ? obj.emotions.slice(0, 6).map((e: any) => ({ emotion: String(e?.emotion || '').slice(0, 60), setup: String(e?.setup || '').slice(0, 200), trigger: String(e?.trigger || '').slice(0, 200), found: e?.found === true }))
    : []
  return { checks, threeSentences: three, twists: list(obj.twists), openQuestions: list(obj.open_questions), emotions, announced: list(obj.announced) }
}

export function combineClarity(llm: ReturnType<typeof parseClarityReview>, cast: ReturnType<typeof castCheck>, metrics: ReadingMetrics): ClarityResult {
  // Decisions 129-131 (Marc, Nov 10, 2026): blocking.
  const reading: ClarityCheck = metrics.grade <= CANON.READING_GRADE_MAX
    ? { id: 'READING-LEVEL', pass: true, detail: `grade ${metrics.grade} (max ${CANON.READING_GRADE_MAX})` }
    : { id: 'READING-LEVEL', pass: false, detail: `reads at grade ${metrics.grade}, ${metrics.avgSentenceWords} words per sentence (max grade ${CANON.READING_GRADE_MAX}; aim for about grade 6). Use shorter sentences and plainer words.` }
  const unreadable = llm.checks.some((c) => /unreadable output/.test(c.detail))
  const twists: ClarityCheck = unreadable || llm.twists.length <= CANON.TWISTS_PER_EPISODE_MAX
    ? { id: 'TWIST-BUDGET', pass: true, detail: `${llm.twists.length} major twist(s)` }
    : { id: 'TWIST-BUDGET', pass: false, detail: `${llm.twists.length} major twists in one episode (max ${CANON.TWISTS_PER_EPISODE_MAX}). Keep the one that answers or sharpens the series' main question; cut or fold the others.`, quotes: llm.twists }
  const open: ClarityCheck = unreadable || llm.openQuestions.length <= CANON.OPEN_QUESTIONS_MAX
    ? { id: 'OPEN-QUESTIONS', pass: true, detail: `${llm.openQuestions.length} open question(s)` }
    : { id: 'OPEN-QUESTIONS', pass: false, detail: `${llm.openQuestions.length} story questions still open at the end (max ${CANON.OPEN_QUESTIONS_MAX}). Answer one before opening another.`, quotes: llm.openQuestions }
  const checks = [...llm.checks, { id: cast.id, pass: cast.pass, detail: cast.detail } as ClarityCheck, reading, twists, open]
  return {
    passed: checks.every((c) => c.pass),
    checks,
    threeSentences: llm.threeSentences,
    twists: llm.twists,
    openQuestions: llm.openQuestions,
    emotions: llm.emotions || [],
    announced: llm.announced || [],
    metrics: { ...metrics, namedSpeakers: cast.speakers, newSpeakers: cast.newSpeakers },
  }
}

/** Report text in the validator's format, so a FAIL feeds the normal rewrite path. */
export function clarityReportText(r: ClarityResult): string {
  const head = [
    '---',
    'STORY-CLARITY-001 (first-time listener check)',
    r.threeSentences ? `Wants: ${r.threeSentences.want}\nObstacle: ${r.threeSentences.obstacle}\nIf they fail: ${r.threeSentences.stakes}` : 'Three-sentence test: no answer',
    `Reading level: grade ${r.metrics.grade}, ${r.metrics.avgSentenceWords} words per sentence`,
    `Twists this episode: ${r.twists.length}${r.twists.length ? ' — ' + r.twists.join(' | ') : ''}`,
    `Open questions at the end: ${r.openQuestions.length}${r.openQuestions.length ? ' — ' + r.openQuestions.join(' | ') : ''}`,
    ...r.checks.map((c) => `${c.pass ? '✅' : '❌'} ${c.id}: ${c.detail}`),
    ...(r.emotions && r.emotions.length ? ['Emotions (report only, decision 133):', ...r.emotions.map((e) => `  ${e.found ? '✓' : '✗'} ${e.emotion}${e.found ? ` — setup: "${e.setup}" trigger: "${e.trigger}"` : ' — not built'}`)] : []),
    ...(r.announced && r.announced.length ? [`Announced feelings (report only): ${r.announced.map((q) => `"${q}"`).join(' ')}`] : []),
  ]
  if (r.passed) return [...head, 'STORY-CLARITY-001: PASS'].join('\n')
  const fixes = r.checks.filter((c) => !c.pass).map((c) => `- CLARITY ${c.id}: ${c.detail}${c.quotes?.length ? ` Lines: ${c.quotes.map((q) => `"${q}"`).join(' ')}` : ''}`)
  return [...head, '', '❌ VALIDATOR RESULT: FAIL', 'Do not send to production. Fix the following before resubmitting:', ...fixes].join('\n')
}
