/**
 * MIX-V4-001 (Marc 2026-11-01, stage 2) — two decisions Claude makes at mix
 * time, from the finished script, without changing the script, the voices or
 * which sounds play:
 *
 *   1. TENSION: where the story's tension changes and how high it is (1-5).
 *      The music bed under the voices follows it (still always under them).
 *   2. REACTIONS: for each spot effect, does the very next line react to it
 *      ("[gunshot]" → "Get down!")? Reaction sounds get a short beat (about
 *      1 second) before the line; every other spot effect plays under the
 *      start of the line with no real pause.
 *
 * One Claude call per story, cached at asc3/<id>/mix-plan.json (test copies:
 * mix-plan-<tag>.json). If the call fails the mix still runs: flat music bed
 * and a word-based guess for reactions.
 *
 * Behind MIX_V4=on (or runRenderFinalMix opts.mixV4). Needs stage 1 (MIX-V3).
 */
import type { ScriptPosition } from '@/lib/scriptLineIndex'

export type TensionMark = { fromLine: number; level: number }
export type MixPlan = {
  createdAt: string
  model: string | null
  tension: TensionMark[]
  /** effect id → the next line reacts to it */
  reactions: Record<string, boolean>
  fallback?: boolean
}
export type MixEffect = { id: string; cue: string; before: string; after: string }

/** Music bed level for each tension (MUSIC-002 scale; the old flat bed was 0.13). */
export const TENSION_GAIN: Record<number, number> = { 1: 0.1, 2: 0.12, 3: 0.14, 4: 0.17, 5: 0.2 }
export const MAX_TENSION_MARKS = 14

export function mixV4Enabled(flag?: boolean, env: Record<string, string | undefined> = process.env): boolean {
  if (typeof flag === 'boolean') return flag
  return String(env.MIX_V4 || '').trim().toLowerCase() === 'on'
}

/** Stable id for an effect from its body index: script effect = s<idx>, overlay = o<line>. */
export function effectId(bodyIdx: number): string {
  return Number.isInteger(bodyIdx) ? `s${bodyIdx}` : `o${Math.round(bodyIdx + 0.5)}`
}

/** Fallback guess: a sudden, loud sound that people would react to. */
const REACTION_HINT = /\b(gun ?shots?|shots? (?:ring|fired)|pistol|rifle|shotgun|explosion|explodes|blast|crash(?:es|ing)?|scream(?:s|ing)?|shatter(?:s|ing)?|bang(?:s|ing)?|slam(?:s|med)?|thunder ?clap|siren|alarm|knock(?:s|ing)? (?:on|at) the door|glass breaking)\b/i
export function guessReaction(cue: string): boolean {
  return REACTION_HINT.test(String(cue || ''))
}

export function buildMixPlanPrompt(lines: Array<{ index: number; speaker: string; text: string }>, effects: MixEffect[]): string {
  return [
    'You are the re-recording mixer for an audio drama. Two jobs. Reply with JSON only.',
    '',
    'JOB 1 — TENSION. Mark where the tension of the story changes, so the background music can rise and fall with it.',
    '- Give the line number where each stretch starts and its tension from 1 (calm, warm, quiet) to 5 (peak danger or emotion).',
    `- The first mark must be at the first line. Mark only real changes of scene or mood: usually 3 to 8 marks, never more than ${MAX_TENSION_MARKS}.`,
    '',
    'JOB 2 — REACTIONS. For each sound effect below, answer: does the line right AFTER it react to hearing that sound?',
    '- true: a character responds to the sound itself ("[gunshot]" then "Get down!", "[knock at the door]" then "Who is it?").',
    '- false: the sound simply happens while the story goes on (a door opening as someone walks in, footsteps, a car starting).',
    '',
    'Return exactly: {"tension":[{"fromLine":<n>,"level":<1-5>}],"reactions":{"<effect id>":true|false}}',
    '',
    'EFFECTS:',
    ...(effects.length ? effects.map((e) => `${e.id}: [${e.cue}] | before: "${e.before.slice(0, 160)}" | after: "${e.after.slice(0, 160)}"`) : ['(none)']),
    '',
    'SCRIPT LINES:',
    ...lines.map((l) => `${l.index}. ${l.speaker}: ${l.text}`),
  ].join('\n')
}

/** Keeps valid marks (in order, deduped, first at the first line) and answers for known effects only. */
export function validateMixPlan(raw: unknown, lineIndices: number[], effects: MixEffect[]): { tension: TensionMark[]; reactions: Record<string, boolean> } {
  const lines = [...lineIndices].sort((a, b) => a - b)
  const first = lines[0] ?? 0
  const valid = new Set(lines)
  const list = Array.isArray((raw as any)?.tension) ? (raw as any).tension : []
  const marks: TensionMark[] = []
  for (const m of list) {
    const fromLine = Number(m?.fromLine)
    const level = Math.round(Number(m?.level))
    if (!Number.isFinite(fromLine) || !valid.has(fromLine)) continue
    if (!(level >= 1 && level <= 5)) continue
    marks.push({ fromLine, level })
  }
  marks.sort((a, b) => a.fromLine - b.fromLine)
  const deduped: TensionMark[] = []
  for (const m of marks) {
    const last = deduped[deduped.length - 1]
    if (last && last.fromLine === m.fromLine) { last.level = m.level; continue }
    if (last && last.level === m.level) continue
    deduped.push({ ...m })
  }
  if (deduped.length && deduped[0].fromLine !== first) deduped[0].fromLine = first
  const tension = deduped.slice(0, MAX_TENSION_MARKS)
  const rawReactions = (raw as any)?.reactions && typeof (raw as any).reactions === 'object' ? (raw as any).reactions : {}
  const reactions: Record<string, boolean> = {}
  for (const e of effects) {
    const v = rawReactions[e.id]
    reactions[e.id] = typeof v === 'boolean' ? v : guessReaction(e.cue)
  }
  return { tension, reactions }
}

