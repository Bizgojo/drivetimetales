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
import { SFX_CATALOG_NAMES, type CatalogName } from '@/lib/sfxCatalogNames'

export type SoundLine = { index: number; speaker: string; text: string; scene: number }

export type SoundDecision = {
  line: number
  verdict: 'play' | 'skip'
  reason: string
  cue?: string
  /** where the AI's decision for a flagged line was missing */
  missing?: boolean
  /** SFX-CATALOG-001 */
  catalogId?: string
  wanted?: string
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
  /** SFX-CATALOG-001: when given, Claude may only answer with these IDs */
  catalog?: CatalogName[]
}): string {
  const { lines, flagged, genre, scriptCues, ceiling, catalog } = params
  if (catalog) return buildCatalogPrompt({ lines, flagged, genre, scriptCues, ceiling, catalog })
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

function buildCatalogPrompt(params: {
  lines: SoundLine[]
  flagged: Array<{ index: number; words: string[] }>
  genre: string
  scriptCues: Array<{ index: number; text: string }>
  ceiling: number
  catalog: CatalogName[]
}): string {
  const { lines, flagged, genre, scriptCues, ceiling, catalog } = params
  return [
    `You are the sound designer for a ${genre || 'drama'} audio drama for drive-time listeners. A sound plays only when it truly happens in the scene, right now.`,
    '',
    'You may ONLY use sounds from the SOUND CATALOG below, by their ID. There is no other source of sound.',
    'If the right sound is not in the catalog, the moment gets NO sound: answer "skip" and put what you would have wanted in "wanted". Never pick a near match that is not really the same sound (a car door is not a trunk; an indoor shot is not an outdoor shot).',
    '',
    'TASK 1 — For EVERY flagged line below, decide "play" or "skip", with a short reason.',
    'Skip when the sound word is a metaphor or comparison, negated, a memory or flashback, a plan or hypothetical, inside a character\'s head, already covered by an effect the script has at that moment, not actually audible, or not in the catalog.',
    '',
    'TASK 2 — Scene backgrounds: for each scene whose place has a steady sound, add ONE catalog sound of kind "background" at the scene\'s first line. Skip it if no background in the catalog fits the place.',
    '',
    'TASK 3 — You may add a catalog sound on an unflagged line only if the action clearly makes that sound (rare).',
    '',
    'Rules:',
    '- "sound" must be a catalog ID exactly as listed, e.g. "CR-01".',
    '- If the sound happens in the middle of the line, give "afterWords": the exact words from that line right before the sound.',
    `- Hard ceiling, never a goal: ${ceiling} sounds in total.`,
    '',
    'Return JSON only:',
    '{"decisions":[{"line":<n>,"verdict":"play"|"skip","reason":"...","sound":"<catalog ID if play>","afterWords":"<optional>","wanted":"<if skipped because the catalog lacks it>"}],',
    ' "backgrounds":[{"line":<n>,"sound":"<catalog ID>"}],',
    ' "extra":[{"line":<n>,"sound":"<catalog ID>","afterWords":"<optional>","reason":"..."}]}',
    '',
    'SOUND CATALOG (ID: name (kind)):',
    ...catalog.map((n) => `${n.id}: ${n.name} (${n.kind})`),
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
  /** SFX-CATALOG-001: only these IDs may play; anything else is skipped (no backup) */
  catalog?: CatalogName[]
}): { cues: OverlayCue[]; decisions: SoundDecision[]; rejected: Array<{ cue: unknown; reason: string }>; wanted: Array<{ line: number; wanted: string }> } {
  const { lines, flagged, scriptCueIndices, ceiling, catalog } = params
  const catalogById = catalog ? new Map(catalog.map((n) => [n.id.toUpperCase(), n])) : null
  const wanted: Array<{ line: number; wanted: string }> = []
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
    if (!line) { rejected.push({ cue: item, reason: 'not a spoken line' }); return false }
    let cue: string
    let bg: boolean
    let entry: CatalogName | undefined
    if (catalogById) {
      entry = catalogById.get(String(item?.sound || '').trim().toUpperCase())
      if (!entry) {
        rejected.push({ cue: item, reason: 'not in the catalog' })
        wanted.push({ line: idx, wanted: String(item?.wanted || item?.sound || item?.cue || 'unnamed sound').slice(0, 120) })
        return false
      }
      if (kind === 'background' && entry.kind !== 'background') { rejected.push({ cue: item, reason: 'not a background sound' }); return false }
      cue = entry.name
      bg = entry.kind === 'background'
    } else {
      cue = String(item?.cue || '').replace(/\s+/g, ' ').trim()
      if (cue.length < 6 || cue.length > 160) { rejected.push({ cue: item, reason: 'cue length' }); return false }
      if (SPEECH_OR_MUSIC.test(cue)) { rejected.push({ cue: item, reason: 'speech or music' }); return false }
      bg = kind === 'background' || isSceneBackground(cue)
      if (!bg && MULTI_SOUND.test(cue)) { rejected.push({ cue: item, reason: 'more than one sound in a cue' }); return false }
    }
    if (bg) {
      if (backgroundScenes.has(line.scene)) { rejected.push({ cue: item, reason: 'scene already has a background' }); return false }
    } else {
      if ((perLine.get(idx) || 0) >= 2) { rejected.push({ cue: item, reason: 'line already has two effects' }); return false }
      if (scriptCueIndices.some((s) => s === idx - 1 || s === idx + 1) && kind === 'extra') { rejected.push({ cue: item, reason: 'script already has an effect here' }); return false }
    }
    if (cues.length >= ceiling) { rejected.push({ cue: item, reason: 'over the safety ceiling' }); return false }
    const out: OverlayCue = entry
      ? { beforeIndex: idx, cue, durationSec: bg ? 15 : 3, catalogId: entry.id, kind: entry.kind }
      : { beforeIndex: idx, cue, durationSec: clampDuration(cue, item?.durationSec) }
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
      const played = ok ? cues[cues.length - 1] : null
      decisions.push({ line: idx, verdict: ok ? 'play' : 'skip', reason: ok ? reason : `${reason} (cue rejected: ${rejected[rejected.length - 1]?.reason})`, ...(played ? { cue: played.cue, ...(played.catalogId ? { catalogId: played.catalogId } : {}) } : {}) })
    } else {
      const w = String(d?.wanted || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      if (w && catalogById) wanted.push({ line: idx, wanted: w })
      decisions.push({ line: idx, verdict: 'skip', reason, ...(w ? { wanted: w } : {}) })
    }
  }
  for (const f of flagged) {
    if (!decided.has(f.index)) decisions.push({ line: f.index, verdict: 'skip', reason: `no decision from the AI for: ${f.words.join(', ')}`, missing: true })
  }
  for (const ex of Array.isArray(r.extra) ? r.extra : []) accept(ex, 'extra')

  cues.sort((a, b) => a.beforeIndex - b.beforeIndex)
  decisions.sort((a, b) => a.line - b.line)
  wanted.sort((a, b) => a.line - b.line)
  return { cues, decisions, rejected, wanted }
}

