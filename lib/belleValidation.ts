/**
 * lib/belleValidation.ts — Belle copy validators shared by the production
 * pipeline (run-next) and unit tests.
 *
 * BELLE-REPAIR-WRITE-INTEGRITY-001: `hasCompanionPresence` moved here verbatim
 * from app/api/admin/production-jobs/run-next/route.ts so the rule has a
 * single definition, plus the pure write-integrity helpers the series Belle
 * retry persist path uses (audit entry, continuity-pin resync, audio
 * invalidation scoping). All helpers are pure (no DB) so they are directly
 * unit-testable with production-shaped fixtures.
 */

import { hashScript } from './continuityPin'

/* ─────────────────────────────────────────────────────────────────────
 * REFLECTION-RULE-UNIFICATION-001 (Marc 2026-10-22 22:45 EDT, PERMANENT):
 * the reflection check is ONE rule with a single definition in this file,
 * consumed identically by all three pipeline paths:
 *   1. GENERATION — series + standalone script prompts interpolate
 *      REFLECTION_RULE_PROMPT_FRAGMENT so the model writes copy the gate
 *      accepts (previously the series prompt framed non-finale outros as
 *      pure tease with no reflection requirement — the divergence that
 *      produced validator-rejected copy).
 *   2. VALIDATION — hasEmotionalResidueOrReflection (deterministic
 *      predicate) + BELLE_QUALITY_VALIDATOR_PROMPT (LLM assist) which
 *      embeds the same fragment.
 *   3. REPAIR — regenerateSeriesBelleFromFeedback + BELLE_QUALITY_REPAIR_PROMPT
 *      embed the same fragment (previously the repair model got only the
 *      bare issue string with no definition of what counts as reflection).
 * The fragment is BUILT from REFLECTION_VALID_EXAMPLES /
 * REFLECTION_INVALID_EXAMPLES, and the unified test asserts every valid
 * example passes the predicate and every invalid example fails it — prose,
 * predicate, and tests cannot drift apart. Do NOT restate the rule
 * anywhere else; reference this fragment.
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Valid reflective outros: felt experience, reflective language, or
 * listener-directed invitations to dwell on emotional weight. EVERY entry
 * must pass hasEmotionalResidueOrReflection (enforced by test).
 */
export const REFLECTION_VALID_EXAMPLES: string[] = [
  // The Harbor Light Ep1 quoted candidate (the demonstrated false negative).
  "That's a lot to carry \u2014 a failing joint, a demolition order, and now him. Sit with that for a second...",
  // Saved Harbor Light outros (must keep passing).
  'and you are left wondering what Lucy will sacrifice for her father light.',
  'the cost of her dream job has never been clearer. She makes her choice in the Series Finale.',
  // Paraphrase family: reflective invitations.
  'Hold onto that feeling \u2014 dawn is coming, and everything changes.',
  'Let it sink in: everything she knew just changed.',
  'Take a moment with what she gave up before the storm hits.',
  "The weight of what she's losing finally lands.",
  'Ask yourself what you would carry home from that fire.',
  // Independent positive: emotional aftermath with none of the taught invitation phrases.
  'leaving you gasping at the cost of her choice.',
]

/**
 * Plot-only recaps: no felt experience, no reflection, no invitation.
 * EVERY entry must fail hasEmotionalResidueOrReflection (enforced by test).
 */
export const REFLECTION_INVALID_EXAMPLES: string[] = [
  'In this episode, she discovered the letter and confronted him.',
  'Lucy fixed the joint, confronted the council, and went home.',
  'Episode 5: The Reckoning. Themes: betrayal and redemption.',
  'She found the logbook, opened it, and read the final page.',
  'Blythe found the page, Jonah opened the logbook, and the council voted at dawn.',
  // Hard negatives: reflection-associated grammar aimed at literal plot objects.
  'He asked himself where he left the toolbox.',
  'She carried the toolbox home in the rain.',
  'The crew remembered that the bell rings at dawn.',
]