export function fallbackMixPlan(effects: MixEffect[]): MixPlan {
  const reactions: Record<string, boolean> = {}
  for (const e of effects) reactions[e.id] = guessReaction(e.cue)
  return { createdAt: new Date().toISOString(), model: null, tension: [], reactions, fallback: true }
}

/**
 * Tension marks → music levels on the story timeline (seconds from the first
 * line). Each mark starts when the first voice line at or after its line starts.
 */
export function sceneLevelsFromTension(tension: TensionMark[], voiceStarts: Array<{ idx: number; start: number }>): Array<{ atSec: number; level: number }> {
  const voices = [...voiceStarts].sort((a, b) => a.idx - b.idx)
  const out: Array<{ atSec: number; level: number }> = []
  for (const m of tension) {
    const v = voices.find((x) => x.idx >= m.fromLine)
    if (!v) continue
    const level = TENSION_GAIN[m.level] ?? TENSION_GAIN[3]
    const atSec = out.length === 0 ? 0 : v.start
    const last = out[out.length - 1]
    if (last && atSec <= last.atSec) { last.level = level; continue }
    out.push({ atSec, level })
  }
  return out
}

/** The voice lines and effects Claude needs, from the parsed script and the body items. */
export function mixPlanInputs(positions: ScriptPosition[], sfxItems: Array<{ idx: number; cue: string; anchored?: boolean }>): { lines: Array<{ index: number; speaker: string; text: string }>; effects: MixEffect[] } {
  const lines = positions
    .filter((p) => p.kind === 'voice' && p.isExpected)
    .map((p) => ({ index: p.index, speaker: String(p.speaker || ''), text: String(p.text || '') }))
  const effects: MixEffect[] = []
  for (const s of sfxItems) {
    if (s.anchored) continue
    const before = [...lines].reverse().find((l) => l.index < s.idx)
    const after = lines.find((l) => l.index > s.idx)
    effects.push({ id: effectId(s.idx), cue: s.cue, before: before?.text || '', after: after?.text || '' })
  }
  return { lines, effects }
}

type Store = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>
      upload: (path: string, body: Buffer, opts: Record<string, unknown>) => Promise<{ error: unknown }>
    }
  }
}

export function mixPlanPath(storyId: string, tag?: string | null): string {
  const t = tag ? `-${String(tag).replace(/[^a-z0-9]/gi, '')}` : ''
  return `asc3/${storyId}/mix-plan${t}.json`
}

/** Cached plan, or one Claude call. Never throws: falls back to a flat bed + word guesses. */
export async function ensureMixPlan(params: {
  db: Store
  storyId: string
  positions: ScriptPosition[]
  sfxItems: Array<{ idx: number; cue: string; anchored?: boolean }>
  tag?: string | null
  log?: (line: string) => void
}): Promise<MixPlan> {
  const log = params.log || (() => {})
  const { lines, effects } = mixPlanInputs(params.positions, params.sfxItems)
  const path = mixPlanPath(params.storyId, params.tag)
  try {
    const cached = await params.db.storage.from('audio').download(path)
    if (cached?.data) {
      const plan = JSON.parse(await (cached.data as Blob).text()) as MixPlan
      if (plan && Array.isArray(plan.tension) && plan.reactions && effects.every((e) => e.id in plan.reactions)) return plan
    }
  } catch { /* make a new one */ }
  try {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY missing')
    const model = process.env.MIX_PLAN_MODEL || process.env.SFX_OVERLAY_MODEL || 'claude-sonnet-4-6'
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: key })
    const msg = await anthropic.messages.create({ model, max_tokens: 4000, messages: [{ role: 'user', content: buildMixPlanPrompt(lines, effects) }] })
    const text = msg.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('')
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const { tension, reactions } = validateMixPlan(parsed, lines.map((l) => l.index), effects)
    const plan: MixPlan = { createdAt: new Date().toISOString(), model, tension, reactions }
    await params.db.storage.from('audio').upload(path, Buffer.from(JSON.stringify(plan, null, 2)), { contentType: 'application/json', upsert: true })
    log(`  MIX-V4-001 plan: ${tension.length} tension marks [${tension.map((t) => `${t.fromLine}:${t.level}`).join(' ')}], ${Object.values(reactions).filter(Boolean).length}/${effects.length} effects get a beat`)
    return plan
  } catch (err) {
    log(`  MIX-V4-001 plan unavailable (${err instanceof Error ? err.message : String(err)}); flat music bed, reactions guessed from the sound`)
    return fallbackMixPlan(effects)
  }
}
