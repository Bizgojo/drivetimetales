/**
 * SFX-SOUNDMAP-001 (Marc 2026-10-31, after the sound-effects research):
 * "sounds that did not belong and narrator statements of things that should
 * have had sound."
 *
 * Replaces the free-form "add extra effects" pass (which the research shows
 * adds unsuitable effects) with a sound map:
 *   1. Code scans every spoken line for sound words, so no moment is missed.
 *   2. The AI must give a verdict for EVERY flagged line: play or skip, with a
 *      reason. Skip covers metaphors ("like thunder"), negation ("no sound"),
 *      memories, hypotheticals, inner thoughts, and sounds already marked.
 *   3. Code checks the plan: one sound per cue, one background per scene, at
 *      most two effects per line, words that really are in the line.
 * The verdicts are kept in the plan so the sound report can list every line
 * that names a sound and what happened there.
 */
import type { ScriptPosition } from '@/lib/scriptLineIndex'
import type { OverlayCue } from '@/lib/sfxOverlay'
import { isSceneBackground } from '@/lib/sfxLayeredMix'
import { phraseTokens } from '@/lib/sfxAlign'

export type SoundLine = { index: number; speaker: string; text: string; scene: number }

export type SoundDecision = {
  line: number
  verdict: 'play' | 'skip'
  reason: string
  cue?: string
  /** where the AI's decision for a flagged line was missing */
  missing?: boolean
}

/** Words that usually mean something audible is happening. Deliberately broad: the AI decides. */
const SOUND_WORD = /\b(door|doors|knock\w*|slam\w*|bang\w*|shot|shots|gunshot\w*|gun|guns|fire[ds]?|firing|pistol|rifle|shotgun|trigger|cock\w*|click\w*|engine\w*|motor|tires?|brakes?|screech\w*|skid\w*|horn|honk\w*|siren\w*|phone\w*|ring\w*|buzz\w*|vibrat\w*|footsteps?|steps?|running|runs?|ran|sprint\w*|rain\w*|thunder\w*|wind|storm\w*|glass|shatter\w*|smash\w*|crash\w*|break\w*|broke|scream\w*|shout\w*|yell\w*|whisper\w*|laugh\w*|gasp\w*|cough\w*|crowd\w*|chatter|murmur\w*|music|radio|static|bell\w*|clock|tick\w*|keys?|lock\w*|latch\w*|splash\w*|water|river|waves?|drip\w*|creak\w*|thud\w*|punch\w*|hit|hits|kick\w*|struggl\w*|scuffl\w*|explo\w*|blast\w*|crack\w*|snap\w*|traffic|train|helicopter|chopper|dog|bark\w*|growl\w*|car|truck|suv|van|beep\w*|alarm\w*|hiss\w*|roar\w*|rumbl\w*|whistl\w*|splinter\w*|footfall\w*|elevator|zipper|zip|tape|paper|rustl\w*)\b/i

/** Spoken lines, numbered by real index, with their scene number. */
export function soundLines(positions: ScriptPosition[]): SoundLine[] {
  let scene = 1
  const out: SoundLine[] = []
  for (const p of positions) {
    if (p.kind === 'silence') { scene += 1; continue }
    if (p.kind !== 'voice' || !p.isExpected) continue
    out.push({ index: p.index, speaker: String(p.speaker || ''), text: String(p.text || ''), scene })
  }
  return out
}

/** Lines that name a sound, with the words that matched. */
export function flagSoundLines(lines: SoundLine[]): Array<{ index: number; words: string[] }> {
  const flagged: Array<{ index: number; words: string[] }> = []
  for (const l of lines) {
    const words = Array.from(new Set((l.text.match(new RegExp(SOUND_WORD.source, 'gi')) || []).map((w) => w.toLowerCase())))
    if (words.length) flagged.push({ index: l.index, words })
  }
  return flagged
}

