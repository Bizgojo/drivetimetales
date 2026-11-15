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

Before the next scene starts: what do you expect to happen next, and how sure are you?
Reply with JSON only: {"expect_next": "<one sentence>", "confidence": <0 to 1>, "want_to_keep_listening": <1 to 10>}`
}

export function judgePrompt(input: { seriesTitle: string; episodeNumber: number; episodeTitle: string; scenes: ListenerScene[]; predictions: Array<{ beforeScene: number; expect_next: string; confidence: number; want_to_keep_listening: number }> }): string {
  const sceneText = input.scenes.map((s) => `--- Scene ${s.n} (${s.heading}) ---\n${s.text}`).join('\n\n')
  const preds = input.predictions.map((p) => `Before scene ${p.beforeScene}: expected "${p.expect_next}" (confidence ${p.confidence}, want to keep listening ${p.want_to_keep_listening}/10)`).join('\n')
  return `You are a story editor for drive-time audio drama. Below is Episode ${input.episodeNumber}, "${input.episodeTitle}", of "${input.seriesTitle}", and what a first-time listener expected before each scene.

THE EPISODE:
${sceneText}

THE LISTENER'S EXPECTATIONS:
${preds}

For each scene from scene 2 on, compare the expectation with what actually happened:
- "predicted": it went as expected (too many in a row = predictable);
- "fair_surprise": unexpected but set up earlier, so it feels earned;
- "unfair_surprise": unexpected and not set up (feels random or cheap).
Rate attention 1-10 for three listeners: a commuter half paying attention, a romance fan, a mystery fan.
Name any moment a listener might quit, and anything confusing to hear (who is speaking, too many names, a fact you can't follow by ear).
Then rate the ending: how badly does each listener want the next episode (1-10), and why.

Reply with JSON only:
{"scenes":[{"scene":2,"outcome":"predicted|fair_surprise|unfair_surprise","attention":{"commuter":0,"romance":0,"mystery":0},"quit_risk":"<empty or one sentence>","confusing":"<empty or one sentence>"}],
 "ending":{"want_next":{"commuter":0,"romance":0,"mystery":0},"why":"<one sentence>"},
 "top_fixes":["<up to 3 concrete, small changes that would most improve this episode for listeners>"]}`
}

/** First JSON object in a model reply. */
export function parseJsonReply<T>(text: string): T | null {
  const s = String(text || '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) as T } catch { return null }
}
