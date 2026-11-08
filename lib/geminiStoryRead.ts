/**
 * GEMINI-STORY-READ-001 (Story Production Spec §6.3, approved by Marc Nov 7, 2026).
 *
 * A different model (Gemini) reads the whole series as a listener and answers the spec's
 * questions with a pass or exact fixes. Phase 1 (report-only): it NEVER blocks, rewrites or
 * publishes. Its report is stored so its verdicts can be compared with Marc's ear before it
 * is given any power (spec §9.2).
 *
 * Stage "script" runs before voicing (questions 1–4 and 6); stage "final" adds question 5.
 */

export type StoryReadStage = 'script' | 'final'
export type StoryReadIssue = { episode: number; line: string; problem: string; fix: string }
export type StoryReadQuestion = { id: string; pass: boolean; issues: StoryReadIssue[] }
export type StoryReadReport = { verdict: 'publish' | 'fix'; questions: StoryReadQuestion[] }

export const STORY_READ_QUESTIONS: Array<{ id: string; stages: StoryReadStage[]; ask: string }> = [
  { id: 'continuity', stages: ['script', 'final'], ask: 'Continuity: does every fact (who is related to whom, jobs, places, objects, who knows what) agree with the FACT SHEET, the CAST LISTS and earlier episodes?' },
  { id: 'easy_listening', stages: ['script', 'final'], ask: 'Easy listening while driving: in every scene can a listener tell who is speaking and where we are? At most 3 voices per scene; nothing that only works visually; each episode opens with a reminder of where we are.' },
  { id: 'logic', stages: ['script', 'final'], ask: 'Logic: does each episode follow from the last, with no gap a listener would trip on?' },
  { id: 'promise', stages: ['script', 'final'], ask: 'Promise: does Episode 1 deliver its hook, and does each episode end hard (a reveal, threat, arrival or choice), or close properly if it is the finale?' },
  { id: 'audio', stages: ['final'], ask: 'Audio: do the FLAGGED AUDIO LINES listed below match their script text, with no garble, cut-off or extra sound described?' },
  { id: 'credibility', stages: ['script', 'final'], ask: 'Credibility: does every event and conclusion follow from what the story has established, or is it explained? Judge by the story\'s own rules, not the real world. FAIL any character who contradicts their own instruction or plan (including inside one conversation), any host outro (Belle B) that describes something the episode did not show, any character who knows something the story never told them, and any line that refers to the story\'s own events by episode or chapter number ("in chapter four", "next episode") instead of "earlier", "back then", "later" (the host Belle B may say "next episode"; a book or chapter a character mentions is not a self-reference). Only flag what a listener would notice.' },
]

export function buildStoryReadPrompt(input: {
  stage: StoryReadStage
  seriesTitle: string
  /** Episodes in the whole series, when only some are being read. */
  totalEpisodes?: number
  factSheet?: string
  castLists?: string
  outline?: string
  flaggedAudio?: string
  episodes: Array<{ episodeNumber: number; title: string; body: string }>
}): string {
  const qs = STORY_READ_QUESTIONS.filter((q) => q.stages.includes(input.stage))
  const partial = input.totalEpisodes && input.totalEpisodes > input.episodes.length
    ? `\nYou are reading only episodes ${input.episodes.map((e) => e.episodeNumber).join(', ')} of ${input.totalEpisodes}. The series continues after the last one here: do NOT report that it fails to close or resolve.\n`
    : ''
  return `You are the final reader for the audio drama series "${input.seriesTitle}" (${input.totalEpisodes || input.episodes.length} episodes), heard by people while they drive. Read every episode in full, in order, as a listener would.
${partial}
Answer each question below. For each problem give: the episode number, the exact line (quoted), what is wrong, and the smallest fix (a setup line earlier, an explaining line, a changed line). Do not report style or taste. If a question has no clear problem, it passes.

QUESTIONS
${qs.map((q, i) => `${i + 1}. [${q.id}] ${q.ask}`).join('\n')}
${input.factSheet ? `\nFACT SHEET (fixed facts):\n${input.factSheet}\n` : ''}${input.castLists ? `\nCAST LISTS:\n${input.castLists}\n` : ''}${input.outline ? `\nSERIES PLAN:\n${input.outline}\n` : ''}${input.flaggedAudio ? `\nFLAGGED AUDIO LINES:\n${input.flaggedAudio}\n` : ''}
Reply with JSON only:
{"questions":[{"id":"<the word in brackets, e.g. continuity>","pass":true|false,"issues":[{"episode":<n>,"line":"<quote>","problem":"...","fix":"..."}]}]}

${input.episodes.map((e) => `===== EPISODE ${e.episodeNumber}: ${e.title} =====\n${e.body}`).join('\n\n')}`
}

