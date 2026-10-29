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

import { speakersMissingFromCharacterGuide } from './characterGuide'
import { findUnlabeledStoryBodyLines, findSfxLabelLines } from './scriptLabels'
import { numeralPreTtsScan } from './numeralPreTtsScan'
import { checkScriptRuntimeMeetsMinimum, SCRIPT_RUNTIME_PREFLIGHT } from './scriptRuntimeEstimate'
import { checkNarrationPresence } from './narrationPresence'
import { parseScriptPositions } from './scriptLineIndex'
import { RUNTIME_GATE } from './runtimeGate'

// Mirrors app/api/admin/production-jobs/run-next/route.ts (pinned by test).
export const RUNNEXT_TITLE_MAX_CHARS = 28
export const RUNNEXT_DESCRIPTION_MAX_WORDS = 24
export const RUNNEXT_DESCRIPTION_PAST_TENSE_RE =
  /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden|lost)\b/i
/** RUNTIME-GATE-001's ±10% plus the estimator's ≈±5% calibration spread. */
export const RUNTIME_BRIEF_PRESPEND_TOLERANCE = 0.15
/** Validator prompt rule SFX-001 ("at most 3 per episode"). Canon (Spec v1.5) allows 3–6. */
export const VALIDATOR_SFX_MAX = 3

export type ReadinessBlocker = {
  gate: string
  detail: string
  /** Exact offending lines, quoted back to the writer on a rewrite (WRITER-NUMERAL-EVIDENCE-001). */
  evidence?: string[]
}

export type ReadinessInput = {
  script: string | null | undefined
  storyType?: string | null
  seriesId?: string | null
  seriesTotalEpisodes?: number | null
  episodeNumber?: number | null
  isFinale?: boolean | null
  /** Optional: names from narrator_voices. When omitted the narrator lookup is skipped. */
  narratorVoiceNames?: string[]
  /** Override the runtime floor (default: production's SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES). */
  minMinutes?: number
  /** Override the SFX cap (default: production validator's 3). */
  sfxMax?: number
  /** stories.duration_mins — the brief-of-record RUNTIME-GATE-001 measures the final mix against. */
  briefMinutes?: number | null
  /** CAST-GUIDE-001: series writer only — block speakers missing from the CHARACTER GUIDE. */
  requireCastGuide?: boolean
}

