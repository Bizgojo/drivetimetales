import { checkNonFinaleOutro, checkClosingOutroExtras, BELLE_OUTRO_MAX_WORDS } from './belleOutroForward'
/**
 * VOICE-BELLE-RULES-001 — the voice step's own Belle line rules, moved
 * verbatim from app/api/admin/generate-voices/route.ts so the series writer
 * can run the exact same check (job 60761b4a, 2026-10-26: the voice step
 * found errors in the finale's Belle lines that no earlier check runs,
 * auto-replaced the outro with a template that drops the narrator credit,
 * then refused it — BELLE_POSTREPAIR_CONFORMANCE_FAILED). Behaviour unchanged.
 */

export const BELLE_GENERIC_PATTERNS = [
  /\bfor your listening pleasure\b/i,
  /\bi am pleased to present\b/i,
  /\bare you ready\b/i,
  /\bsit back\b/i,
  /\brelax and enjoy\b/i,
  /\btonight'?s (story|episode)\b/i,
  /\btoday'?s (story|episode)\b/i,
]
export const BELLE_EXACT_OR_CREEPY_TIME_PATTERNS = [
  /\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/i,
  /\bit'?s\s+\d{1,2}\b/i,
  /\bwhere you are right now\b/i,
  /\byour exact location\b/i,
  /\byou'?re driving near\b/i,
  /\bi know where you\b/i,
]


export type BelleEpisodeState = 'standalone' | 'series_first' | 'series_non_final' | 'series_finale'

export type BelleValidationContext = {
  storyId: string
  title: string
  author: string
  seriesName: string
  episodeNumber: number | null
  seriesTotal: number | null
  isFinale: boolean
  episodeState: BelleEpisodeState
}

