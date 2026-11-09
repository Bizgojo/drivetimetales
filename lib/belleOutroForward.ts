// BELLE-OUTRO-FORWARD-001 — Marc, Nov 8, 2026 (docs/PIPELINE-CANON.md
// BELLE-OUTRO-FORWARD RULE; docs/canon/CANON-04).
//
// Non-final series outro = exactly two sentences:
//   1. one sentence recapping this episode;
//   2. a promotion of the next episode that says its number and the series
//      name: In Episode Four of "Rerouted", ...
// Finale and standalone outros never point to another episode, credit the
// story ("You've been listening to ... by ..., read by ..., an Endless Tales
// Original"), never mention time of day, and stay at 42 words or fewer.
//
// This module is the ONE place the rule lives: the writer prompts, the writer
// self-check, the pre-review check, the publish gate and the voice-stage check
// all use it, so they cannot drift apart again (they did: the old outro rule
// asked for "reflection" and "next episode" wording, which this replaces).

import { episodeNumberNamedIn, normalizeNumberWords } from './numberWords'

export const BELLE_OUTRO_MAX_WORDS = 42

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** 4 → "Four", 23 → "Twenty-Three" (episode numbers are spoken in words). */
export function episodeNumberWords(n: number): string {
  const v = Math.trunc(n)
  if (!Number.isFinite(v) || v < 0 || v > 99) return String(n)
  const raw = v < 20 ? ONES[v] : TENS[Math.floor(v / 10)] + (v % 10 ? '-' + ONES[v % 10] : '')
  return raw.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')
}