export type ReadinessReport = {
  ready: boolean
  blockers: ReadinessBlocker[]
  /** Reported, never gating (not a production gate; 2/93 published scripts would trip it). */
  warnings: ReadinessBlocker[]
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


/**
 * Speakers exactly as production voices them: the canonical parser
 * (parseScriptPositions) never classifies headers / pre-script lines
 * (PREMISE:, ENDING:, BEATS:, SUNO PROMPT:...) as voice positions.
 * Excludes narration and announcer lines.
 */
export function voicedCharacterSpeakers(script: string | null | undefined): Set<string> {
  const text = String(script || '')
  const narrator = header(text, 'NARRATOR').toUpperCase()
  const out = new Set<string>()
  for (const pos of parseScriptPositions(text)) {
    if (pos.kind !== 'voice' || !pos.speaker) continue
    const sp = pos.speaker.trim().toUpperCase()
    if (sp === 'NARRATOR' || sp === narrator || sp === 'BELLE B' || sp === 'BELLE' || sp === 'ANNOUNCER') continue
    out.add(sp)
  }
  return out
}

export function checkScriptReadiness(input: ReadinessInput): ReadinessReport {
  const script = String(input.script || '')
  const blockers: ReadinessBlocker[] = []
  const warnings: ReadinessBlocker[] = []
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
    const rawLines = script.split(/\r?\n/)
    const evidence = Array.from(new Set(numerals.failures.map((f) => f.line)))
      .slice(0, 10)
      .map((ln) => {
        const text = String(rawLines[ln - 1] || '').trim()
        const offending = numerals.failures.filter((f) => f.line === ln).map((f) => f.offendingText)
        return `${text.length > 220 ? text.slice(0, 217) + '...' : text}  ← digits: ${Array.from(new Set(offending)).join(', ')}`
      })
    blockers.push({ gate: 'NUMERAL-PRETTS', detail: `${numerals.failures.length} digit numeral(s) in spoken lines: ${spans.join(', ')}`, evidence })
  }

  // 3b. Speaker labels / SFX cue format — the exact check series_voice_preflight
  // runs (SCRIPT-LABELS-001, job f5b565be).
  const quote = (t: string) => (t.length > 220 ? t.slice(0, 217) + '...' : t)
  const sfxLabelLines = findSfxLabelLines(script)
  if (sfxLabelLines.length)
    blockers.push({
      gate: 'SFX-FORMAT',
      detail: `${sfxLabelLines.length} sound cue(s) written as a speaker label (voice step would read them aloud)`,
      evidence: sfxLabelLines.slice(0, 10).map((l) => quote(l.text)),
    })
  const unlabeled = findUnlabeledStoryBodyLines(script)
  if (unlabeled.length)
    blockers.push({
      gate: 'LABELS',
      detail: `${unlabeled.length} story line(s) without an UPPER-CASE speaker label (voice preflight refuses these)`,
      evidence: unlabeled.slice(0, 10).map((l) => quote(l.text)),
    })

  // 4. SFX count (validator SFX-001)
  const sfxCount = (script.match(/\[SFX:/gi) || []).length
  if (sfxCount > sfxMax) blockers.push({ gate: 'SFX-001', detail: `${sfxCount} SFX cues (validator max ${sfxMax})` })

  // 5. Runtime floor (SCRIPT-RUNTIME-PREFLIGHT-001)
  const runtime = checkScriptRuntimeMeetsMinimum(script, input.minMinutes)
  if (runtime.skipped) blockers.push({ gate: 'RUNTIME', detail: 'no parseable spoken lines' })
  else if (!runtime.pass)
    blockers.push({ gate: 'RUNTIME', detail: `${runtime.estimatedMins.toFixed(1)} min est. (${runtime.spokenWords} words; floor ${input.minMinutes ?? SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES} min)` })

  // 5b. Brief match — STANDALONE ONLY. RUNTIME-GATE-001 (final mix within
  // ±10% of duration_mins) runs only in run-next's standalone
  // complete_story_package branch; series never reach it, so applying it to
  // series would be a new, stricter gate (independent review B1). Tolerance
  // adds the estimator's calibration spread (155.7–169.9 wpm ≈ ±5%) so only
  // scripts that will almost surely fail after spend are stopped.
  const brief = Number(input.briefMinutes || 0)
  // Explicit only: a caller that omits storyType must not get a standalone-only gate (review round 2).
  const isStandaloneType = input.storyType === 'single' || input.storyType === 'standalone'
  if (isStandaloneType && !runtime.skipped && brief > 0) {
    const dev = (runtime.estimatedMins - brief) / brief
    if (Math.abs(dev) > RUNTIME_BRIEF_PRESPEND_TOLERANCE)
      blockers.push({
        gate: 'RUNTIME-BRIEF',
        detail: `${runtime.estimatedMins.toFixed(1)} min est. vs ${brief}-min brief (${dev > 0 ? '+' : ''}${(dev * 100).toFixed(0)}%; RUNTIME-GATE-001 allows ±${RUNTIME_GATE.TOLERANCE * 100}% after render)`,
      })
  }

  // 5c. SERIES-RUNTIME-MAX-001 (job a21df7bd: EP2 of a 15-min series came
  // out at 3,801 spoken words, ~24 min). Series had a floor but no ceiling.
  // Generous on purpose: the approved proof series ran 17-20 min on 15-min
  // briefs, so only clear overruns (> brief x 1.35) are stopped.
  if (isSeries && !runtime.skipped && brief > 0) {
    const maxWords = seriesMaxSpokenWords(brief)
    if (runtime.spokenWords > maxWords)
      blockers.push({
        gate: 'RUNTIME-SERIES-MAX',
        detail: `${runtime.spokenWords} spoken words (~${runtime.estimatedMins.toFixed(1)} min) vs ${brief}-min brief; max ${maxWords} spoken words`,
      })
  }

  // 6. Belle intro present
  // LANDING-STORY-001 / "No Belle B" variants are Belle-exempt in production.
  const belleExempt = /LANDING-STORY-001|No Belle B/i.test(header(script, 'VARIANT'))
  if (!belleExempt && !/^BELLE B\s*:/m.test(script)) blockers.push({ gate: 'BELLE', detail: 'no BELLE B intro line' })

  // 7. When a CHARACTER GUIDE exists, every voiced character must be in it
  // (casting needs a description). A missing guide is NOT a blocker: published
  // scripts without one (e.g. "The Woman Who Took My Place") produced fine.
  const guideMatch = script.match(/CHARACTER GUIDE([\s\S]*?)(\n---\s*\n[\s\S]*?\n---|\n\n\n)/)
  const guide = ((guideMatch?.[1] || '') + (guideMatch?.[2] || '')).toUpperCase()
  if (isSeries && input.requireCastGuide) {
    // CAST-GUIDE-001 (job a21df7bd: EP3 voices stopped on FRANK, one line, no
    // guide entry). Series voice casting reads this script's own guide, so
    // the writer must list every voiced character there. Same rule as the
    // voice step (lib/characterGuide.ts).
    const missingCast = speakersMissingFromCharacterGuide(script, voicedCharacterSpeakers(script))
    if (missingCast.length)
      blockers.push({
        gate: 'CHARACTER-GUIDE',
        detail: `${missingCast.length} speaking character(s) not in the CHARACTER GUIDE (voice casting would stop): ${missingCast.slice(0, 8).join(', ')}`,
        evidence: missingCast.slice(0, 8),
      })
  } else if (guide.trim()) {
    const missing = Array.from(voicedCharacterSpeakers(script)).filter((s) => !guide.includes(s) && !guide.includes(s.split(/\s+/)[0]))
    if (missing.length) warnings.push({ gate: 'CHARACTER-GUIDE', detail: `voiced characters without guide entry: ${missing.slice(0, 5).join(', ')}` })
  }

  // 8. Series typing (SERIES-TYPE-CONSISTENCY-001)
  const type = String(input.storyType || '')
  if ((type === 'single' || type === 'standalone') && input.seriesId && total > 1)
    blockers.push({ gate: 'SERIES-TYPE', detail: `story_type=${type} but belongs to a ${total}-episode series` })

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
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
  return new Set(Array.from(voicedCharacterSpeakers(script)).map((s) => s.split(/\s+/)[0]))
}

export function checkSeriesCastContinuity(
  episodes: Array<{ episodeNumber?: number | null; script?: string | null }>,
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
  /** Whole series for SERIES-CAST-CONTINUITY (defaults to `episodes`). Only `episodes` get per-script checks. */
  continuityEpisodes?: Array<{ episodeNumber?: number | null; script?: string | null }>,
): string[] {
  const reasons: string[] = []
  for (const ep of episodes) {
    const report = checkScriptReadiness(ep)
    for (const b of report.blockers) {
      const label = ep.episodeNumber ? `EP${ep.episodeNumber}` : String(ep.title || ep.id.slice(0, 8))
      reasons.push(`${label} ${b.gate}: ${b.detail}`)
    }
  }
  const series = continuityEpisodes ?? episodes
  if (series.length > 1) {
    for (const b of checkSeriesCastContinuity(series)) reasons.push(`${b.gate}: ${b.detail}`)
  }
  return reasons
}

// ───────────────────────────────────────────────────────────────────────────
// WRITER-SELF-CHECK-001 (Independent Recovery, 2026-10-26)
// The series writer saved whatever the model returned; defects surfaced later
// in production, one failed run at a time (CEO series: ~8 min vs 20-min brief).
// The writer now checks each episode before saving and rewrites with this
// feedback, at most WRITER_SELF_CHECK_MAX_REWRITES times.
// ───────────────────────────────────────────────────────────────────────────

export const WRITER_SELF_CHECK_MAX_REWRITES = 2

export function buildWriterRewriteFeedback(report: ReadinessReport, briefMinutes?: number | null): string {
  const lines: string[] = []
  for (const b of report.blockers) {
    if (b.gate === 'RUNTIME' || b.gate === 'RUNTIME-BRIEF') {
      const target = Number(briefMinutes || 0) > 0 ? Number(briefMinutes) : SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES
      const targetWords = Math.round(target * SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM)
      lines.push(
        `- LENGTH: the script has ${report.metrics.spokenWords} spoken words (~${report.metrics.estimatedMins} min). ` +
        `It must have about ${targetWords} spoken words (${target} min at ${SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM} wpm, within ±10%). ` +
        `Add real scenes and beats; do not pad.`,
      )
    } else if (b.gate === 'CHARACTER-GUIDE' && b.evidence?.length) {
      lines.push(
        `- CHARACTER-GUIDE: these speaking characters have no line in the CHARACTER GUIDE, so they cannot be cast a voice: ${b.evidence.join(', ')}. ` +
        `Add one guide line for each, in the same form as the others (NAME — age, male or female, accent, manner), or give their lines to a character already in the guide.`,
      )
    } else if (b.gate === 'RUNTIME-SERIES-MAX') {
      lines.push(
        `- LENGTH: the script is too long: ${report.metrics.spokenWords} spoken words (~${report.metrics.estimatedMins} min). ` +
        `Cut it to about ${Math.round(Number(briefMinutes || 15) * SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM)} spoken words. ` +
        `Remove or merge whole scenes; keep every clue and the cliffhanger.`,
      )
    } else if (b.gate === 'NUMERAL-PRETTS' && b.evidence?.length) {
      // WRITER-NUMERAL-EVIDENCE-001 (job 1dcbe89e: EP2 kept "001, 002, 003"
      // through 3 drafts when told only the digits): quote the exact lines.
      lines.push(
        `- NUMERAL-PRETTS (numbers): these spoken lines contain digits. Rewrite each number in words, the way a narrator would say it aloud ` +
        `(for example "001" → "zero zero one", "17" → "seventeen"). Codes, serial numbers, plates, receipts and times count too:`,
        ...b.evidence.map((e) => `    ${e}`),
      )
    } else if (b.gate === 'BELLE-CONTENT') {
      lines.push(`- BELLE-CONTENT: ${b.detail}`)
      if (/cut off|incomplete/i.test(b.detail))
        lines.push('    (The last word before the final period must finish the thought, not a word that needs more after it, such as of, to, the, a, and, or, but, with, from, into.)')
      if (/narrative hook/i.test(b.detail))
        lines.push('    (State the episode\'s concrete danger, secret, mystery, or impossible event in plain words, e.g. "a stranger pays the toll with coins that should not exist" — mood or setting alone does not count. The automatic check looks for words like: secret, hidden, missing, impossible, stolen, betrayed, conspiracy, warning. Use at least one of them.)')
      if (/too long/i.test(b.detail)) lines.push('    (Belle B announcement: at most 38 words. Belle B outro: at most 55 words.)')
      if (/sounds final/i.test(b.detail)) lines.push('    (A non-finale outro must not use the words end, ended, final, concludes, conclusion, complete.)')
      if (/spoiler/i.test(b.detail)) lines.push('    (Do not use the words reveal, reveals, revealed, spoiler, or "turns out" in Belle B lines.)')
      for (const e of b.evidence ?? []) lines.push(`    ${e}`)
    } else if (b.gate === 'LABELS' && b.evidence?.length) {
      lines.push(
        `- LABELS: every story line must start with a speaker label in CAPITAL LETTERS (NARRATOR: or the character's name, e.g. "NELL FARADAY:"). Fix these lines:`,
        ...b.evidence.map((e) => `    ${e}`),
      )
    } else if (b.gate === 'SFX-FORMAT' && b.evidence?.length) {
      lines.push(
        `- SFX-FORMAT: write each sound effect on its own line exactly as [SFX: short description] — no "SFX:" label, no numbers or IDs. Fix these lines:`,
        ...b.evidence.map((e) => `    ${e}`),
      )
    } else {
      lines.push(`- ${b.gate}: ${b.detail}`)
    }
  }
  return [
    'REWRITE REQUIRED. Your draft above failed these automatic production checks.',
    'REVISE that draft: keep every scene, line, character, and Belle B block that already works,',
    'and change only what is needed to fix every item below.',
    'Write the COMPLETE episode script again (the whole revised script, not a list of changes), in the same format:',
    ...Array.from(new Set(lines)),
    'Keep characters, names, places, and continuity exactly as given in the original instructions.',
    'Output ONLY the revised script. No commentary.',
  ].join('\n')
}

/** Brief-of-record minutes: stories.duration_mins, else brief_json.runtime ("15 min"). */
export function briefMinutesOf(story: { duration_mins?: number | null; brief_json?: any }): number | null {
  const direct = Number(story?.duration_mins || 0)
  if (direct > 0) return direct
  const m = String(story?.brief_json?.runtime || '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

export type WriterDraft = {
  script: string
  description: string
  /** Exact model output, sent back on the next turn so the rewrite revises it (WRITER-REVISE-001). */
  raw?: string
  inputTokens?: number
  outputTokens?: number
}

export type WriterSelfCheckResult = {
  ok: boolean
  script: string
  description: string
  report: ReadinessReport
  attempts: Array<{ attempt: number; blockers: string[]; spokenWords: number }>
  usage: { input: number; output: number }
}

/**
 * Bounded write → check → rewrite loop. `generate` receives ('', null) on the
 * first draft; afterwards it receives the rewrite feedback AND the previous
 * draft, so the model revises that draft instead of starting over
 * (WRITER-REVISE-001: fresh rewrites did not converge — job fd2521c4).
 * Makes at most 1 + maxRewrites calls.
 */
export async function writeWithSelfCheck(opts: {
  generate: (feedback: string, previousDraft: string | null) => Promise<WriterDraft>
  check: (script: string) => ReadinessReport | Promise<ReadinessReport>
  briefMinutes?: number | null
  maxRewrites?: number
  /** Do not START another draft after this many ms (keeps the step inside its fetch timeout). */
  budgetMs?: number
  now?: () => number
}): Promise<WriterSelfCheckResult> {
  const maxRewrites = opts.maxRewrites ?? WRITER_SELF_CHECK_MAX_REWRITES
  const now = opts.now ?? (() => Date.now())
  const startedAt = now()
  const attempts: WriterSelfCheckResult['attempts'] = []
  const usage = { input: 0, output: 0 }
  let feedback = ''
  let draft: WriterDraft | null = null
  let report: ReadinessReport | null = null
  for (let attempt = 0; attempt <= maxRewrites; attempt++) {
    if (attempt > 0 && opts.budgetMs !== undefined && now() - startedAt > opts.budgetMs) break
    const previousDraft: string | null = draft ? (draft.raw ?? draft.script) : null
    draft = await opts.generate(feedback, previousDraft)
    usage.input += draft.inputTokens ?? 0
    usage.output += draft.outputTokens ?? 0
    report = await opts.check(draft.script)
    attempts.push({
      attempt: attempt + 1,
      blockers: report.blockers.map((b) => `${b.gate}: ${b.detail}${b.gate === 'BELLE-CONTENT' && b.evidence?.length ? ` [${b.evidence[0].slice(0, 300)}]` : ''}`),
      spokenWords: report.metrics.spokenWords,
    })
    if (report.ready) break
    feedback = buildWriterRewriteFeedback(report, opts.briefMinutes)
  }
  return {
    ok: Boolean(report?.ready),
    script: draft?.script ?? '',
    description: draft?.description ?? '',
    report: report ?? checkScriptReadiness({ script: '' }),
    attempts,
    usage,
  }
}

/**
 * A brief shorter than the pre-spend floor allows can never pass both the
 * floor and the ±10% runtime window. Detect it before any writing call.
 */
export function briefRuntimeImpossible(briefMinutes: number | null | undefined): string | null {
  const brief = Number(briefMinutes || 0)
  if (!(brief > 0)) return null
  const maxAllowed = brief * (1 + RUNTIME_GATE.TOLERANCE)
  if (maxAllowed < SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES) {
    return `brief is ${brief} min; at most ${maxAllowed.toFixed(1)} min fits its ±10% window but the pre-spend floor requires ${SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES} min. Re-brief to >= ${Math.ceil(SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES / (1 + RUNTIME_GATE.TOLERANCE))} min.`
  }
  return null
}

/**
 * Writer step time limits (review round 2). The runner aborts the step fetch
 * at 720s (RUN_NEXT_TIMEOUT_MS_BY_STEP.generate_episode_script) inside its
 * 740s deadline. No draft STARTS after 400s; every draft call is capped at
 * 300s with no SDK retries; the whole step therefore ends by ~700s.
 */
export const WRITER_SELF_CHECK_BUDGET_MS = 400_000
export const WRITER_DRAFT_TIMEOUT_MS = 300_000
export const WRITER_STEP_HARD_LIMIT_MS = 700_000

/** Per-draft call timeout given the time already used by the writer step. */
export function writerDraftTimeoutMs(elapsedMs: number): number {
  return Math.max(30_000, Math.min(WRITER_DRAFT_TIMEOUT_MS, WRITER_STEP_HARD_LIMIT_MS - elapsedMs))
}

/**
 * WRITER-CLAIM-001 (review round 2): one writer per series job at a time.
 * The runner can re-enter the same job every minute (same holder, re-entrant
 * lock), which would start overlapping paid writers on the same episode.
 */
export const WRITER_CLAIM_STALE_MS = 12 * 60_000

export function writerClaimIsFresh(stateJson: unknown, nowMs: number): boolean {
  const claim = (stateJson as any)?.writerClaim
  const at = Date.parse(String(claim?.at || ''))
  return Number.isFinite(at) && nowMs - at < WRITER_CLAIM_STALE_MS
}

/**
 * WRITER-SPEND-CAP-001 (review round 3): hard per-episode cap on failed
 * writer invocations, independent of job locks. Failures are recorded on the
 * EPISODE (stories.script_json.writer_self_check_failures) with an unfenced
 * write before the writer throws, so a lost job lock can never turn a failing
 * episode into endless paid drafts. A human reset (dispatch_failure_reset_at,
 * stamped by content-approval clear_needs_attention) re-opens the budget.
 */
export const WRITER_MAX_FAILED_INVOCATIONS = 2

export function countWriterFailures(scriptJson: unknown, resetAtIso?: string | null): number {
  const list = (scriptJson as any)?.writer_self_check_failures
  if (!Array.isArray(list)) return 0
  const resetMs = Date.parse(String(resetAtIso || '')) || 0
  return list.filter((entry: any) => (Date.parse(String(entry?.at || '')) || 0) > resetMs).length
}

/**
 * WRITER-PROMPT-GATES-001: series length target in SPOKEN words, the unit the
 * pre-spend gate measures (SCRIPT-RUNTIME-PREFLIGHT-001, 160 wpm). The old
 * "1,800 to 2,100 words total" for 15 min (headers included) sat below the
 * 2,000-spoken-word floor, so the prompt itself produced short scripts.
 */
export const SERIES_RUNTIME_MAX_FACTOR = 1.35

/** SERIES-RUNTIME-MAX-001: spoken-word ceiling for a series episode brief. */
export function seriesMaxSpokenWords(briefMinutes: number): number {
  return Math.round(briefMinutes * SERIES_RUNTIME_MAX_FACTOR * SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM)
}

export function seriesSpokenWordTarget(runtime: string): { minutes: number; target: number; min: number; max: number } {
  const parsed = parseInt(String(runtime || '').match(/\d+/)?.[0] || '15', 10)
  const minutes = parsed > 0 ? parsed : 15
  const wpm = SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM
  const floor = Math.ceil(SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES * wpm)
  const target = Math.max(floor, Math.round(minutes * wpm))
  const min = Math.max(floor, Math.round(minutes * 0.9 * wpm))
  const max = Math.max(target + 200, Math.round(minutes * 1.1 * wpm))
  return { minutes, target, min, max }
}

/**
 * DESC-WORD-AUTOFIX-001 (job 0fa07149, The Nanny Cam EP2, 2026-10-29): the
 * premise is about "hidden cameras", so the writer kept putting "hidden" in
 * the card DESCRIPTION and failed all 3 drafts on the blocked-word rule.
 * Swap the blocked words that have a safe present-tense synonym. Words with
 * no safe swap (was/were/had/found/left...) are left for the writer.
 * Only the DESCRIPTION header line is touched.
 */
const DESCRIPTION_WORD_SWAPS: Array<[RegExp, string]> = [
  [/\bhidden\b/g, 'secret'],
  [/\bHidden\b/g, 'Secret'],
  [/\blost\b/g, 'missing'],
  [/\bLost\b/g, 'Missing'],
  [/\bvanished\b/g, 'missing'],
  [/\bVanished\b/g, 'Missing'],
]

export function autofixDescriptionBlockedWords(script: string): { script: string; changed: boolean } {
  let changed = false
  const out = String(script || '').replace(/^(\s*DESCRIPTION\s*:\s*)(.*)$/im, (_m, head: string, body: string) => {
    let next = body
    for (const [re, sub] of DESCRIPTION_WORD_SWAPS) next = next.replace(re, sub)
    if (next !== body) changed = true
    return head + next
  })
  return { script: out, changed }
}