export function cleanBelleText(value: string): string {
  return String(value || '')
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '')
    .replace(/^(ANNOUNCER|BELLE B|SANDY|Belle B|Belle)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordCount(value: string): number {
  return cleanBelleText(value).split(/\s+/).filter(Boolean).length
}

export function parseHeaderValue(script: string, key: string): string {
  const match = script.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*([^\\r\\n]*)`, 'im'))
  return match?.[1]?.trim() || ''
}

export function belleEpisodeState(ctx: {
  seriesName?: string | null
  episodeNumber?: number | null
  seriesTotal?: number | null
  isFinale?: boolean | null
}): BelleEpisodeState {
  if (!ctx.seriesName) return 'standalone'
  // PHASED-SERIES-002b: an explicit isFinale=false wins over the episode count.
  if (ctx.isFinale === true || (ctx.isFinale !== false && ctx.seriesTotal && ctx.episodeNumber && ctx.episodeNumber >= ctx.seriesTotal)) return 'series_finale'
  if (!ctx.episodeNumber || ctx.episodeNumber <= 1) return 'series_first'
  return 'series_non_final'
}

export function buildBelleValidationContext(storyRow: any, script: string, storyId: string): BelleValidationContext {
  const title = String(storyRow?.title || parseHeaderValue(script, 'EPISODE_TITLE') || parseHeaderValue(script, 'TITLE') || 'this story').trim()
  const author = String(storyRow?.author || parseHeaderValue(script, 'AUTHOR') || '').trim()
  const scriptSeries = parseHeaderValue(script, 'SERIES')
  const seriesName = String(storyRow?.series_name || scriptSeries || '').trim()
  const episodeNumber = Number(storyRow?.episode_number || storyRow?.series_episode_number || parseHeaderValue(script, 'EPISODE') || 0) || null
  const seriesTotal = Number(storyRow?.series_total || storyRow?.series_total_episodes || parseHeaderValue(script, 'SERIES_TOTAL_EPISODES') || 0) || null
  const scriptFinale = parseHeaderValue(script, 'SERIES_IS_FINALE').toLowerCase()
  // PHASED-SERIES-002: explicit series_is_finale=false on the row wins over the count.
  const isFinale = storyRow?.series_is_finale === false
    ? false
    : storyRow?.series_is_finale === true || scriptFinale === 'true' || Boolean(seriesTotal && episodeNumber && episodeNumber >= seriesTotal)
  return {
    storyId,
    title,
    author,
    seriesName,
    episodeNumber,
    seriesTotal,
    isFinale,
    episodeState: belleEpisodeState({ seriesName, episodeNumber, seriesTotal, isFinale }),
  }
}

export function validateBelleLine(kind: 'intro' | 'outro', text: string, ctx: BelleValidationContext): string[] {
  const cleaned = cleanBelleText(text)
  const lower = cleaned.toLowerCase()
  const errors: string[] = []
  const words = wordCount(cleaned)

  if (!cleaned) errors.push(`${kind} is empty`)
  if (/^(narrator|character|announcer|sandy|belle b)\s*:/i.test(text)) errors.push(`${kind} includes a speaker label`)
  if (BELLE_GENERIC_PATTERNS.some(pattern => pattern.test(cleaned))) errors.push(`${kind} uses generic or repetitive Belle wording`)
  if (BELLE_EXACT_OR_CREEPY_TIME_PATTERNS.some(pattern => pattern.test(cleaned))) errors.push(`${kind} uses exact or creepy listener context`)
  if (/\b(spoiler|reveals?|revealed|killer is|turns out|will die|dies in the next)\b/i.test(cleaned)) errors.push(`${kind} risks spoiler language`)
  if (kind === 'intro' && words > 38) errors.push(`announcement is too long for a clean handoff (${words} words; max 38 — cut at least ${words - 38})`)
  if (kind === 'outro' && words > BELLE_OUTRO_MAX_WORDS) errors.push(`outro is too long for Belle (${words} words; max ${BELLE_OUTRO_MAX_WORDS} — cut at least ${words - BELLE_OUTRO_MAX_WORDS})`)
  // [LISTENER_NAME] is a valid personalization placeholder in the script — do not reject it
  // ATL-BELLE-QC-BUG-002: strip quoted substrings before greeting check to allow series names like "The Welcome Committee".
  const cleanedForGreetingCheck = cleaned.replace(/"[^"]*"/g, ' ');
  if (kind === 'intro' && /\b(welcome|settle in|let['\u2019]?s begin)\b/i.test(cleanedForGreetingCheck)) errors.push('announcement must not include greeting/opener language')

  if (kind === 'outro' && ctx.episodeState === 'series_non_final') {
    // BELLE-OUTRO-FORWARD-001 (Marc, Nov 8): one recap sentence, then the next
    // episode by number with the series name.
    for (const issue of checkNonFinaleOutro(cleaned, {
      seriesName: ctx.seriesName || ctx.title,
      nextEpisodeNumber: ctx.episodeNumber ? ctx.episodeNumber + 1 : null,
    })) {
      if (!/too long/.test(issue)) errors.push(issue)
    }
    if (/\b(end|ended|final|concludes|conclusion|complete)\b/i.test(cleaned)) {
      errors.push('non-final series outro sounds final')
    }
  }

  if (kind === 'outro' && ctx.episodeState === 'series_finale') {
    if (/\b(next time|next episode|continues|to be continued)\b/i.test(cleaned)) {
      errors.push('finale outro must not tease another episode')
    }
    if (ctx.title && lower.includes('untitled')) errors.push('finale outro has missing title')
    if (checkClosingOutroExtras(cleaned).some(i => /time of day/.test(i))) errors.push('outro must not mention time of day')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NEW PRODUCTION-STANDARD VALIDATION (Marc 2026-05-25)
  // ──────────────────────────────────────────────────────────────────────────

  // RULE A - Title in intro (all episodes)
  if (kind === 'intro' && (ctx.title || ctx.seriesName)) {
    const titleSource = ctx.seriesName || ctx.title || ''
    const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'have', 'been', 'they', 'their', 'when', 'where', 'what', 'a', 'an', 'or'])
    const titleWords = titleSource.toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !stopwords.has(w))
    const foundTitleWord = titleWords.some(tw => cleaned.toLowerCase().includes(tw))
    if (!foundTitleWord && titleWords.length > 0) {
      errors.push(`intro does not reference the story or series title - expected to contain at least one of: ${titleWords.join(', ')}`)
    }
  }

  // RULE B - Episode number in series intros
  if (kind === 'intro' && ctx.episodeState !== 'standalone' && ctx.episodeNumber !== null && ctx.episodeNumber !== undefined) {
    const hasEpisodeNumber = /\b(episode|ep\.?|part)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(cleaned)
    if (!hasEpisodeNumber) {
      errors.push(`series intro must identify the episode number (e.g., "Episode One" or "Episode ${ctx.episodeNumber}")`)
    }
  }

  // RULE C & D - Author and "Endless Tales" credits in standalone/finale outros
  if (kind === 'outro' && (ctx.episodeState === 'standalone' || ctx.episodeState === 'series_finale')) {
    if (ctx.author) {
      const authorLastName = ctx.author.trim().split(/\s+/).pop()?.toLowerCase() || ''
      const hasAuthorCredit = authorLastName && cleaned.toLowerCase().includes(authorLastName)
      if (!hasAuthorCredit) {
        errors.push(`outro must credit the author - missing author name (expected "${ctx.author}")`)
      }
    }
    const hasEndlessTalesCredit = /endless\s+tales/i.test(cleaned)
    if (!hasEndlessTalesCredit) {
      errors.push(`outro must include "an Endless Tales original" or similar credit`)
    }
  }

  return errors
}


/**
 * BELLE-SPOILER-WORD-001 (Widow EP5, job c944a59e, Nov 11): three drafts failed
 * only because the Belle intro said "reveals" ("a secret insurance policy
 * reveals who Julian's next target was"). The spoiler rule is a word check, so
 * the words themselves are swapped for neutral ones; the line is then checked
 * again by the same gates. Words with no safe swap ("killer is", "will die")
 * are left alone, so the check still fails on them.
 */
export function softenBelleSpoilerWords(text: string): string {
  const keepCase = (src: string, rep: string) => (src[0] === src[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep)
  return String(text || '')
    .replace(/\breveals\b/gi, (m) => keepCase(m, 'shows'))
    .replace(/\brevealed\b/gi, (m) => keepCase(m, 'uncovered'))
    .replace(/\breveal\b/gi, (m) => keepCase(m, 'show'))
    .replace(/\bturns out\b/gi, (m) => keepCase(m, 'proves'))
    .replace(/\bspoiler\b/gi, (m) => keepCase(m, 'secret'))
}
