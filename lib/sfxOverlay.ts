/**
 * SFX-OVERLAY-001 — extra action sound effects laid over an episode WITHOUT
 * touching its script or its recorded voices.
 *
 * Marc (2026-10-28): action stories need many more effects (gunshots, engines,
 * tire screeches, running, fighting, breaking things) than the 3 cues the
 * writer is allowed. An AI pass reads the episode's numbered lines and marks
 * the action moments; each mark is anchored BEFORE an existing line index, so
 * segment numbering never changes. ElevenLabs makes each effect once; the
 * layered mix (SFX-LAYERED-001) places them like any other effect.
 *
 * Stored per story in the audio bucket:
 *   asc3/<storyId>/sfx-overlay.json        plan (cues, anchors, files)
 *   asc3/<storyId>/sfx_overlay_<NNNN>.mp3  one file per cue (NNNN = anchor)
 *
 * Pure rules here; the I/O runner takes its clients as parameters so it can
 * run inside render-final-mix or from scripts/sfx-overlay.ts.
 */
import type { ScriptPosition } from '@/lib/scriptLineIndex'
import { isSceneBackground } from '@/lib/sfxLayeredMix'
import { phraseTokens } from '@/lib/sfxAlign'

export type OverlayCue = {
  /** the effect plays just before this script line index (or inside it, see afterWords) */
  beforeIndex: number
  /**
   * SFX-WORD-001: the sound happens INSIDE line beforeIndex, right after these
   * exact words ("Drop it or I'll"). The mix finds the moment from the line's
   * word timing; if that fails the effect plays before the line instead.
   */
  afterWords?: string
  cue: string
  durationSec: number
  file?: string
  /** SFX-REPORT-001: where the effect came from. */
  source?: { kind: 'library' | 'ai'; libraryId?: string; libraryName?: string }
}

export type OverlayPlan = {
  storyId: string
  genre: string
  createdAt: string
  model: string | null
  cues: OverlayCue[]
  rejected?: Array<{ cue: unknown; reason: string }>
  /** SFX-SOUNDMAP-001: which planner made this plan */
  planner?: 'overlay' | 'soundmap'
  /** SFX-SOUNDMAP-001: a play/skip verdict for every line that names a sound */
  decisions?: Array<{ line: number; verdict: 'play' | 'skip'; reason: string; cue?: string; missing?: boolean }>
}

/**
 * SFX-NO-CAP-001 (Marc 2026-10-31): "not be restricted … let the story and AI
 * determine the proper SFX per episode." No per-genre quota: every genre gets
 * effects wherever its story makes a sound. This is only a safety ceiling
 * against a runaway plan, not a target.
 */
export const SFX_SAFETY_CEILING = 40

/** Ceiling on extra effects for an episode (same for every genre). */
export function overlayBudgetForGenre(_genre?: string | null): number {
  return SFX_SAFETY_CEILING
}

export function overlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_OVERLAY || '').trim().toLowerCase() === 'on'
}

export function overlayFileName(beforeIndex: number, opts: { tag?: string; bed?: boolean; n?: number } = {}): string {
  const tag = opts.tag ? `${String(opts.tag).replace(/[^a-z0-9]/gi, '')}_` : ''
  const nth = opts.n && opts.n > 1 ? `_${opts.n}` : ''
  return `sfx_overlay_${tag}${String(Math.max(0, Math.floor(beforeIndex))).padStart(4, '0')}${opts.bed ? '_bed' : ''}${nth}.mp3`
}

/** The lines the planner sees: voice lines only, numbered by their real index. */
export function overlayLinesForPrompt(positions: ScriptPosition[]): Array<{ index: number; speaker: string; text: string }> {
  return positions
    .filter((p) => p.kind === 'voice' && p.isExpected)
    .map((p) => ({ index: p.index, speaker: String(p.speaker || ''), text: String(p.text || '') }))
}

