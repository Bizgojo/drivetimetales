// lib/listenerRead.ts — LISTENER-READ-001 (Marc, Nov 15, 2026: "Is there any way that some AI model
// can analyze a story and measure human expectations to improve the stories?" → "Go ahead").
//
// ADVISORY ONLY (no gate; rule freeze, item 149). A model hears the episode one scene at a time.
// Before each new scene it says what it expects to happen next. Then it compares its guesses with
// what actually happened and rates each scene the way three listener types would: predictable,
// fair surprise or unfair (unset-up) surprise, attention 1-10, and where a listener might quit.
// The result is advice for the writer; real quit points (QUIT-POINT-001) later show which warnings
// matter.

export type ListenerScene = { n: number; heading: string; text: string }

/** The episode as a listener hears it: [SCENE: ...] blocks, spoken lines only. */
export function listenerScenes(script: string): ListenerScene[] {
  const raw = String(script || '').replace(/<!--[\s\S]*?-->/g, '')
  const start = raw.indexOf('[START AUDIO DRAMA SCRIPT]')
  const body = start >= 0 ? raw.slice(start + '[START AUDIO DRAMA SCRIPT]'.length) : raw
  const parts = body.split(/^\s*\[SCENE:\s*/m)
  const scenes: ListenerScene[] = []
  for (const part of parts.slice(1)) {
    const close = part.indexOf(']')
    const heading = close >= 0 ? part.slice(0, close).trim() : ''
    const lines = (close >= 0 ? part.slice(close + 1) : part).split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^\[(SFX|MUSIC|END|BEAT|PAUSE)/i.test(l) && /^[A-Z][A-Z .'’-]{1,40}:/.test(l))
      .filter((l) => !/^(ANNOUNCER|BELLE B|SANDY):/i.test(l))
    if (lines.length) scenes.push({ n: scenes.length + 1, heading, text: lines.join('\n') })
  }
  return scenes
}

export function predictPrompt(input: { seriesTitle: string; episodeNumber: number; episodeTitle: string; earlier: string; soFar: ListenerScene[] }): string {
  const heard = input.soFar.map((s) => `--- Scene ${s.n} (${s.heading}) ---\n${s.text}`).join('\n\n')
  return `You are a listener of the audio drama "${input.seriesTitle}", Episode ${input.episodeNumber}, "${input.episodeTitle}". You hear it in your car, one scene at a time.
${input.earlier ? `\nEARLIER EPISODES (what you remember):\n${input.earlier}\n` : ''}
WHAT YOU HAVE HEARD SO FAR IN THIS EPISODE:
${heard}

You heard the last scene once, while driving; you cannot go back.
1. Retell the LAST scene you heard in plain words: what happened and why it matters to the story.
2. Say anything in it you could not follow by ear (who was speaking, a name, a "he"/"she", a number, a time jump), or "" if none.
3. Before the next scene starts: what do you expect to happen next, and how sure are you?
Reply with JSON only: {"retell_last_scene": "<one or two sentences>", "lost_track": "<empty or one sentence>", "expect_next": "<one sentence>", "confidence": <0 to 1>, "want_to_keep_listening": <1 to 10>}`
}

/** RETELL-TEST-001: the intended job of each part of this episode, from the series plan (brief_json). */
export function intendedPlanText(brief: any, episodeNumber: number): string {
  const b = brief && typeof brief === 'object' ? brief : {}
  const plan = b.full_episode_plan
  let mine: any = null
  if (Array.isArray(plan)) mine = plan.find((e: any) => Number(e?.episode ?? e?.episode_number ?? e?.number) === episodeNumber) || null
  else if (plan && typeof plan === 'object') mine = plan[String(episodeNumber)] ?? plan[`episode_${episodeNumber}`] ?? null
  const text = mine ? (typeof mine === 'string' ? mine : JSON.stringify(mine)) : String(b.description || '')
  return text.slice(0, 3000)
}

export function judgePrompt(input: { seriesTitle: string; episodeNumber: number; episodeTitle: string; scenes: ListenerScene[]; predictions: Array<{ beforeScene: number; expect_next: string; confidence: number; want_to_keep_listening: number }>; retells?: Array<{ scene: number; retell: string; lost_track: string }>; intendedPlan?: string }): string {
  const sceneText = input.scenes.map((s) => `--- Scene ${s.n} (${s.heading}) ---\n${s.text}`).join('\n\n')
  const preds = input.predictions.map((p) => `Before scene ${p.beforeScene}: expected "${p.expect_next}" (confidence ${p.confidence}, want to keep listening ${p.want_to_keep_listening}/10)`).join('\n')
  const retells = (input.retells || []).map((r) => `Scene ${r.scene}: listener retold "${r.retell}"${r.lost_track ? ` — lost track: ${r.lost_track}` : ''}`).join('\n')
  return `You are a story editor for drive-time audio drama. Below is Episode ${input.episodeNumber}, "${input.episodeTitle}", of "${input.seriesTitle}", and what a first-time listener expected before each scene.

THE EPISODE:
${sceneText}

THE LISTENER'S EXPECTATIONS:
${preds}
${retells ? `\nWHAT THE LISTENER UNDERSTOOD (retold after hearing each scene once):\n${retells}\n` : ''}${input.intendedPlan ? `\nWHAT THIS EPISODE WAS MEANT TO DO (series plan):\n${input.intendedPlan}\n` : ''}
For each scene from scene 2 on, compare the expectation with what actually happened:
- "predicted": it went as expected (too many in a row = predictable);
- "fair_surprise": unexpected but set up earlier, so it feels earned;
- "unfair_surprise": unexpected and not set up (feels random or cheap).
Rate attention 1-10 for three listeners: a commuter half paying attention, a romance fan, a mystery fan.
Name any moment a listener might quit, and anything confusing to hear (who is speaking, too many names, a fact you can't follow by ear).
Then rate the ending: how badly does each listener want the next episode (1-10), and why.
RETELL TEST: for each scene, does the listener's retelling match what the scene was meant to do? "yes", "partly" or "no", and what was missed.
LINE CHECK: go through every spoken line. List up to 15 problem lines, quoting each exactly, with one issue:
"speaker_unclear" (can't tell who is talking by ear), "meaning_unclear" (not clear on one hearing), "filler" (moves nothing), "repeat" (says what we already know), "ear_trap" (new name, unclear he/she, number, or time jump).
Estimate the share of spoken lines that move the story (plot, character, clue or stakes) and the share a listener could follow on one hearing.

Reply with JSON only:
{"scenes":[{"scene":2,"outcome":"predicted|fair_surprise|unfair_surprise","attention":{"commuter":0,"romance":0,"mystery":0},"quit_risk":"<empty or one sentence>","confusing":"<empty or one sentence>"}],
 "ending":{"want_next":{"commuter":0,"romance":0,"mystery":0},"why":"<one sentence>"},
 "retell":[{"scene":1,"match":"yes|partly|no","missed":"<empty or one sentence>"}],
 "problem_lines":[{"scene":1,"line":"<exact quote>","issue":"speaker_unclear|meaning_unclear|filler|repeat|ear_trap","note":"<short>"}],
 "scores":{"lines_advancing_share":0.0,"lines_followable_share":0.0},
 "top_fixes":["<up to 3 concrete, small changes that would most improve this episode for listeners>"]}`
}

/** First JSON object in a model reply. */
export function parseJsonReply<T>(text: string): T | null {
  const s = String(text || '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) as T } catch { return null }
}