/** Which planner a render uses: the sound map for v3 tests or when SFX_PLANNER=soundmap. */
export function soundMapPlannerEnabled(tag?: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (tag && /^v3/i.test(String(tag))) return true
  return String(env.SFX_PLANNER || '').trim().toLowerCase() === 'soundmap'
}

/**
 * SFX-AGREE-001 / SFX-NAMED-001 (Marc 2026-10-31): every sound is named or
 * reacted to by a character or the narrator, before or right after it plays,
 * but never just described ("The door slams." + a slam). Sounds come only
 * from the catalog. Off until Marc approves the test (SFX_V2=on).
 */
export const SFX_NAMED_RULE_TEXT = [
  'SOUND RULE (SFX-NAMED-001): every sound effect is NAMED or REACTED TO by a character or the narrator, right before or right after it plays, so a listener who only half-hears it still knows what it was.',
  'Never just describe a sound the listener can hear. Wrong: "NARRATOR: A shot rings out." followed by the shot. Right: [SFX: Pistol, single shot, outdoor] then "NICK: Get down!"',
  'Right: [SFX: Cell phone, ringing] then "NARRATOR: Briggs. At two in the morning."',
  'A scene background may be named once as the scene opens: [SFX: Rain, heavy, on a roof] then "NARRATOR: Rain on the windshield. Lower Wacker, four a.m."',
  'Use ONLY sounds from the SOUND CATALOG, written exactly as [SFX: <catalog name>]. If the catalog has no sound for a moment, write the moment without a sound and do not mention a sound in the narration.',
].join(' ')

export function sfxSoundAgreementRule(env: Record<string, string | undefined> = process.env, catalogNames?: string[]): string {
  if (String(env.SFX_V2 || '').trim().toLowerCase() !== 'on') return ''
  const names = catalogNames ?? SFX_CATALOG_NAMES.map((n) => n.name)
  const list = names.length ? ` SOUND CATALOG: ${names.join('; ')}.` : ''
  return `\n- ${SFX_NAMED_RULE_TEXT}${list}`
}