const clean = (s: string) => String(s || '')
  .replace(/^["'“”]+|["'“”]+$/g, '')
  .replace(/^(ANNOUNCER|BELLE B|SANDY|Belle B|Belle)\s*:\s*/i, '')
  .replace(/\[LISTENER_NAME\]/g, 'friend')
  .replace(/\s+/g, ' ')
  .trim()

function norm(s: string): string {
  return normalizeNumberWords(String(s || ''))
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesName(text: string, name: string): boolean {
  const needle = norm(name)
  return Boolean(needle) && ` ${norm(text)} `.includes(` ${needle} `)
}

export function wordCount(text: string): number {
  return clean(text).split(/\s+/).filter(Boolean).length
}

/** Sentences, ignoring ends inside quotes ("...," / "...?"). */
export function sentences(text: string): string[] {
  const t = clean(text)
  if (!t) return []
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    cur += ch
    if (ch === '"' || ch === '“' || ch === '”') {
      inQuote = !inQuote
      // A quote that closes on . ! or ? ends the sentence when a capital follows: He said "Run." Then...
      if (!inQuote && /[.!?]/.test(t[i - 1] || '') && /^\s+[A-Z]/.test(t.slice(i + 1))) { out.push(cur.trim()); cur = '' }
      continue
    }
    if (!inQuote && /[.!?]/.test(ch)) {
      let j = i + 1
      while (j < t.length && /["'”’)]/.test(t[j])) { cur += t[j]; j++ }
      i = j - 1
      if (j >= t.length || /\s/.test(t[j])) { if (cur.trim()) out.push(cur.trim()); cur = '' }
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const TIME_OF_DAY = /\b(tonight|this evening|this morning|this afternoon|late[- ]night|late drive|morning drive|night drive|midnight|after dark|at this hour|this late|good (morning|evening|night))\b/i

export function mentionsTimeOfDay(text: string): boolean {
  return TIME_OF_DAY.test(clean(text))
}

export type NonFinaleOutroContext = {
  seriesName: string
  /** Number of the episode being promoted (current episode + 1). */
  nextEpisodeNumber: number | null
  author?: string
  narrator?: string
}

/**
 * Issues with a non-final series outro under BELLE-OUTRO-FORWARD-001.
 * Empty array = passes. Author/narrator credit and "sounds final" checks stay
 * with each caller (they already exist there).
 */
export function checkNonFinaleOutro(outro: string, ctx: NonFinaleOutroContext): string[] {
  const issues: string[] = []
  const text = clean(outro)
  if (!text) return ['outro text is missing']
  const parts = sentences(text)
  if (parts.length !== 2) {
    issues.push(`non-finale outro must be exactly two sentences: one recap sentence, then the next episode by number (found ${parts.length})`)
  }
  const last = parts[parts.length - 1] || ''
  const first = parts.length > 1 ? parts[0] : ''
  const n = ctx.nextEpisodeNumber
  if (n && n > 0) {
    if (!episodeNumberNamedIn(last, n) || !/\bepisode\b/i.test(last)) {
      issues.push(`non-finale outro must end by promoting the next episode by number ("Episode ${episodeNumberWords(n)}")`)
    }
    if (first && /\bepisode\b/i.test(first)) {
      issues.push('non-finale outro recap sentence must not promote an episode (the second sentence does that)')
    }
  } else if (!/\bepisode\b/i.test(last)) {
    issues.push('non-finale outro must end by promoting the next episode by number')
  }
  if (ctx.seriesName && !includesName(last, ctx.seriesName)) {
    issues.push(`non-finale outro must name the series "${ctx.seriesName}" when it promotes the next episode`)
  }
  if (/\bendless tales original\b/i.test(text)) issues.push('non-finale outro must not say "an Endless Tales original"')
  if (mentionsTimeOfDay(text)) issues.push('outro must not mention time of day')
  const words = wordCount(text)
  if (words > BELLE_OUTRO_MAX_WORDS) {
    issues.push(`outro is too long (${words} words; max ${BELLE_OUTRO_MAX_WORDS})`)
  }
  return issues
}

/** Extra checks every finale and standalone outro gets (credits are checked by callers). */
export function checkClosingOutroExtras(outro: string): string[] {
  const issues: string[] = []
  const text = clean(outro)
  if (mentionsTimeOfDay(text)) issues.push('outro must not mention time of day')
  const words = wordCount(text)
  if (words > BELLE_OUTRO_MAX_WORDS) issues.push(`outro is too long (${words} words; max ${BELLE_OUTRO_MAX_WORDS})`)
  return issues
}

/** Writer-prompt wording for a non-final series outro. */
export function nonFinaleOutroPrompt(opts: { seriesName: string; nextEpisodeNumber: number; author?: string; narrator?: string }): string {
  const next = episodeNumberWords(opts.nextEpisodeNumber)
  const series = opts.seriesName || 'the series'
  const credits = [opts.author && `the author "${opts.author}"`, opts.narrator && `the narrator "${opts.narrator}"`].filter(Boolean).join(' or ')
  return `The Belle B outro is EXACTLY TWO SENTENCES (Marc's BELLE-OUTRO-FORWARD rule): (1) ONE sentence recapping what happened in THIS episode; (2) ONE sentence promoting the next episode that says "Episode ${next}" and the series name "${series}", for example: In Episode ${next} of "${series}", <what the listener will find out>. Never more than one recap sentence, never end on the recap, never look back instead of forward. LENGTH: sentence 1 at most 18 words, sentence 2 at most 20 words, about 35 words in total; COUNT THE WORDS before you finish, because 42 is a hard limit and anything longer is rejected. Example (26 words): Daniel heard his own name on the tape, and so did the men outside. In Episode Four of "Rerouted," the voice finally says who killed Sarah. ${credits ? `Do NOT name ${credits}. ` : ''}Do not say "an Endless Tales original", never mention time of day, never sound like the series is over (no end, ended, final, concludes, conclusion, complete). At most ${BELLE_OUTRO_MAX_WORDS} words.`
}

/** Writer-prompt wording for a finale or standalone outro. */
export function closingOutroPrompt(opts: { title: string; author: string; narrator?: string }): string {
  const read = opts.narrator ? `, read by ${opts.narrator}` : ''
  return `The Belle B outro closes the story and never points to another episode or story. It ends with the credit: You've been listening to "${opts.title}" by ${opts.author}${read}, an Endless Tales Original. One short closing sentence (at most 12 words) may come before the credit. Never mention time of day. At most ${BELLE_OUTRO_MAX_WORDS} words in total; COUNT THE WORDS before you finish.`
}