export function buildSoundMapPrompt(params: {
  lines: SoundLine[]
  flagged: Array<{ index: number; words: string[] }>
  genre: string
  scriptCues: Array<{ index: number; text: string }>
  ceiling: number
}): string {
  const { lines, flagged, genre, scriptCues, ceiling } = params
  return [
    `You are the sound designer for a ${genre || 'drama'} audio drama for drive-time listeners. Professional rule: a sound plays only when it truly happens in the scene, right now. Restraint beats clutter.`,
    '',
    'TASK 1 — For EVERY flagged line below, decide "play" or "skip", with a short reason.',
    'Skip when the sound word is: a metaphor or comparison ("a voice like thunder"), negated ("no one knocks"), a memory or flashback, a plan or hypothetical ("if the phone rings"), inside a character\'s head, already covered by an effect the script has at that moment, or not actually audible.',
    'Play when the sound actually happens now and the listener should hear it.',
    '',
    'TASK 2 — Scene backgrounds: for each scene whose place has a steady sound (rain, traffic, a bar crowd, a river, wind, an office hum), add ONE background at the scene\'s first line, described as a steady texture with no events, e.g. "steady rain on a car roof, constant". Skip backgrounds for quiet interiors.',
    '',
    'TASK 3 — You may add a sound on an unflagged line only if the action clearly makes one (rare).',
    '',
    'Rules for every cue you play:',
    '- ONE sound per cue, described concretely for a sound library: what makes it, how, where. e.g. "single pistol shot in a concrete parking garage". Never two sounds in one cue, never "then" or "followed by".',
    '- No speech, no music, no singing.',
    '- If the sound happens in the middle of the line, give "afterWords": the exact words from that line right before the sound.',
    '- durationSec: impacts 1-2, gunfire 2-3, engines/vehicles 3-6, backgrounds 10-20.',
    `- Hard ceiling, never a goal: ${ceiling} sounds in total.`,
    '',
    'Return JSON only:',
    '{"decisions":[{"line":<n>,"verdict":"play"|"skip","reason":"...","cue":"<if play>","durationSec":<if play>,"afterWords":"<optional>"}],',
    ' "backgrounds":[{"line":<n>,"cue":"...","durationSec":<n>}],',
    ' "extra":[{"line":<n>,"cue":"...","durationSec":<n>,"afterWords":"<optional>","reason":"..."}]}',
    '',
    `Effects the script already has (line: sound): ${scriptCues.length ? scriptCues.map((c) => `${c.index}: ${c.text}`).join(' | ') : 'none'}`,
    '',
    `Flagged lines (sound words found): ${flagged.map((f) => `${f.index} [${f.words.join(', ')}]`).join('; ') || 'none'}`,
    '',
    'All lines (number. [scene] SPEAKER: text):',
    ...lines.map((l) => `${l.index}. [${l.scene}] ${l.speaker}: ${l.text}`),
  ].join('\n')
}

const MULTI_SOUND = /\b(then|followed by|and then|before|after which)\b/i
const SPEECH_OR_MUSIC = /\b(says?|speaks?|voice|dialogue|music|song|singing|sings)\b/i

function clampDuration(cue: string, dur: unknown): number {
  const d = Number(dur)
  if (isSceneBackground(cue)) return Math.min(20, Math.max(4, Number.isFinite(d) ? d : 12))
  return Math.min(6, Math.max(1, Number.isFinite(d) ? d : 2.5))
}

/**
 * Turns the AI's sound map into overlay cues, enforcing the rules in code.
 * Every flagged line ends up with a decision (missing ones are recorded).
 */
