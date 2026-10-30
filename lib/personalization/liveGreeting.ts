/**
 * PERS-LIVE-001 — live, story-specific listener-name greetings.
 *
 * A series greets the listener by name in these places:
 *   1. series_intro    — after the announcement when the listener starts
 *                        Episode 1 from the beginning for the first time (or
 *                        starts the series anywhere for the first time).
 *   2. series_return   — the same moment when they have heard the series
 *                        before: a warm "welcome back" (GREETING-REPLAY-001,
 *                        Marc 2026-10-29).
 *   3. finale_signoff  — right after the finale's last scene, BEFORE Belle's
 *                        closing credits (FINALE-SIGNOFF-ORDER-001).
 *
 * The greeting TEXT is written once per series (one LLM call, validated,
 * cached in storage as a template with a [NAME] slot). The greeting AUDIO is
 * made once per series + first name (one Belle TTS call, cached in storage),
 * so every later listener with the same first name reuses it.
 *
 * This file holds the pure rules (no I/O) so they are unit-testable.
 * liveGreetingService.ts does the storage / LLM / TTS work.
 */

export type LiveGreetingKind = 'series_intro' | 'series_return' | 'finale_signoff'

export const LIVE_GREETING_KINDS: LiveGreetingKind[] = ['series_intro', 'series_return', 'finale_signoff']

export const NAME_SLOT = '[NAME]'

export type LiveGreetingContext = {
  seriesTitle: string
  genre?: string | null
  totalEpisodes?: number | null
  seriesDescription?: string | null
  /** The finale's baked Belle outro text (finale_signoff only) — not to be repeated. */
  finaleOutroText?: string | null
}

export function isLiveGreetingKind(value: unknown): value is LiveGreetingKind {
  return value === 'series_intro' || value === 'series_return' || value === 'finale_signoff'
}

// ---------------------------------------------------------------------------
// Rollout switch
// ---------------------------------------------------------------------------
//
// LIVE_GREETINGS=off (or unset)  → feature off, existing behavior everywhere.
// LIVE_GREETINGS=allowlist       → only user ids in LIVE_GREETINGS_USER_IDS.
// LIVE_GREETINGS=on              → every signed-in listener with a first name.

export type LiveGreetingMode = 'off' | 'allowlist' | 'on'

export function liveGreetingMode(env: Record<string, string | undefined> = process.env): LiveGreetingMode {
  const raw = String(env.LIVE_GREETINGS || '').trim().toLowerCase()
  if (raw === 'on') return 'on'
  if (raw === 'allowlist') return 'allowlist'
  return 'off'
}

export function liveGreetingEnabledFor(
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  const id = String(userId || '').trim()
  if (!id) return false
  const mode = liveGreetingMode(env)
  if (mode === 'on') return true
  if (mode === 'off') return false
  const allow = String(env.LIVE_GREETINGS_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allow.includes(id)
}

// ---------------------------------------------------------------------------
// Names, paths, URLs
// ---------------------------------------------------------------------------

/** Display form used in the spoken line: "marc" → "Marc". Letters, apostrophe, hyphen only. */
export function spokenFirstName(value: unknown): string {
  const cleaned = String(value ?? '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-zÀ-ɏ'-]/g, '')
    .slice(0, 30)
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
}

