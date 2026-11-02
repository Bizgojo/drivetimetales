import { AUTHOR_STYLE_SHEETS } from '@/lib/authorStyleSheets.data'

/**
 * AUTHOR-STYLE-SHEET-001 (Marc 2026-11-01): each pen-name author gets a
 * detailed style sheet, written once and kept in authors.style_sheet, instead
 * of relying on the model's memory of the real author plus a one-line note.
 * Marc asked for the ending type to be part of it.
 *
 * The writer sees the sheet in the AUTHOR VOICE block of every script prompt.
 * Samples are ORIGINAL passages in the style (never the real author's text).
 */
export type AuthorStyleSheet = {
  author: string
  model: string
  summary: string
  sentences: string
  pacing: string
  vocabulary: string
  dialogue: string
  narration: string
  openings: string
  scene_endings: string
  ending: { type: string; finale: string; episode: string }
  signature_moves: string[]
  avoid: string[]
  samples: string[]
}

const TEXT_KEYS = ['author', 'model', 'summary', 'sentences', 'pacing', 'vocabulary', 'dialogue', 'narration', 'openings', 'scene_endings'] as const

/** Problems with a sheet (empty list = usable). */
export function styleSheetProblems(raw: unknown): string[] {
  const s = raw as any
  if (!s || typeof s !== 'object') return ['missing']
  const out: string[] = []
  for (const k of TEXT_KEYS) if (typeof s[k] !== 'string' || !s[k].trim()) out.push(k)
  if (!s.ending || typeof s.ending !== 'object') out.push('ending')
  else for (const k of ['type', 'finale', 'episode']) if (typeof s.ending[k] !== 'string' || !s.ending[k].trim()) out.push(`ending.${k}`)
  for (const k of ['signature_moves', 'avoid']) if (!Array.isArray(s[k]) || s[k].length < 2) out.push(k)
  if (!Array.isArray(s.samples) || s.samples.length < 1) out.push('samples')
  return out
}

/**
 * ENDING-OPEN-001 (Marc 2026-11-01): "Some endings leave the listener hanging,
 * that type ending should only be occasionally used." Authors whose natural
 * ending is open/ambiguous may use it in about 1 story in 5 (chosen by a
 * stable hash of the story or series id); every other time the final episode
 * resolves the main question clearly. Mid-series cliffhangers are unaffected.
 */
const OPEN_ENDING = /\b(ambiguous|open|unresolved|haunting|uneasy|unsettling|unpunished|hollow)\b/i
export const OPEN_ENDING_ONE_IN = 5

export function isOpenEndingType(sheet: Pick<AuthorStyleSheet, 'ending'>): boolean {
  return OPEN_ENDING.test(`${sheet.ending.type} ${sheet.ending.finale}`)
}

export function openEndingAllowed(seed: string | null | undefined): boolean {
  const text = String(seed || '')
  if (!text) return false
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h % OPEN_ENDING_ONE_IN === 0
}

/** The sheet as prompt lines for the writer. Empty when the sheet is unusable. */
export function styleSheetPromptLines(raw: unknown, opts: { allowOpenEnding?: boolean } = {}): string[] {
  if (styleSheetProblems(raw).length) return []
  const s = raw as AuthorStyleSheet
  const endingRule = isOpenEndingType(s) && opts.allowOpenEnding
    ? '  - This story MAY end open, the way this author often does (allowed only occasionally; this is one of those times).'
    : isOpenEndingType(s)
      ? '  - House rule: do NOT leave the listener hanging this time. Keep this author\'s tone and an emotional echo, but the final episode must clearly answer the main story question.'
      : '  - House rule: the final episode never leaves the listener hanging; the main story question is clearly answered.'
  return [
    `STYLE SHEET — ${s.author} writes in the manner of ${s.model}:`,
    `- Voice: ${s.summary}`,
    `- Sentences: ${s.sentences}`,
    `- Pacing: ${s.pacing}`,
    `- Vocabulary: ${s.vocabulary}`,
    `- Dialogue: ${s.dialogue}`,
    `- Narration: ${s.narration}`,
    `- Openings: ${s.openings}`,
    `- Scene endings: ${s.scene_endings}`,
    `- Ending type: ${s.ending.type}.`,
    `  - Final episode or standalone story: ${s.ending.finale}`,
    `  - Any other series episode (must still end on a hard cliffhanger): ${s.ending.episode}`,
    endingRule,
    `- Signature moves: ${s.signature_moves.join(' | ')}`,
    `- Avoid: ${s.avoid.join(' | ')}`,
    'Original sample passages written in this style (match rhythm and texture; never reuse their words, people or places):',
    ...s.samples.map((p, i) => `  Sample ${i + 1}: "${p}"`),
  ]
}

/** The sheet for a pen-name author (case-insensitive), from Bible/style-sheets via the generated data file. */
export function styleSheetForAuthor(name: string | null | undefined): AuthorStyleSheet | null {
  const key = String(name || '').trim().toLowerCase()
  if (!key) return null
  const hit = AUTHOR_STYLE_SHEETS.find((s) => s.author.trim().toLowerCase() === key)
  return hit && !styleSheetProblems(hit).length ? hit : null
}
