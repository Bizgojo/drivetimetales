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

export type OverlayCue = {
  /** the effect plays just before this script line index */
  beforeIndex: number
  cue: string
  durationSec: number
  file?: string
}

export type OverlayPlan = {
  storyId: string
  genre: string
  createdAt: string
  model: string | null
  cues: OverlayCue[]
  rejected?: Array<{ cue: unknown; reason: string }>
}

/** How many extra effects an episode gets, by genre. 0 = no overlay. */
export function overlayBudgetForGenre(genre: string | null | undefined): number {
  const g = String(genre || '').toLowerCase()
  if (/thriller|action|crime|adventure|western|\bwar\b|heist|\bspy\b/.test(g)) return 10
  if (/horror/.test(g)) return 8
  if (/sci-?fi|science fiction/.test(g)) return 6
  if (/mystery|suspense/.test(g)) return 4
  return 0
}

export function overlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_OVERLAY || '').trim().toLowerCase() === 'on'
}

export function overlayFileName(beforeIndex: number): string {
  return `sfx_overlay_${String(Math.max(0, Math.floor(beforeIndex))).padStart(4, '0')}.mp3`
}

/** The lines the planner sees: voice lines only, numbered by their real index. */
export function overlayLinesForPrompt(positions: ScriptPosition[]): Array<{ index: number; speaker: string; text: string }> {
  return positions
    .filter((p) => p.kind === 'voice' && p.isExpected)
    .map((p) => ({ index: p.index, speaker: String(p.speaker || ''), text: String(p.text || '') }))
}

export function buildOverlayPrompt(lines: Array<{ index: number; speaker: string; text: string }>, budget: number, genre: string, existingCues: string[]): string {
  return [
    `You are the sound designer for a ${genre || 'drama'} audio drama for drive-time listeners.`,
    `Choose up to ${budget} sound effects to add to this episode at its action moments: gunshots, engines, tire screeches, crashes, running footsteps, fights and blows, breaking glass or wood, doors kicked in, sirens, phones, weather, crowds.`,
    'Each effect plays just BEFORE the numbered line you choose, so pick the line that describes or reacts to that action.',
    'Rules:',
    '- Only add a sound where the story clearly implies it. Never invent events.',
    '- Spread them out: never two effects within 3 lines of each other.',
    '- Do not duplicate the effects the script already has (listed below).',
    '- Each cue is a short, concrete description for a sound-effect generator, e.g. "three rapid pistol shots in a concrete parking garage, echoing". No dialogue, no music, no speech.',
    '- durationSec: 1 to 6 seconds (impacts 1-2, gunfire 2-3, car chase 4-6).',
    'Return JSON only: {"cues":[{"beforeIndex":<line number>,"cue":"...","durationSec":<number>}]}',
    '',
    `Effects already in the script: ${existingCues.length ? existingCues.join(' | ') : 'none'}`,
    '',
    'Lines:',
    ...lines.map((l) => `${l.index}. ${l.speaker}: ${l.text}`),
  ].join('\n')
}

/** Keeps only valid, spaced, in-budget cues. */
export function validateOverlayCues(raw: unknown, lines: Array<{ index: number }>, budget: number, sfxIndices: number[] = []): { cues: OverlayCue[]; rejected: Array<{ cue: unknown; reason: string }> } {
  const valid = new Set(lines.map((l) => l.index))
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
    if (accepted.some((a) => Math.abs(a.beforeIndex - idx) < 3)) { rejected.push({ cue: item, reason: 'too close to another overlay' }); continue }
    if (sfxIndices.some((s) => Math.abs(s - idx) <= 1)) { rejected.push({ cue: item, reason: 'next to an existing script effect' }); continue }
    if (accepted.length >= budget) { rejected.push({ cue: item, reason: 'over budget' }); continue }
    accepted.push({ beforeIndex: idx, cue, durationSec: Math.min(6, Math.max(1, Number.isFinite(dur) ? dur : 2.5)) })
  }
  return { cues: accepted, rejected }
}

/** Overlay cues as layered-mix items: placed half a step before their anchor line. */
export function overlayBodyIndex(beforeIndex: number): number {
  return beforeIndex - 0.5
}