export function validateSoundMap(raw: unknown, params: {
  lines: SoundLine[]
  flagged: Array<{ index: number; words: string[] }>
  scriptCueIndices: number[]
  ceiling: number
}): { cues: OverlayCue[]; decisions: SoundDecision[]; rejected: Array<{ cue: unknown; reason: string }> } {
  const { lines, flagged, scriptCueIndices, ceiling } = params
  const byIndex = new Map(lines.map((l) => [l.index, l]))
  const rejected: Array<{ cue: unknown; reason: string }> = []
  const cues: OverlayCue[] = []
  const decisions: SoundDecision[] = []
  const r: any = raw || {}
  const perLine = new Map<number, number>()
  const backgroundScenes = new Set<number>()

  const accept = (item: any, kind: 'decision' | 'background' | 'extra'): boolean => {
    const idx = Number(item?.line)
    const line = byIndex.get(idx)
    const cue = String(item?.cue || '').replace(/\s+/g, ' ').trim()
    if (!line) { rejected.push({ cue: item, reason: 'not a spoken line' }); return false }
    if (cue.length < 6 || cue.length > 160) { rejected.push({ cue: item, reason: 'cue length' }); return false }
    if (SPEECH_OR_MUSIC.test(cue)) { rejected.push({ cue: item, reason: 'speech or music' }); return false }
    const bg = kind === 'background' || isSceneBackground(cue)
    if (!bg && MULTI_SOUND.test(cue)) { rejected.push({ cue: item, reason: 'more than one sound in a cue' }); return false }
    if (bg) {
      if (backgroundScenes.has(line.scene)) { rejected.push({ cue: item, reason: 'scene already has a background' }); return false }
    } else {
      if ((perLine.get(idx) || 0) >= 2) { rejected.push({ cue: item, reason: 'line already has two effects' }); return false }
      if (scriptCueIndices.some((s) => s === idx - 1 || s === idx + 1) && kind === 'extra') { rejected.push({ cue: item, reason: 'script already has an effect here' }); return false }
    }
    if (cues.length >= ceiling) { rejected.push({ cue: item, reason: 'over the safety ceiling' }); return false }
    const out: OverlayCue = { beforeIndex: idx, cue, durationSec: clampDuration(cue, item?.durationSec) }
    const afterWords = String(item?.afterWords || '').replace(/\s+/g, ' ').trim()
    if (afterWords && !bg) {
      const lineTokens = ` ${phraseTokens(line.text).join(' ')} `
      const want = phraseTokens(afterWords).join(' ')
      if (want && lineTokens.includes(` ${want} `)) out.afterWords = afterWords
    }
    if (bg) backgroundScenes.add(line.scene)
    else perLine.set(idx, (perLine.get(idx) || 0) + 1)
    cues.push(out)
    return true
  }

  for (const bgItem of Array.isArray(r.backgrounds) ? r.backgrounds : []) accept(bgItem, 'background')

  const decided = new Set<number>()
  for (const d of Array.isArray(r.decisions) ? r.decisions : []) {
    const idx = Number(d?.line)
    if (!Number.isInteger(idx) || decided.has(idx)) continue
    decided.add(idx)
    const verdict = d?.verdict === 'play' ? 'play' : 'skip'
    const reason = String(d?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (verdict === 'play') {
      const ok = accept(d, 'decision')
      decisions.push({ line: idx, verdict: ok ? 'play' : 'skip', reason: ok ? reason : `${reason} (cue rejected: ${rejected[rejected.length - 1]?.reason})`, ...(ok ? { cue: String(d.cue).trim() } : {}) })
    } else {
      decisions.push({ line: idx, verdict: 'skip', reason })
    }
  }
  for (const f of flagged) {
    if (!decided.has(f.index)) decisions.push({ line: f.index, verdict: 'skip', reason: `no decision from the AI for: ${f.words.join(', ')}`, missing: true })
  }
  for (const ex of Array.isArray(r.extra) ? r.extra : []) accept(ex, 'extra')

  cues.sort((a, b) => a.beforeIndex - b.beforeIndex)
  decisions.sort((a, b) => a.line - b.line)
  return { cues, decisions, rejected }
}

/** Which planner a render uses: the sound map for v3 tests or when SFX_PLANNER=soundmap. */
export function soundMapPlannerEnabled(tag?: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (tag && /^v3/i.test(String(tag))) return true
  return String(env.SFX_PLANNER || '').trim().toLowerCase() === 'soundmap'
}

/**
 * SFX-AGREE-001 (research: "never narrate what the listener can hear"): the
 * writer marks a sound instead of narrating it, and never narrates a sound
 * with no cue. Off until Marc approves the test (SFX_V2=on).
 */
export function sfxSoundAgreementRule(env: Record<string, string | undefined> = process.env): string {
  if (String(env.SFX_V2 || '').trim().toLowerCase() !== 'on') return ''
  return '\n- SOUND, NOT NARRATION (SFX-AGREE-001): when the listener should hear something, put an [SFX: …] cue at that exact moment and do NOT also have the narrator describe it. Write "[SFX: car door slams]", not "NARRATOR: The car door slams." Never narrate a sound that has no cue. Describe a sound in words only when it would be unclear on its own (a dull thud), and then let a character name it.'
}
