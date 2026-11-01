/**
 * AUTHOR-STYLE-001 (Marc 2026-11-01, enforces canon STYLE-001): every Endless
 * Tales pen-name author writes in the manner of one real author — vocabulary,
 * sentence structure, rhythm, tone, dialogue — so stories do not all sound
 * like Claude. Never their text, plots or characters.
 *
 * 1. No story is written without a real-author model AND a style description
 *    on the author row (authorStyleGaps). Missing → the job stops and asks.
 * 2. The writer prompt states exactly what to imitate (AUTHOR_IMITATION_LINES).
 * 3. Claude's stock phrases are found in the spoken lines (findStockPhrases);
 *    the writer's self-check sends each offending line back for a rewrite.
 */
import { parseScriptPositions } from './scriptLineIndex'

export type AuthorStyleRow = {
  name?: string | null
  style_reference?: string | null
  style_description?: string | null
}

export function authorStyleGaps(row: AuthorStyleRow | null | undefined): string[] {
  if (!row) return ['author record', 'real-author model', 'style description']
  const gaps: string[] = []
  if (!String(row.style_reference || '').trim()) gaps.push('real-author model')
  if (!String(row.style_description || '').trim()) gaps.push('style description')
  return gaps
}

export function authorImitationLines(styleReference: string): string[] {
  return [
    `Write the way ${styleReference} writes. Imitate: vocabulary and word choice; sentence length and structure; rhythm and paragraph pacing; how dialogue sounds and how often characters speak; tone and attitude; what the narration notices and what it leaves out.`,
    `Never copy ${styleReference}'s actual sentences, plots, characters, settings, or titles. Style only.`,
    'Do not write in your own default voice. Avoid stock AI phrasing: no "a testament to", "something shifted", "the weight of it all", "a breath she didn\'t know she was holding", "the air was thick with", "in that moment", "the silence stretched", "barely above a whisper", "a mix of fear and relief", "it wasn\'t just X, it was Y".',
  ]
}

/** Claude's stock phrases. Each is a habit, not a ban on an idea: the line gets rewritten in the author's voice. */
export const STOCK_PHRASES: Array<{ label: string; re: RegExp }> = [
  { label: 'a testament to', re: /\btestament to\b/i },
  { label: 'something shifted', re: /\bsomething (?:shifted|shifts|changed|changes) (?:in|between|inside)\b/i },
  { label: 'the weight of it', re: /\bthe weight of (?:it all|everything|the moment|what|his words|her words|their words|the silence)\b/i },
  { label: "a breath she didn't know she was holding", re: /\bbreath (?:she|he|i|they) (?:didn'?t|did not) know (?:she|he|i|they) (?:was|were|had been) holding\b/i },
  { label: 'the air was thick with', re: /\bthe air (?:was|is|grew|hung) (?:thick|heavy) with\b/i },
  { label: 'in that moment', re: /\bin that (?:moment|instant)\b/i },
  { label: 'the silence stretched', re: /\bthe silence (?:stretched|stretches|hung|hangs|lingered|lingers|settled|settles)\b/i },
  { label: 'barely above a whisper', re: /\bbarely (?:above|more than) a whisper\b/i },
  { label: 'a mix of X and Y', re: /\ba (?:mix|mixture) of \w+ and \w+\b/i },
  { label: "it wasn't just X, it was Y", re: /\b(?:it|this|that) (?:wasn'?t|isn'?t|was not|is not) (?:just|only|merely) [^.?!]{1,60}[,;—-]\s*(?:it|this|that) (?:was|is|'s)\b/i },
  { label: 'tapestry / symphony of', re: /\b(?:tapestry|symphony) of\b/i },
  { label: 'palpable', re: /\bpalpable\b/i },
  { label: 'the world narrowed', re: /\b(?:the )?world (?:narrowed|narrows|shrank|shrinks) to\b/i },
  { label: 'unspoken words', re: /\b(?:unspoken (?:words|promise|question|understanding|truth))\b/i },
  { label: 'a beat passes', re: /\ba beat (?:passes|passed|of silence)\b/i },
  { label: 'eyes that held', re: /\beyes (?:that )?(?:held|holding) (?:a|an|the)\b/i },
  { label: 'delve / ministrations', re: /\b(?:delve[sd]?|delving|ministrations)\b/i },
  { label: 'electric between them', re: /\b(?:electric|electricity|charged) between (?:them|us)\b/i },
]

/** Spoken story lines (the parsed voice lines, not headers) that contain a stock phrase. */
export function findStockPhrases(script: string): Array<{ label: string; line: string }> {
  const out: Array<{ label: string; line: string }> = []
  for (const p of parseScriptPositions(String(script || ''))) {
    if (p.kind !== 'voice') continue
    const text = String(p.text || '')
    for (const sp of STOCK_PHRASES) {
      if (sp.re.test(text)) { out.push({ label: sp.label, line: `${p.speaker || ''}: ${text}`.trim() }); break }
    }
  }
  return out
}
