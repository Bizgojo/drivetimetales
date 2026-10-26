/**
 * SCRIPT-READINESS-001 (Independent Recovery, 2026-10-26)
 *
 * One call, zero cost: runs every DETERMINISTIC pre-spend gate the production
 * controller applies to a script, and returns ALL blockers at once.
 *
 * Why: in production each gate stops the job on its first failure, so a script
 * with four defects costs four runs to discover them (CEO series: numerals,
 * SFX count, spoiler description, runtime were found one run at a time).
 *
 * This module reuses the real gate code where it is exported
 * (numeralPreTtsScan, checkScriptRuntimeMeetsMinimum, checkNarrationPresence).
 * The card-copy rules mirror run-next's private validateCardCopy (the gate
 * that actually blocks production) — NOT lib/validateCardCopy.ts, which has
 * diverged (70-char description limit vs run-next's 24 words; blocked-word
 * lists differ by "lost"). A test pins these constants to the run-next source
 * so drift is caught.
 *
 * LLM gates (score_validate_package judge, Belle quality judge, hook-gate
 * semantic fallback) are NOT run here: they cost money and are not
 * deterministic. A script that passes here can still fail those.
 */

import { numeralPreTtsScan } from './numeralPreTtsScan'
import { checkScriptRuntimeMeetsMinimum, SCRIPT_RUNTIME_PREFLIGHT } from './scriptRuntimeEstimate'
import { checkNarrationPresence } from './narrationPresence'
import { RUNTIME_GATE } from './runtimeGate'

// Mirrors app/api/admin/production-jobs/run-next/route.ts (pinned by test).
export const RUNNEXT_TITLE_MAX_CHARS = 28
export const RUNNEXT_DESCRIPTION_MAX_WORDS = 24
export const RUNNEXT_DESCRIPTION_PAST_TENSE_RE =
  /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden|lost)\b/i
/** Validator prompt rule SFX-001 ("at most 3 per episode"). Canon (Spec v1.5) allows 3–6. */
export const VALIDATOR_SFX_MAX = 3

export type ReadinessBlocker = { gate: string; detail: string }

export type ReadinessInput = {
  script: string | null | undefined
  storyType?: string | null
  seriesId?: string | null
  seriesTotalEpisodes?: number | null
  episodeNumber?: number | null
  isFinale?: boolean | null
  /** Optional: names from narrator_voices. When omitted the narrator lookup is skipped. */
  narratorVoiceNames?: string[]
  /** Override the runtime floor (default: production's 15.5 min). */
  minMinutes?: number
  /** Override the SFX cap (default: production validator's 3). */
  sfxMax?: number
  /** stories.duration_mins — the brief-of-record RUNTIME-GATE-001 measures the final mix against. */
  briefMinutes?: number | null
}

export type ReadinessReport = {
  ready: boolean
  blockers: ReadinessBlocker[]
  metrics: {
    spokenWords: number
    estimatedMins: number
    sfxCount: number
    descriptionWords: number
    titleChars: number
  }
}

