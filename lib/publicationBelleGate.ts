/**
 * PUBLICATION-TIME Belle COPY GATE — refuse known Belle failures at
 * publication with NO waiver path (PUBLICATION-HOLD-001, commission
 * lake-marion-permanent-hold-1433, Marc 2026-10-23).
 *
 * Enforces the deployed Belle predicates at the moment of publication:
 * intro naming + hook, outro credit + closure + reflection + companion +
 * tease. Deterministic only — no LLM calls, no requireLlmJudgment rescue:
 * at publish time an unverifiable hook FAILS CLOSED (the pipeline's
 * narrative-hook LLM fallback is a generation-time leniency, not a
 * publication guarantee).
 *
 * Single-definition discipline:
 *   - hasCompanionPresence / hasEmotionalResidueOrReflection are IMPORTED
 *     from lib/belleValidation.ts (deployed predicates).
 *   - detectNarrativeHookCategory is IMPORTED from lib/narrativeHook.ts
 *     (ATL-PIPE-020 detector, same rule the pipeline validator uses).
 *   - The tiny pure mirrors below (normalize/include/number/tease/closure/
 *     section-extraction) duplicate run-next/route.ts helpers line-for-line
 *     in behavior because those helpers are private to the 13k-line route
 *     file; each is marked MIRROR with its source anchor. Any rule change
 *     in run-next must update the mirror (and vice versa).
 *
 * Checked by every publication writer (publish-story series + single,
 * content-approval set_workflow_state → published, operator direct-publish
 * executor, autonomous direct-publish hooks). Refusals write NOTHING.
 */

import {
  hasCompanionPresence,
  hasEmotionalResidueOrReflection,
} from './belleValidation'
import { detectNarrativeHookCategory } from './narrativeHook'
import { episodeNumberNamedIn, normalizeNumberWords } from './numberWords'

export type BellePublishEpisodeType = 'standalone' | 'series_non_finale' | 'series_finale'

export type BellePublishStory = {
  id?: unknown
  title?: unknown
  author?: unknown
  script?: unknown
  series_id?: unknown
  series_name?: unknown
  episode_number?: unknown
  series_is_finale?: unknown
}

export type BellePublishVerdict =
  | { ok: true; episodeType: BellePublishEpisodeType }
  | { ok: false; episodeType: BellePublishEpisodeType; blockers: string[] }

/* ── MIRRORs of run-next/route.ts private helpers (behavior-identical) ── */

// MIRROR: normalizeHeaderValue (run-next ~line 655).
function normalizeHeaderValue(value: string): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