/**
 * What the listener hears, including Belle's outro. storyBodyText() (used by our own continuity
 * check) cuts the outro, so on Nov 7 Gemini never saw Belle's "you heard his name on that tape" in
 * Rerouted EP3, a claim the story never made. The outro is part of what a listener judges.
 */
export function listenerText(script: string): string {
  const s = String(script || '')
  const start = s.indexOf('[START AUDIO DRAMA SCRIPT]')
  const body = start >= 0 ? s.slice(start + '[START AUDIO DRAMA SCRIPT]'.length) : s
  return body.replace(/\n\s*BELLE B OUTRO\b[^\n]*\n(?:-{3,}\n)?/i, '\n\n[HOST OUTRO — Belle B, the show host, speaks to the listener]\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Parse Gemini's reply; tolerant of code fences and notes around the JSON. Never throws. */
export function parseStoryRead(raw: string, stage: StoryReadStage): StoryReadReport | null {
  const text = String(raw || '')
  const candidates = [text, text.replace(/^[\s\S]*?```(?:json)?/i, '').replace(/```[\s\S]*$/, ''), (text.match(/\{[\s\S]*\}/) || [''])[0]]
  let obj: any = null
  for (const c of candidates) { try { obj = JSON.parse(c.trim()); break } catch { /* next */ } }
  if (!obj || !Array.isArray(obj.questions)) return null
  // GEMINI-READ-IDS-001: the prompt numbers the questions ("1. [continuity] ..."), and on Nov 7
  // gemini-pro answered with id "1" instead of "continuity", so every answer was dropped.
  // Accept the number as the question in that position.
  const order = STORY_READ_QUESTIONS.filter((q) => q.stages.includes(stage)).map((q) => q.id)
  const idOf = (raw: unknown): string | null => {
    const v = String(raw ?? '').trim().replace(/^\[|\]$/g, '').toLowerCase()
    if (order.includes(v)) return v
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= order.length ? order[n - 1] : null
  }
  const questions: StoryReadQuestion[] = obj.questions
    .filter((q: any) => idOf(q?.id))
    .map((q: any) => ({ ...q, id: idOf(q.id) }))
    .map((q: any) => {
      const issues: StoryReadIssue[] = (Array.isArray(q.issues) ? q.issues : [])
        .map((i: any) => ({ episode: Math.round(Number(i?.episode)) || 0, line: String(i?.line || '').trim(), problem: String(i?.problem || '').trim(), fix: String(i?.fix || '').trim() }))
        .filter((i: StoryReadIssue) => i.problem)
      return { id: String(q.id), pass: issues.length === 0 && q.pass !== false, issues }
    })
  if (!questions.length) return null
  return { verdict: questions.every((q) => q.pass) ? 'publish' : 'fix', questions }
}

/** Plain-language summary for logs and Marc. */
export function summarizeStoryRead(r: StoryReadReport): string {
  const lines = [`Gemini verdict: ${r.verdict.toUpperCase()}`]
  for (const q of r.questions) {
    lines.push(`- ${q.id}: ${q.pass ? 'pass' : `${q.issues.length} issue(s)`}`)
    for (const i of q.issues) lines.push(`    Ep ${i.episode}: "${i.line.slice(0, 120)}" — ${i.problem} Fix: ${i.fix}`)
  }
  return lines.join('\n')
}

export const GEMINI_API = 'https://generativelanguage.googleapis.com'
export function geminiStoryModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_STORY_MODEL || env.GEMINI_MODEL || 'gemini-flash-latest'
}

/** Default per-call limit. A worker tick must never hang on Gemini. GEMINI_STORY_TIMEOUT_MS overrides. */
// Measured Nov 7 on Rerouted EP1-3: 159s (22,785 thinking tokens). 3 min left no margin; 6 min fits a 16-min tick.
export const GEMINI_STORY_TIMEOUT_MS = 360_000
export function geminiStoryTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.GEMINI_STORY_TIMEOUT_MS)
  return Number.isFinite(n) && n >= 10_000 ? n : GEMINI_STORY_TIMEOUT_MS
}