function header(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

const NON_SPEAKERS = new Set([
  'TITLE', 'DESCRIPTION', 'NARRATIVE_VOICE', 'NARRATOR', 'NARRATOR_IS_CHARACTER', 'GENRE', 'SUBGENRE',
  'AUTHOR', 'SERIES', 'EPISODE', 'EPISODE_TITLE', 'SERIES_TOTAL_EPISODES', 'SERIES_IS_FINALE', 'ANNOUNCER',
  'BELLE_GATE', 'STORY_TYPE', 'BEATS', 'SCENE', 'BELLE B', 'BELLE', 'PIPELINE_MODE', 'RUNTIME', 'SETTING',
])

export function checkScriptReadiness(input: ReadinessInput): ReadinessReport {
  const script = String(input.script || '')
  const blockers: ReadinessBlocker[] = []
  const sfxMax = input.sfxMax ?? VALIDATOR_SFX_MAX

  // 1. Card copy (run-next validateCardCopy rules)
  const title = header(script, 'TITLE')
  const description = header(script, 'DESCRIPTION')
  if (!title) blockers.push({ gate: 'CARD-COPY', detail: 'TITLE missing' })
  else {
    if (words(title) > 5) blockers.push({ gate: 'CARD-COPY', detail: `TITLE ${words(title)} words (max 5)` })
    if (title.length > RUNNEXT_TITLE_MAX_CHARS) blockers.push({ gate: 'CARD-COPY', detail: `TITLE ${title.length} chars (max ${RUNNEXT_TITLE_MAX_CHARS})` })
  }
  if (!description) blockers.push({ gate: 'CARD-COPY', detail: 'DESCRIPTION missing' })
  else {
    if (words(description) > RUNNEXT_DESCRIPTION_MAX_WORDS)
      blockers.push({ gate: 'CARD-COPY', detail: `DESCRIPTION ${words(description)} words (max ${RUNNEXT_DESCRIPTION_MAX_WORDS})` })
    const blocked = RUNNEXT_DESCRIPTION_PAST_TENSE_RE.exec(description)
    if (blocked) blockers.push({ gate: 'CARD-COPY', detail: `DESCRIPTION blocked word "${blocked[0]}"` })
  }

  // 2. Narrator header + narration presence
  const narrator = header(script, 'NARRATOR')
  if (!narrator) blockers.push({ gate: 'NARRATOR', detail: 'NARRATOR header missing' })
  else if (input.narratorVoiceNames && !input.narratorVoiceNames.some((n) => n.trim().toLowerCase() === narrator.toLowerCase()))
    blockers.push({ gate: 'NARRATOR', detail: `NARRATOR "${narrator}" not in narrator_voices` })
  const narration = checkNarrationPresence(script)
  for (const issue of narration.issues) blockers.push({ gate: 'NARRATION-PRESENCE-001', detail: issue })

  // 3. Numerals (Gate 5), with the series Episode-N passthroughs run-next applies
  const isSeries = input.storyType === 'series_episode'
  const ep = Number(input.episodeNumber || 0)
  const total = Number(input.seriesTotalEpisodes || 0)
  const finale = Boolean(input.isFinale) || (total > 0 && ep >= total)
  const numerals = numeralPreTtsScan(script, isSeries && ep > 0
    ? { episodeNumberPassThrough: ep, ...(!finale ? { nextEpisodeNumberPassThrough: ep + 1 } : {}) }
    : {})
  if (!numerals.passed) {
    const spans = Array.from(new Set(numerals.failures.map((f) => f.offendingText))).slice(0, 6)
    blockers.push({ gate: 'NUMERAL-PRETTS', detail: `${numerals.failures.length} digit numeral(s) in spoken lines: ${spans.join(', ')}` })
  }

  // 4. SFX count (validator SFX-001)
  const sfxCount = (script.match(/\[SFX:/gi) || []).length
  if (sfxCount > sfxMax) blockers.push({ gate: 'SFX-001', detail: `${sfxCount} SFX cues (validator max ${sfxMax})` })

  // 5. Runtime floor (SCRIPT-RUNTIME-PREFLIGHT-001)
  const runtime = checkScriptRuntimeMeetsMinimum(script, input.minMinutes)
  if (runtime.skipped) blockers.push({ gate: 'RUNTIME', detail: 'no parseable spoken lines' })
  else if (!runtime.pass)
    blockers.push({ gate: 'RUNTIME', detail: `${runtime.estimatedMins.toFixed(1)} min est. (${runtime.spokenWords} words; floor ${input.minMinutes ?? SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES} min)` })

  // 5b. Brief match: predicts RUNTIME-GATE-001 (final mix within ±10% of
  // duration_mins), which otherwise fails only AFTER full voice/music spend.
  const brief = Number(input.briefMinutes || 0)
  if (!runtime.skipped && brief > 0) {
    const dev = (runtime.estimatedMins - brief) / brief
    if (Math.abs(dev) > RUNTIME_GATE.TOLERANCE)
      blockers.push({
        gate: 'RUNTIME-BRIEF',
        detail: `${runtime.estimatedMins.toFixed(1)} min est. vs ${brief}-min brief (${dev > 0 ? '+' : ''}${(dev * 100).toFixed(0)}%; RUNTIME-GATE-001 allows ±${RUNTIME_GATE.TOLERANCE * 100}% after render)`,
      })
  }

  // 6. Belle intro present
  if (!/^BELLE B\s*:/m.test(script)) blockers.push({ gate: 'BELLE', detail: 'no BELLE B intro line' })

  // 7. Every speaker appears in the CHARACTER GUIDE (casting needs a description)
  const guideMatch = script.match(/CHARACTER GUIDE([\s\S]*?)(\n---\s*\n[\s\S]*?\n---|\n\n\n)/)
  const guide = (guideMatch?.[1] || '') + (guideMatch?.[2] || '')
  if (guide) {
    const speakers = new Set<string>()
    for (const m of script.matchAll(/^([A-Z][A-Z .'\-]{1,40}?)\s*:/gm)) {
      const s = m[1].trim()
      if (!NON_SPEAKERS.has(s) && s !== narrator.toUpperCase()) speakers.add(s)
    }
    const missing = Array.from(speakers).filter((s) => !guide.toUpperCase().includes(s))
    if (missing.length) blockers.push({ gate: 'CHARACTER-GUIDE', detail: `speakers without guide entry: ${missing.slice(0, 5).join(', ')}` })
  } else {
    blockers.push({ gate: 'CHARACTER-GUIDE', detail: 'CHARACTER GUIDE section missing' })
  }

  // 8. Series typing (SERIES-TYPE-CONSISTENCY-001)
  const type = String(input.storyType || '')
  if ((type === 'single' || type === 'standalone') && input.seriesId && total > 1)
    blockers.push({ gate: 'SERIES-TYPE', detail: `story_type=${type} but belongs to a ${total}-episode series` })

  return {
    ready: blockers.length === 0,
    blockers,
    metrics: {
      spokenWords: runtime.spokenWords,
      estimatedMins: Number(runtime.estimatedMins.toFixed(2)),
      sfxCount,
      descriptionWords: description ? words(description) : 0,
      titleChars: title.length,
    },
  }
}

// ───────────────────────────────────────────────────────────────────────────
// SERIES-CAST-CONTINUITY-001 (Independent Recovery, 2026-10-26)
// "Ghost Town Vote" (3 eps) was three unrelated stories with disjoint casts;
// the LLM package validator caught it, but only after dispatch + a paid call,
// and only by parking the series for Marc. This deterministic check runs free
// in the dispatcher. Rule (short series, <= CAST_CONTINUITY_MAX_EPISODES):
// every episode after 1 shares at least one speaking character (by first
// name) with Episode 1 AND with the previous episode. Long arcs (e.g. The
// Sunset of Competition, 26 eps, casts change by era) are exempt.
// Calibrated 2026-10-26: 17/17 published short series pass; Ghost Town Vote fails.
// ───────────────────────────────────────────────────────────────────────────

export const CAST_CONTINUITY_MAX_EPISODES = 6

export function speakingCastFirstNames(script: string | null | undefined): Set<string> {
  const text = String(script || '')
  const narrator = header(text, 'NARRATOR').toUpperCase()
  const names = new Set<string>()
  for (const m of text.matchAll(/^([A-Z][A-Z .'\-]{1,40}?)\s*:/gm)) {
    const speaker = m[1].trim()
    if (NON_SPEAKERS.has(speaker) || speaker === 'SUNO PROMPT' || speaker === narrator) continue
    names.add(speaker.split(/\s+/)[0])
  }
  return names
}

export function checkSeriesCastContinuity(
  episodes: Array<{ episodeNumber: number | null | undefined; script: string | null | undefined }>,
): ReadinessBlocker[] {
  const sorted = episodes
    .filter((e) => Number(e.episodeNumber) > 0)
    .sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber))
  if (sorted.length < 2 || sorted.length > CAST_CONTINUITY_MAX_EPISODES) return []
  const casts = sorted.map((e) => speakingCastFirstNames(e.script))
  const shares = (a: Set<string>, b: Set<string>) => Array.from(a).some((n) => b.has(n))
  const blockers: ReadinessBlocker[] = []
  for (let i = 1; i < sorted.length; i++) {
    const ep = Number(sorted[i].episodeNumber)
    const withFirst = shares(casts[i], casts[0])
    const withPrev = shares(casts[i], casts[i - 1])
    if (!withFirst || !withPrev) {
      blockers.push({
        gate: 'SERIES-CAST-CONTINUITY',
        detail: `Episode ${ep} shares no speaking character with ${!withFirst ? 'Episode 1' : `Episode ${Number(sorted[i - 1].episodeNumber)}`} (cast: ${Array.from(casts[i]).slice(0, 6).join(', ')})`,
      })
    }
  }
  return blockers
}

/**
 * DISPATCH-READINESS-GATE-001: the single free gate the dispatcher runs before
 * creating ANY production job. Returns every reason at once so a parked story
 * carries a complete fix list, not one defect per paid run.
 */
export function dispatchReadinessReasons(
  episodes: Array<ReadinessInput & { id: string; title?: string | null }>,
): string[] {
  const reasons: string[] = []
  for (const ep of episodes) {
    const report = checkScriptReadiness(ep)
    for (const b of report.blockers) {
      const label = ep.episodeNumber ? `EP${ep.episodeNumber}` : String(ep.title || ep.id.slice(0, 8))
      reasons.push(`${label} ${b.gate}: ${b.detail}`)
    }
  }
  if (episodes.length > 1) {
    for (const b of checkSeriesCastContinuity(episodes)) reasons.push(`${b.gate}: ${b.detail}`)
  }
  return reasons
}