// MIRROR: extractHeader(script, key) (run-next ~line 659).
function extractHeader(script: string, key: string): string {
  const m = String(script ?? '').match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

// MIRROR: belleSectionMarkers (run-next ~line 837).
function belleSectionMarkers(kind: 'intro' | 'outro'): string[] {
  return kind === 'intro' ? ['BELLE B ANNOUNCEMENT', 'BELLE B INTRO'] : ['BELLE B OUTRO']
}

// MIRROR: extractBelleSection (run-next ~line 841).
export function extractBelleSection(script: string, kind: 'intro' | 'outro'): string {
  const text = String(script ?? '')
  const markers = belleSectionMarkers(kind)
  const markerIndex = markers
    .map((marker) => text.search(new RegExp(`^${marker}\\s*$`, 'im')))
    .find((index) => index >= 0) ?? -1
  if (markerIndex >= 0) {
    const afterMarker = text.slice(markerIndex)
    const match = afterMarker.match(/^BELLE B:\s*(.+)$/im)
    return normalizeHeaderValue(match?.[1] || '')
  }
  // Fallback: bare inline format used by Origin 2.0 scripts (e.g. "BELLE B: text here")
  const allMatches = Array.from(text.matchAll(/^BELLE B:\s*(.+)$/gim))
  if (allMatches.length === 0) return ''
  const pick = kind === 'outro' ? allMatches[allMatches.length - 1] : allMatches[0]
  return normalizeHeaderValue(pick[1] || '')
}

// MIRROR: normalizeBelleRequiredText + belleTextIncludes (run-next ~line 871-889),
// plus shared numeral normalization (Marc 2026-10-23 16:37 item 1): a title
// naming check must not fail on Two-vs-2 — "Episode Two" names "Episode 2".
function belleTextIncludes(text: string, required: string): boolean {
  const norm = (s: string) =>
    normalizeNumberWords(String(s || ''))
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const haystack = norm(text)
  const needle = norm(required)
  return Boolean(needle) && haystack.includes(needle)
}

// MIRROR: hasNextEpisodeTeaseLang incl. ATL-BELLE-QC-BUG-001 (run-next ~line 1149).
function hasNextEpisodeTeaseLang(text: string): boolean {
  if (/\bepisode\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i.test(text)) return true
  return /\b(next episode|next time|continue|continues|continuing|keep listening|what happens next|find out|to be continued|coming up|pick up|picks up|what comes next|leads to|leads us|uncover|discover|tune in|join us|listen (in|on)|coming soon|coming back|wait to see|ahead for|what awaits|what['’]s next)\b/i.test(text)
}

// MIRROR: hasSeriesClosureLanguage (run-next ~line 1157).
function hasSeriesClosureLanguage(text: string): boolean {
  return /\bendless tales original\b/i.test(text) ||
    /\bseries (has |have |is )?(come to |reached its |come to its |drawn to )?(an end|a close|its conclusion|complete|over|finish)\b/i.test(text) ||
    /\b(the final|the last) (chapter|episode|installment|story) of\b/i.test(text)
}

// SINGLE DEFINITION (Marc 2026-10-23 16:37 item 1): episode-number naming
// delegates to lib/numberWords.episodeNumberNamedIn — the private
// cardinal/ordinal tables are gone. Normalizes first, then requires a
// word-boundary digit match (also fixes the old substring check, under
// which episode 1 matched "someone"). run-next imports the same helper.
function introNamesEpisodeNumber(text: string, n: number): boolean {
  return episodeNumberNamedIn(text, n)
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Pure gate evaluation. Zero writes, zero network. Returns every blocker
 * found so one call surfaces the full repair list. NO waiver path: a
 * failing episode must be fixed and re-validated, never force-published.
 */
export function evaluateBelleCopyForPublish(story: BellePublishStory): BellePublishVerdict {
  const blockers: string[] = []
  const title = clean(story.title)
  const author = clean(story.author)
  const script = String(story.script ?? '')
  const narrator = extractHeader(script, 'NARRATOR').trim()
  const isSeries = Boolean(clean(story.series_id))
  const isFinale = Boolean(story.series_is_finale)
  const seriesName = clean(story.series_name)
  const episodeNum = typeof story.episode_number === 'number' ? story.episode_number : Number(story.episode_number)
  const episodeNumOrNull = Number.isFinite(episodeNum) ? episodeNum : null

  const episodeType: BellePublishEpisodeType =
    !isSeries ? 'standalone' : isFinale ? 'series_finale' : 'series_non_finale'

  const intro = extractBelleSection(script, 'intro')
  const outro = extractBelleSection(script, 'outro')

  // ── Intro: presence + hook + naming ──
  if (!intro) {
    blockers.push('intro text is missing')
  } else {
    // [LISTENER_NAME] is a valid split-point placeholder — strip for quality checks only.
    const introForChecks = intro.replace(/\[LISTENER_NAME\]/g, '').replace(/\s{2,}/g, ' ').trim()
    // Deterministic hook fast path ONLY (no LLM fallback at publish time — fail closed).
    if (!detectNarrativeHookCategory(introForChecks)) {
      blockers.push('intro must include a concrete narrative hook (event, danger, secret, conflict, mystery, or story mechanism)')
    }
    if (episodeType === 'standalone' && title && !belleTextIncludes(introForChecks, title)) {
      blockers.push(`standalone intro must name the story title "${title}"`)
    }
    if (isSeries) {
      if (seriesName && !belleTextIncludes(introForChecks, seriesName)) {
        blockers.push(`series intro must name the series title "${seriesName}"`)
      }
      if (episodeNumOrNull !== null && !introNamesEpisodeNumber(introForChecks, episodeNumOrNull)) {
        blockers.push(`series intro must name the episode number (episode ${episodeNumOrNull})`)
      }
      if (title && !belleTextIncludes(introForChecks, title)) {
        blockers.push(`series intro must name the episode title "${title}"`)
      }
    }
  }

  // ── Outro: presence ──
  if (!outro) {
    blockers.push('outro text is missing')
    return blockers.length ? { ok: false, episodeType, blockers } : { ok: true, episodeType }
  }

  // ── Outro: standalone ──
  if (episodeType === 'standalone') {
    if (title && !belleTextIncludes(outro, title)) {
      blockers.push(`standalone outro must name the story title "${title}"`)
    }
    if (author && !belleTextIncludes(outro, author)) {
      blockers.push(`standalone outro must name the author "${author}"`)
    }
    if (narrator && !belleTextIncludes(outro, narrator)) {
      blockers.push(`standalone outro must name the narrator "${narrator}"`)
    }
    if (hasNextEpisodeTeaseLang(outro)) {
      blockers.push('standalone outro must not tease a next episode')
    }
  }

  // ── Outro: non-finale series episode ──
  if (episodeType === 'series_non_finale') {
    if (author && belleTextIncludes(outro, author)) {
      blockers.push(`non-finale outro must not name the author "${author}" (credit belongs in finale only)`)
    }
    if (narrator && belleTextIncludes(outro, narrator)) {
      blockers.push(`non-finale outro must not name the narrator "${narrator}" (credit belongs in finale only)`)
    }
    if (hasSeriesClosureLanguage(outro)) {
      blockers.push('non-finale outro must not present final-series closure language')
    }
    if (!hasEmotionalResidueOrReflection(outro)) {
      blockers.push('non-finale outro must include emotional residue or reflection (not plot summary only)')
    }
    if (!hasCompanionPresence(outro)) {
      blockers.push('non-finale outro must acknowledge companion presence (Belle or listener, not clinical recap)')
    }
    if (!hasNextEpisodeTeaseLang(outro)) {
      blockers.push('non-finale outro must tease or point toward the next episode')
    }
  }

  // ── Outro: finale series episode ──
  if (episodeType === 'series_finale') {
    const namesTitle = (seriesName && belleTextIncludes(outro, seriesName)) ||
      (title && belleTextIncludes(outro, title))
    if (!namesTitle && (seriesName || title)) {
      blockers.push(`finale outro must name the series title "${seriesName || title}" or episode title`)
    }
    if (author && !belleTextIncludes(outro, author)) {
      blockers.push(`finale outro must name the author "${author}"`)
    }
    if (narrator && !belleTextIncludes(outro, narrator)) {
      blockers.push(`finale outro must name the narrator "${narrator}"`)
    }
    if (hasNextEpisodeTeaseLang(outro)) {
      blockers.push('finale outro must not tease a next episode')
    }
  }

  return blockers.length ? { ok: false, episodeType, blockers } : { ok: true, episodeType }
}

/**
 * Gate a whole publish unit (series or single). Returns the per-episode
 * blockers flattened with episode labels; empty blockers = all pass.
 */
export function evaluateBelleUnitForPublish(
  episodes: Array<BellePublishStory>
): { ok: true } | { ok: false; blockers: string[] } {
  const blockers: string[] = []
  for (const ep of episodes || []) {
    const verdict = evaluateBelleCopyForPublish(ep)
    if (!verdict.ok) {
      const label = clean((ep as { id?: unknown }).id) || clean(ep.title) || '(unknown episode)'
      for (const b of verdict.blockers) blockers.push(`episode ${label}: ${b}`)
    }
  }
  return blockers.length ? { ok: false, blockers } : { ok: true }
}
