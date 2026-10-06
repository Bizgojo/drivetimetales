/**
 * model-router.ts — R1-V3 step map (decision r1-v3-step-map-approved-oct6, 2026-10-06)
 *
 * Central router: routeStep(stepName) -> { model, owner }.
 *
 * Route A — Strategos / DeepSeek R1 (deepseek-reasoner): ideation & briefs.
 *   story-brief, story-idea (generate-story-idea).
 * Route B — Lyra / DeepSeek R1 (deepseek-reasoner): validation, scoring, QC verdicts.
 *   validate_script, score_script (5-dim), series score_validate_package,
 *   validate_story_resolution, quality-gate validate, belle QC verdict
 *   (validate_belle_quality).
 * Route C — Hal / Claude Sonnet (claude-sonnet-4-6, unchanged interface):
 *   generate_script, generate_episode_script (series), apply_top_fixes /
 *   repair_belle_quality, cover/description/belle prose
 *   (regenerateSeriesDescriptionFromEpisodeFeedback, belle asset prose).
 * Atlas / V3 (deepseek-chat): deterministic gates + audio plumbing own the
 *   code path — NO LLM call. Listed here for ownership only.
 * Orion / Spark: run-next orchestration (no model call).
 *
 * Fallback: if the routed provider's env key is missing, callers fall back
 * to the current Claude models (pre-redeploy safe). See hasDeepSeekEnv().
 */

export type StepOwner = 'strategos' | 'lyra' | 'hal' | 'atlas' | 'orion'
export type StepProvider = 'deepseek-r1' | 'deepseek-v3' | 'claude-sonnet' | 'none'

export interface StepRoute {
  /** Logical step name (pipeline current_step or function-level step). */
  step: string
  /** Owning agent. */
  owner: StepOwner
  /** Provider tier for this step. 'none' = deterministic, no LLM call. */
  provider: StepProvider
  /** Concrete model id to request. Null when provider is 'none'. */
  model: string | null
  /** True when this route needs no LLM call (Atlas deterministic gates, Orion orchestration). */
  deterministic: boolean
}

// Concrete model ids.
export const DEEPSEEK_R1_MODEL = 'deepseek-reasoner'
export const DEEPSEEK_V3_MODEL = 'deepseek-chat'
export const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-6'

// Legacy Claude fallback models (pre-redeploy safe). Used when the routed
// provider's env key is absent.
export const FALLBACK_GENERATE_MODEL = 'claude-opus-4-6'
export const FALLBACK_VALIDATE_MODEL = 'claude-sonnet-4-6'

// ── Route A: Strategos / R1 — ideation & briefs ─────────────────────────────
const ROUTE_A_STEPS = new Set([
  'story-brief',
  'story_brief',
  'story-idea',
  'story_idea',
  'generate_story_idea',
])

// ── Route B: Lyra / R1 — validation, scoring, QC verdicts ───────────────────
const ROUTE_B_STEPS = new Set([
  'validate-script',
  'validate_script',
  'score-script',
  'score_script',
  'score-validate',
  'score_validate_package',
  'validate_story_resolution',
  'validate-story-resolution',
  'resolution-check',
  'resolution_check',
  'quality-gate-validate',
  'quality_gate_validate',
  'validate_belle_quality',
  'validate-belle-quality',
  'belle-qc-verdict',
  'belle_qc_verdict',
  'validate_belle_assets',
  'validate-belle-assets',
  'validate_voice_conformance',
  'validate-voice-conformance',
  'validate_episode_script',
  'validate_series_episode_script',
  'validate_series_package',
])

// ── Route C: Hal / Sonnet — generation + prose repair ───────────────────────
const ROUTE_C_STEPS = new Set([
  'generate-script',
  'generate_script',
  'generate-scripts-series',
  'generate_episode_script',
  'apply-top-fixes',
  'apply_top_fixes',
  'repair_belle_quality',
  'repair-belle-quality',
  'cover-prose',
  'description-prose',
  'belle-prose',
  'regenerate_belle_from_feedback',
  'regenerate_description_from_feedback',
  'regenerate_series_belle_from_feedback',
  'regenerate_series_description_from_feedback',
  'repair_standalone_belle_quality',
])

// ── Atlas / V3 ownership — deterministic gates + audio plumbing (NO LLM) ────
const ATLAS_STEPS = new Set([
  'voice_preflight',
  'voice-preflight',
  'series_voice_preflight',
  'generate_voices',
  'series_generate_voices',
  'generate_belle_assets',
  'series_generate_belle_assets',
  'generate_music',
  'series_generate_music',
  'render_final_mix',
  'series_render_final_mix',
  'complete_story_package',
  'ready_for_review',
  'card_copy_check',
  'duplicate_segment_check',
  'segment_length_check',
])