/** Storage-safe key for a first name: "Mary-Jo" → "mary-jo". */
export function nameSlug(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function safeId(value: string): string {
  return String(value || '').replace(/[^A-Za-z0-9-]/g, '')
}

export function greetingTemplatePath(seriesId: string, kind: LiveGreetingKind): string {
  return `live-greetings/${safeId(seriesId)}/${kind}/template.json`
}

export function greetingClipPath(seriesId: string, kind: LiveGreetingKind, slug: string): string {
  return `live-greetings/${safeId(seriesId)}/${kind}/${slug}.mp3`
}

/** Same-origin URL the player queue uses; the route resolves it to the cached clip. */
export function liveGreetingClipRoute(storyId: string, kind: LiveGreetingKind): string {
  return `/api/personal-greeting/clip?storyId=${encodeURIComponent(storyId)}&kind=${kind}`
}

export function fillGreeting(template: string, name: string): string {
  return String(template || '').split(NAME_SLOT).join(name)
}

// ---------------------------------------------------------------------------
// Writing the template
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

function episodeCountWords(count?: number | null): string | null {
  const n = Number(count)
  if (!Number.isInteger(n) || n < 2 || n >= NUMBER_WORDS.length) return null
  return NUMBER_WORDS[n]
}

export function buildGreetingPrompt(kind: LiveGreetingKind, ctx: LiveGreetingContext): string {
  const title = String(ctx.seriesTitle || '').trim()
  const genre = String(ctx.genre || '').trim() || 'audio drama'
  const description = String(ctx.seriesDescription || '').trim()
  const countWords = episodeCountWords(ctx.totalEpisodes)

  const shared = [
    'You write one short line for Belle, the warm, friendly host of Endless Tales audio stories.',
    'Belle speaks directly to one listener. Write the line with the literal placeholder [NAME] where the listener\'s first name goes.',
    'Rules:',
    '- Exactly one [NAME], used once.',
    '- 14 to 32 words. One or two sentences. Plain spoken English, like a friend talking.',
    '- No digits; spell out any number.',
    '- No quotation marks, no emojis, no stage directions, no brackets other than [NAME].',
    '- Do not name the author or narrator. Do not mention Endless Tales.',
    '- Output only the line, nothing else.',
  ]

  if (kind === 'series_intro') {
    return [
      ...shared,
      `- [NAME] must be within the first six words.`,
      '- The listener may be starting at any episode, so talk about the series as a whole. Do not describe a specific scene or reveal any plot twist or ending.',
      '- Do not say "episode one" or "first episode". Do not say goodbye.',
      '',
      `Series: ${title}`,
      `Genre: ${genre}`,
      description ? `What it is about: ${description}` : '',
      '',
      'Example of the tone (different story): [NAME], you picked a good one. A small town, a missing girl, and a sheriff who will not let it go. Settle in.',
    ].filter((line) => line !== '').join('\n')
  }

  if (kind === 'series_return') {
    return [
      ...shared,
      `- [NAME] must be within the first six words.`,
      '- The listener has heard this series before and is starting it again from the beginning. Welcome them back warmly and say, in a happy way, that they came back for it again. Make them feel good about choosing it again.',
      '- Do not reveal any plot twist or ending, even though they know it. Do not say "episode one" or "first episode". Do not say goodbye.',
      '- The line must include one of these words: back, again, return, another.',
      '',
      `Series: ${title}`,
      `Genre: ${genre}`,
      description ? `What it is about: ${description}` : '',
      '',
      'Example of the tone (different story): [NAME], welcome back! You came back for another ride through this one, and I love that. Settle in, it is even better the second time.',
    ].filter((line) => line !== '').join('\n')
  }

  return [
    ...shared,
    '- This plays the moment the final scene of the final episode ends, just before Belle reads the closing credits. It is a personal thank-you and goodbye to the listener.',
    '- Do not repeat the credits. Do not promise a next episode or a sequel. Do not reveal or retell the ending.',
    '',
    `Series: ${title}`,
    `Genre: ${genre}`,
    countWords ? `Length: ${countWords} episodes` : '',
    ctx.finaleOutroText ? `What Belle says right after this line (do not repeat it): ${String(ctx.finaleOutroText).trim()}` : '',
    '',
    'Example of the tone (different story): [NAME], thank you for riding along all five episodes. It meant a lot having you here. Come find me when you are ready for the next one.',
  ].filter((line) => line !== '').join('\n')
}

export function cleanGreetingCandidate(raw: string): string {
  return String(raw || '')
    .replace(/^\s*(?:belle(?:\s*b)?\s*:)\s*/i, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordCount(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

/** Returns a list of problems; empty means the template is usable. */
export function validateGreetingTemplate(kind: LiveGreetingKind, text: string): string[] {
  const issues: string[] = []
  const t = String(text || '').trim()
  if (!t) return ['empty']
  const slots = t.split(NAME_SLOT).length - 1
  if (slots !== 1) issues.push(`needs exactly one ${NAME_SLOT} (found ${slots})`)
  const words = wordCount(t)
  if (words < 14 || words > 32) issues.push(`word count ${words} outside 14-32`)
  if (/\d/.test(t)) issues.push('contains digits')
  if (/[\n\r]/.test(t)) issues.push('contains a line break')
  if (/["“”]/.test(t)) issues.push('contains quotation marks')
  const withoutSlot = t.split(NAME_SLOT).join('')
  if (/[\[\]{}<>*#_]/.test(withoutSlot)) issues.push('contains brackets or markup')
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) issues.push('contains emoji')
  if (/endless tales/i.test(t)) issues.push('mentions Endless Tales')
  if (!/[.!?]$/.test(t)) issues.push('does not end with punctuation')

  if (kind === 'series_intro' || kind === 'series_return') {
    const firstSix = t.split(/\s+/).slice(0, 6).join(' ')
    if (slots === 1 && !firstSix.includes(NAME_SLOT)) issues.push(`${NAME_SLOT} not within the first six words`)
    if (/\b(episode\s+one|first\s+episode|goodbye|farewell|the\s+end)\b/i.test(t)) issues.push('intro mentions a specific episode or says goodbye')
    if (kind === 'series_return' && !/\b(back|again|return(?:ing|ed)?|another)\b/i.test(t)) issues.push('welcome-back line does not acknowledge the return')
  } else {
    if (/\b(next\s+episode|sequel|season\s+two|stay\s+tuned)\b/i.test(t)) issues.push('sign-off promises more episodes')
  }
  return issues
}

/** Deterministic safe line used when the writer cannot produce a valid one. */
export function fallbackGreetingTemplate(kind: LiveGreetingKind, ctx: LiveGreetingContext): string {
  const title = String(ctx.seriesTitle || '').trim() || 'this story'
  if (kind === 'series_return') {
    return `${NAME_SLOT}, welcome back to ${title}. I love that you came back for another listen. Settle in, it is even better the second time.`
  }
  if (kind === 'series_intro') {
    return `${NAME_SLOT}, I am so glad you picked ${title}. Get comfortable, turn it up a little, and let it take you somewhere for a while.`
  }
  const countWords = episodeCountWords(ctx.totalEpisodes)
  const span = countWords ? `all ${countWords} episodes of ${title}` : `every episode of ${title}`
  return `${NAME_SLOT}, thank you for riding along with me through ${span}. It meant a lot having you here, and I will be right here when you want another.`
}