/**
 * One Gemini call. Throws on HTTP/network errors and timeouts; callers record the error and carry on.
 * Logs the seconds taken and Gemini's token counts (prompt / thinking / answer) so a slow read can be
 * traced to its cause instead of guessed at (GEMINI-READ-TIMING-001).
 */
export async function callGeminiStoryRead(prompt: string, env: Record<string, string | undefined> = process.env): Promise<string> {
  const key = env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  const model = geminiStoryModel(env)
  const limitMs = geminiStoryTimeoutMs(env)
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${GEMINI_API}/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(limitMs),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
  } catch (e) {
    const secs = Math.round((Date.now() - started) / 1000)
    throw new Error(`Gemini ${model} gave no answer after ${secs}s (limit ${Math.round(limitMs / 1000)}s, prompt ${prompt.length} chars): ${e instanceof Error ? e.message : String(e)}`)
  }
  const json: any = await res.json().catch(() => null)
  const u = json?.usageMetadata || {}
  console.log(`[GEMINI-STORY-READ-001] ${model}: ${Math.round((Date.now() - started) / 1000)}s, HTTP ${res.status}, tokens prompt=${u.promptTokenCount ?? '?'} thinking=${u.thoughtsTokenCount ?? 0} answer=${u.candidatesTokenCount ?? '?'}, finish=${json?.candidates?.[0]?.finishReason ?? '?'}`)
  if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}: ${JSON.stringify(json?.error?.message || json).slice(0, 200)}`)
  return (json?.candidates?.[0]?.content?.parts || []).filter((p: any) => !p?.thought).map((p: any) => p?.text || '').join('')
}

export type GeminiReadState = {
  stage: StoryReadStage
  at: string
  model: string
  fingerprint: string
  verdict?: 'publish' | 'fix'
  questions?: StoryReadQuestion[]
  error?: string
  skipped?: string
}

/** Report-only switch. Off when GEMINI_STORY_READ=off or there is no key. */
export function geminiStoryReadSkipReason(env: Record<string, string | undefined> = process.env): string | null {
  if (String(env.GEMINI_STORY_READ || '').toLowerCase() === 'off') return 'GEMINI_STORY_READ=off'
  if (!env.GEMINI_API_KEY) return 'GEMINI_API_KEY not set'
  return null
}

/**
 * Run one read and return what to store. NEVER throws: any error is recorded in the
 * result so the pipeline carries on exactly as before (spec §9.2, report-only).
 */
export async function runGeminiStoryRead(
  input: Parameters<typeof buildStoryReadPrompt>[0],
  fingerprint: string,
  env: Record<string, string | undefined> = process.env,
  call: (prompt: string, env: Record<string, string | undefined>) => Promise<string> = callGeminiStoryRead,
): Promise<GeminiReadState> {
  const base = { stage: input.stage, at: new Date().toISOString(), model: geminiStoryModel(env), fingerprint }
  const skip = geminiStoryReadSkipReason(env)
  if (skip) return { ...base, skipped: skip }
  try {
    const raw = await call(buildStoryReadPrompt(input), env)
    const report = parseStoryRead(raw, input.stage)
    if (!report) return { ...base, error: `no readable JSON in reply: ${raw.slice(0, 200)}` }
    return { ...base, verdict: report.verdict, questions: report.questions }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) }
  }
}