function normalize(stepName: string): string {
  return String(stepName || '').trim().toLowerCase().replace(/-/g, '_')
}

/**
 * Route a pipeline step to its owning agent + model.
 * Unknown steps default to Hal/Sonnet (current generation default) so
 * unmapped steps keep working pre/post redeploy.
 */
export function routeStep(stepName: string): StepRoute {
  const step = normalize(stepName)
  if (ROUTE_A_STEPS.has(step)) {
    return { step, owner: 'strategos', provider: 'deepseek-r1', model: DEEPSEEK_R1_MODEL, deterministic: false }
  }
  if (ROUTE_B_STEPS.has(step)) {
    return { step, owner: 'lyra', provider: 'deepseek-r1', model: DEEPSEEK_R1_MODEL, deterministic: false }
  }
  if (ATLAS_STEPS.has(step)) {
    return { step, owner: 'atlas', provider: 'none', model: null, deterministic: true }
  }
  if (step === 'run_next' || step === 'run-next' || step === 'orchestrate') {
    return { step, owner: 'orion', provider: 'none', model: null, deterministic: true }
  }
  // Default: Route C (Hal/Sonnet), incl. explicit Route C members.
  return { step, owner: 'hal', provider: 'claude-sonnet', model: CLAUDE_SONNET_MODEL, deterministic: false }
}

/** True when DEEPSEEK_API_KEY is present (never logs/prints the value). */
export function hasDeepSeekEnv(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.length > 0)
}

/**
 * Resolve the effective model id for a step, falling back to the current
 * Claude models when the DeepSeek env key is missing (pre-redeploy safe).
 * - Route A/B without env -> FALLBACK_VALIDATE_MODEL (sonnet)
 * - Route C -> CLAUDE_SONNET_MODEL (unchanged)
 * - Atlas/Orion deterministic -> null (no LLM call)
 */
export function resolveModelForStep(stepName: string): string | null {
  const route = routeStep(stepName)
  if (route.deterministic || route.model === null) return null
  if ((route.provider === 'deepseek-r1' || route.provider === 'deepseek-v3') && !hasDeepSeekEnv()) {
    return route.owner === 'strategos' ? FALLBACK_VALIDATE_MODEL : FALLBACK_VALIDATE_MODEL
  }
  return route.model
}

/**
 * ATL-VALMODEL-GUARD-001 (decision alderton-rerun-nooverride-guardpr-oct6-1634).
 * Belt-and-suspenders guard for the validation path: the validation step
 * resolves to a model id that is ALWAYS handed to the Anthropic client
 * (anthropic.messages.create). A stray non-Claude id (e.g. the DeepSeek R1
 * reasoner 'deepseek-reasoner', or any future non-claude id) must NEVER reach
 * the Anthropic client. This coerces any non-claude validation model id to the
 * safe Claude fallback (FALLBACK_VALIDATE_MODEL = claude-sonnet-4-6) before the
 * call is made.
 *
 * A model id counts as Claude when it begins with "claude" (case-insensitive,
 * after trim). Anything else — including empty/whitespace — coerces to the
 * fallback and logs a warning noting the coercion. Claude ids pass through
 * unchanged.
 *
 * Scope: validation-path guard ONLY. This does not wire DeepSeek into the
 * validation path and does not touch generation model selection.
 */
export function isClaudeModelId(modelId: string | null | undefined): boolean {
  return /^claude/i.test(String(modelId ?? '').trim())
}

export function coerceValidationModelToClaude(
  modelId: string | null | undefined,
  logger: { warn: (msg: string) => void } = console,
): string {
  const raw = String(modelId ?? '').trim()
  if (isClaudeModelId(raw)) return raw
  logger.warn(
    `[ATL-VALMODEL-GUARD-001] Non-Claude validation model id ${JSON.stringify(raw)} ` +
      `coerced to Claude fallback ${FALLBACK_VALIDATE_MODEL} before Anthropic client call. ` +
      `(Validation path only; a non-Claude id must never reach anthropic.messages.create.)`,
  )
  return FALLBACK_VALIDATE_MODEL
}

/** Back-compat: legacy { generate, validate } pair derived from the router. */
export function legacyStepModels(): { generate: string; validate: string } {
  if (!hasDeepSeekEnv()) {
    return { generate: FALLBACK_GENERATE_MODEL, validate: FALLBACK_VALIDATE_MODEL }
  }
  return { generate: CLAUDE_SONNET_MODEL, validate: DEEPSEEK_R1_MODEL }
}