export function buildOverlayPrompt(lines: Array<{ index: number; speaker: string; text: string }>, budget: number, genre: string, existingCues: string[], opts: { everyAudibleMoment?: boolean; minGap?: number; v2?: boolean } = {}): string {
  const gap = opts.minGap ?? 3
  return [
    `You are the sound designer for a ${genre || 'drama'} audio drama for drive-time listeners.`,
    'Add a sound effect at every moment in this episode where the listener should hear something: doors, footsteps, engines, tires, phones, keys, glass, gunfire, blows, sirens, crowds, weather, water, a change of place.',
    'There is no target number. Use as many or as few as THIS story needs: a quiet conversation may need none, a chase may need many.',
    ...(opts.everyAudibleMoment
      ? ['This is a fast action story: expect many effects. Miss no moment the listener could actually hear.']
      : []),
    `(Hard ceiling, never a goal: ${budget} effects.)`,
    'Each effect plays just BEFORE the numbered line you choose, so pick the line that describes or reacts to that action.',
    ...(opts.v2 ? [
      'If the sound happens in the MIDDLE of a spoken line (a shot cuts off a sentence, a door bangs while someone talks), choose that line and add "afterWords": the exact words from that line that come right before the sound, copied exactly.',
      'Scene backgrounds: at the first line of each scene whose place has a steady sound (rain, a bar crowd, traffic, a river, wind, an office hum), add ONE background effect described as a steady texture with no events, e.g. "steady rain on a car roof, constant". durationSec 10 to 20. It runs quietly under the whole scene.',
    ] : []),
    'Rules:',
    '- Only add a sound where the story clearly implies it. Never invent events.',
    `- Spread them out: never two effects within ${gap} lines of each other${opts.v2 ? ' (a scene background may share a line with one other effect)' : ''}.`,
    '- Do not duplicate the effects the script already has (listed below).',
    '- Each cue is a short, concrete description for a sound-effect generator, e.g. "three rapid pistol shots in a concrete parking garage, echoing". No dialogue, no music, no speech.',
    `- durationSec: 1 to 6 seconds (impacts 1-2, gunfire 2-3, car chase 4-6)${opts.v2 ? '; scene backgrounds 10 to 20' : ''}.`,
    opts.v2
      ? 'Return JSON only: {"cues":[{"beforeIndex":<line number>,"cue":"...","durationSec":<number>,"afterWords":"<optional>"}]}'
      : 'Return JSON only: {"cues":[{"beforeIndex":<line number>,"cue":"...","durationSec":<number>}]}',
    '',
    `Effects already in the script: ${existingCues.length ? existingCues.join(' | ') : 'none'}`,
    '',
    'Lines:',
    ...lines.map((l) => `${l.index}. ${l.speaker}: ${l.text}`),
  ].join('\n')
}

/** Keeps only valid, spaced, in-budget cues. */
export function validateOverlayCues(raw: unknown, lines: Array<{ index: number; text?: string }>, budget: number, sfxIndices: number[] = [], minGap = 3): { cues: OverlayCue[]; rejected: Array<{ cue: unknown; reason: string }> } {
  const valid = new Set(lines.map((l) => l.index))
  const textByIndex = new Map(lines.map((l) => [l.index, String(l.text || '')]))
  const rejected: Array<{ cue: unknown; reason: string }> = []
  const list = Array.isArray((raw as any)?.cues) ? (raw as any).cues : Array.isArray(raw) ? raw : []
  const accepted: OverlayCue[] = []
  const sorted = [...list].sort((a: any, b: any) => Number(a?.beforeIndex) - Number(b?.beforeIndex))
  for (const item of sorted) {
    const idx = Number((item as any)?.beforeIndex)
    const cue = String((item as any)?.cue || '').replace(/\s+/g, ' ').trim()
    const dur = Number((item as any)?.durationSec)
    if (!Number.isInteger(idx) || !valid.has(idx)) { rejected.push({ cue: item, reason: 'not a voice line index' }); continue }
    if (cue.length < 6 || cue.length > 160) { rejected.push({ cue: item, reason: 'cue length' }); continue }
    if (/\b(says?|speaks?|voice|dialogue|music|song|singing)\b/i.test(cue)) { rejected.push({ cue: item, reason: 'speech or music' }); continue }
    const bed = isSceneBackground(cue)
    // A scene background may share a line with one spot effect; same-kind effects keep their spacing.
    if (accepted.some((a) => (isSceneBackground(a.cue)) === bed && Math.abs(a.beforeIndex - idx) < minGap)) { rejected.push({ cue: item, reason: 'too close to another overlay' }); continue }
    if (!bed && sfxIndices.some((s) => Math.abs(s - idx) <= 1)) { rejected.push({ cue: item, reason: 'next to an existing script effect' }); continue }
    if (accepted.length >= budget) { rejected.push({ cue: item, reason: 'over budget' }); continue }
    const out: OverlayCue = { beforeIndex: idx, cue, durationSec: bed ? Math.min(20, Math.max(4, Number.isFinite(dur) ? dur : 12)) : Math.min(6, Math.max(1, Number.isFinite(dur) ? dur : 2.5)) }
    const afterWords = String((item as any)?.afterWords || '').replace(/\s+/g, ' ').trim()
    if (afterWords && !bed) {
      // Keep it only if those exact words are in that line (otherwise: before the line).
      const lineTokens = phraseTokens(textByIndex.get(idx) || '').join(' ')
      const want = phraseTokens(afterWords).join(' ')
      if (want && ` ${lineTokens} `.includes(` ${want} `)) out.afterWords = afterWords
    }
    accepted.push(out)
  }
  return { cues: accepted, rejected }
}

/** Overlay cues as layered-mix items: placed half a step before their anchor line. */
export function overlayBodyIndex(beforeIndex: number): number {
  return beforeIndex - 0.5
}