/**
 * Single prose copy of the reflection rule, interpolated into generation,
 * validation-assist, and repair prompts. Built from the example arrays so
 * prompt prose and validator acceptance can never diverge.
 */
export const REFLECTION_RULE_PROMPT_FRAGMENT: string =
  'Reflection rule (emotional residue or reflection \u2014 NOT plot summary only):\n' +
  'An outro passes when it carries the listener\u2019s felt experience after the episode ' +
  '(awe, tension, heartbreak, wonder, unease) OR reflective language (questions, realizations, ' +
  'costs, choices) OR a listener-directed invitation to dwell on emotional weight ' +
  '(sit with that, hold onto that feeling, let it sink in, take a moment, the weight of what ' +
  'was lost, ask yourself). The examples below illustrate reflection ONLY \u2014 every other ' +
  'episode rule still applies (no time-of-day references, no invented events, teaser/closure ' +
  'structure, credit placement); do not copy example events or wording. Valid reflective copy includes:\n' +
  REFLECTION_VALID_EXAMPLES.map((ex) => `\u2705 "${ex}"`).join('\n') +
  '\nA plot-only recap with no felt experience, no reflection, and no invitation FAILS, e.g.:\n' +
  REFLECTION_INVALID_EXAMPLES.map((ex) => `\u274c "${ex}"`).join('\n')

/**
 * FIX-BELLE-SERIES-TEMPLATE-001: True when the outro acknowledges companion
 * presence (Belle as narrator/guide or listener as co-participant). Required
 * for series non-finale outros.
 *
 * BELLE-REPAIR-WRITE-INTEGRITY-001: extended with listener-as-co-participant
 * markers (`you know`, `sit with that`) per the canon COMPANION PRESENCE
 * definition in lib/belleGenerator.ts ("listener as co-participant ...
 * Creates intimate connection, not clinical summary"). Direct second-person
 * address ("now you know why... Sit with that for a moment") passes; flat
 * third-person plot recap with no listener address still fails.
 */
export function hasCompanionPresence(text: string): boolean {
  const companionMarkers = /\b(i'?m belle|belle here|you won't|you will|you can't|you know|alongside|join|discover|tune in|listen|next episode|stay tuned|coming back|keep listening|return|sit with that|we'll|we're|we've|we|our)\b/i
  return companionMarkers.test(text)
}

/**
 * HARBORLIGHT-REFLECTION-FIX-001: True when the outro contains emotional
 * residue or reflection (not mere plot summary). Required for series
 * non-finale outros.
 *
 * Moved here verbatim from app/api/admin/production-jobs/run-next/route.ts
 * (FIX-BELLE-SERIES-TEMPLATE-001) so the rule has a single definition and is
 * directly unit-testable, then extended with a reflective-invitation layer:
 * listener-directed invitations to dwell on emotional weight ("sit with
 * that"), emotional-burden "carry" phrasing ("a lot to carry", "carry
 * that forward"), and reasonable paraphrases (hold onto / let it settle /
 * take a moment / the weight of <abstract> / ask yourself / what would you
 * / stays with you).
 *
 * ACCEPTANCE CONTRACT (explicit, Codex review x4): the invitation layer
 * recognizes reflective GRAMMAR — ruled phrases ("sit with that",
 * "a lot to carry"), second-person interrogatives ("ask yourself",
 * "what would you"), and abstract-complement constructions ("weight of
 * her grief", "carries that fear", "echoes of what she gave up").
 * Residual ambiguity is ACCEPTED where only antecedent/clause semantics
 * distinguish literal from reflective use ("carries it home" with it = a
 * logbook vs. it = a lost home; "weight of what" + literal vs.
 * reflective clause). Narrowing further would reintroduce false negatives
 * on legitimate reflection — the exact bug being fixed. This is
 * recall-oriented by design: the gate ANDs reflection with companion
 * presence AND next-episode tease, and failures route to the bounded
 * repair-and-revalidate loop (not to terminal rejection). (Note:
 * requireLlmJudgment is set by the validator but presently unconsumed
 * downstream — it is NOT an executed model review, so approval rests on
 * accepting the ambiguity, not on downstream judgment resolving it.)
 * Flat plot recaps with no invitation grammar at all still return false
 * (19 negative fixtures).
 */
export function hasEmotionalResidueOrReflection(text: string): boolean {
  const emotionalMarkers =
    /\b(gasping|wonder|wondering|haunt|heartbreak|awe|dread|terror|unease|tension|longing|yearning|revelation|shocking|stunned|moment|leaves you|left you|you won't forget|forever changed)\b/i
  const reflectionMarkers =
    /\b(question|questioning|ponder|mystery|answer|truth|secret|revealed|reveal|understand|realize|realization|consequence|cost|choice|decision)\b/i
  // Shared abstract-complement vocabulary: emotional/abstract nouns only.
  // Concrete nouns (truck, toolbox, ladder, bell, rain, steps, logbook)
  // can never satisfy these positions.
  const abstractNouns =
    'loss|losses|grief|love|choice|choices|silence|memory|memories|waiting|leaving|' +
    'sacrifice|sacrifices|longing|regret|regrets|hope|hopes|fear|fears|loneliness|' +
    'goodbye|goodbyes|absence|years|truth|secret|secrets|sorrow|dream|dreams|' +
    'questions?|promises?|burden|burdens|shame|songs?|stor(?:y|ies)|laughter|music|meaning|history|tears'
  const possessedAbstract = '(her|his|their|your|my|our) (' + abstractNouns + ')'
  const determinedAbstract = '((that|this|the) (' + abstractNouns + '))'
  const abstractComplement = '(what|losing|' + abstractNouns + '|' + possessedAbstract + '|' + determinedAbstract + ')'
  const reflectionInvitationMarkers = new RegExp(
    '\\b(sit with that' +
      '|hold (on to|onto) that (feeling|moment|memory|memories|thought|hope|tight|close)' +
      '|hold (on to|onto) this (moment|feeling|memory|thought|hope)' +
      '|hold (that|this) (thought|feeling|moment|close)' +
      '|let (that|it|this) (settle|sink in|sit|rest|linger)' +
      '|take a (moment|second|minute|breath)' +
      '|ask yourself' +
      '|what would you' +
      '|the weight of ' + abstractComplement +
      '|weighs on' +
      '|heavy with (' + abstractNouns + ')' +
      '|stays with you|stay with you' +
      '|(a lot|so much|too much|much) to carry' +
      '|carr(?:y|ies|ying|ied) (that|this|it|them) (' + abstractNouns + '|home|forward|with (you|her|him|them|us))' +
      '|carry the weight' +
      '|lingers? (on|over) (that|this) (thought|feeling|moment|memory|memories)' +
      '|lingers? with (you|her|him|them|us)' +
      '|echo(?:es)? of (what|' + abstractNouns + '|' + possessedAbstract + '|' + determinedAbstract + ')' +
      '|remember (this|that|what)' +
    ')\\b',
    'i'
  )
  return (
    emotionalMarkers.test(text) ||
    reflectionMarkers.test(text) ||
    reflectionInvitationMarkers.test(text)
  )
}

export { hashScript }

/** Audit entry recorded under script_json.series_generation on Belle repair. */
export interface BelleRepairAuditEntry {
  /** Action string naming the repair, e.g. 'series_belle_retry_repair'. */
  action: string
  /** ISO timestamp of the repair. */
  timestamp: string
  /** production_jobs id that performed the repair. */
  jobId: string
  /** Repaired story id. */
  storyId: string
  /** Episode number (null when unknown). */
  episodeNumber: number | null
  /** sha256 (lib/continuityPin hashScript) of the script before repair. */
  beforeHash: string
  /** sha256 (lib/continuityPin hashScript) of the script after repair. */
  afterHash: string
  repairedIntro: boolean
  repairedOutro: boolean
}

export function buildBelleRepairAuditEntry(args: {
  action?: string
  jobId: string
  storyId: string
  episodeNumber?: number | null
  beforeScript: string | null | undefined
  afterScript: string | null | undefined
  repairedIntro: boolean
  repairedOutro: boolean
  at?: string
}): BelleRepairAuditEntry {
  return {
    action: args.action || 'series_belle_retry_repair',
    timestamp: args.at || new Date().toISOString(),
    jobId: String(args.jobId),
    storyId: String(args.storyId),
    episodeNumber:
      typeof args.episodeNumber === 'number' ? args.episodeNumber : null,
    beforeHash: hashScript(args.beforeScript),
    afterHash: hashScript(args.afterScript),
    repairedIntro: Boolean(args.repairedIntro),
    repairedOutro: Boolean(args.repairedOutro),
  }
}

/**
 * Pure merge: append a Belle repair audit entry under
 * script_json.series_generation.belle_repair_audit (array, append-only).
 * Preserves every existing series_generation key (notably
 * continuity_pins_used).
 */
export function applyBelleRepairAudit(
  scriptJson: any,
  entry: BelleRepairAuditEntry
): Record<string, any> {
  const base =
    scriptJson && typeof scriptJson === 'object' ? { ...scriptJson } : {}
  const seriesGen =
    base.series_generation && typeof base.series_generation === 'object'
      ? { ...base.series_generation }
      : {}
  const prev = Array.isArray(seriesGen.belle_repair_audit)
    ? seriesGen.belle_repair_audit
    : []
  return {
    ...base,
    series_generation: {
      ...seriesGen,
      belle_repair_audit: [...prev, entry],
    },
  }
}

export interface DependentPinUpdate {
  id: string
  script_json: Record<string, any>
}

/**
 * Pure pin resync: for every dependent episode whose
 * script_json.series_generation.continuity_pins_used references the edited
 * story id with a STALE hash, return a replacement script_json with the pin
 * set to the edited episode's new script hash. Episodes that do not pin the
 * edited story, or already carry the new hash, produce no update. Never
 * touches siblings that do not depend on the edited episode.
 */
export function resyncContinuityPinsAfterRepair(
  dependentEpisodes: any[],
  editedStoryId: string,
  newScriptHash: string
): DependentPinUpdate[] {
  const updates: DependentPinUpdate[] = []
  for (const ep of dependentEpisodes || []) {
    if (!ep || String(ep.id) === String(editedStoryId)) continue
    const seriesGen = ep.script_json?.series_generation
    const pins =
      seriesGen && typeof seriesGen === 'object'
        ? (seriesGen.continuity_pins_used as Record<string, string> | undefined)
        : undefined
    if (!pins || typeof pins !== 'object') continue
    if (!(String(editedStoryId) in pins)) continue
    if (String(pins[String(editedStoryId)]) === String(newScriptHash)) continue
    updates.push({
      id: String(ep.id),
      script_json: {
        ...(ep.script_json && typeof ep.script_json === 'object'
          ? ep.script_json
          : {}),
        series_generation: {
          ...(typeof seriesGen === 'object' ? seriesGen : {}),
          continuity_pins_used: {
            ...(pins as Record<string, string>),
            [String(editedStoryId)]: String(newScriptHash),
          },
        },
      },
    })
  }
  return updates
}

/**
 * Column-level audio invalidation scoped to the ONE repaired episode row.
 * Outro repair nulls ONLY outro_audio_url + outro_with_music_url; intro
 * repair nulls ONLY announcement_url. Never siblings, never segments, music,
 * or mixes (audio_url / story_audio_url are mix-level and regenerate via the
 * doneByEp=false retry flags). The caller applies the result with
 * `.eq('id', repairedStoryId)` so no other row is touched.
 */
export function belleRepairAudioInvalidation(
  repairIntro: boolean,
  repairOutro: boolean
): Record<string, null> {
  return {
    ...(repairIntro ? { announcement_url: null } : {}),
    ...(repairOutro
      ? { outro_audio_url: null, outro_with_music_url: null }
      : {}),
  } as Record<string, null>
}
