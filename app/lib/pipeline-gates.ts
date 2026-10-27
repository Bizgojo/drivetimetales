/**
 * SIMPLIFY-PIPELINE (Marc commission 2026-10-26) — canonical run-next critical
 * path + resume predicates.
 *
 * The run-next critical path is EXACTLY:
 *   V2 validate → ASC/preflight checks (incl. content gates) → voice
 *   generation → intro/outro → music/SFX (only what the story requires) →
 *   mix → publish (auto when gates pass, incl. Series Gate).
 *
 * INVARIANTS (enforced by tests in __tests__/simplify-pipeline.test.ts):
 *   1. Every pre-spend content-gate step sorts BEFORE every paid step.
 *      Content-gate failures therefore burn $0 of voice/music spend.
 *   2. Post-audio verification steps (verifiesAudio) stay post-spend by
 *      construction — they check generated artifacts — and are never
 *      weakened or removed.
 *   3. Resume reuses valid stages: a failed step retries ONLY the failed
 *      unit — valid audio/segments are never re-rendered.
 *
 * This module is pure (no DB, no network, no paid calls) so the invariants
 * are unit-testable with zero production writes.
 */

export type CriticalPhase =
  | 'validate'   // V2 validate: script/voice-conformance/resolution, package score
  | 'preflight'  // ASC checks: narrator/numeral/runtime + pre-voice content gate ($0)
  | 'voice'      // ElevenLabs narration segments (PAID)
  | 'belle'      // intro/outro assets: generation (PAID) then text+quality gates ($0)
  | 'music'      // music/SFX generation (PAID)
  | 'mix'        // final mix (local ffmpeg, $0 provider)
  | 'publish'    // package + ready_for_review / Series Gate
  | 'repair'     // bounded side-loop (repair_belle_quality), never on the hot path

export interface CriticalStep {
  step: string
  phase: CriticalPhase
  /** true when the step itself dispatches a paid provider call */
  paid: boolean
  /**
   * true when the step is a pre-spend content gate: it must precede ALL
   * paid steps, so its failures burn $0 of voice/music spend.
   * (SIMPLIFY-PIPELINE moved the hook + Belle-text checks into
   * voice_preflight / series_voice_preflight for exactly this reason.)
   */
  contentGate: boolean
  /**
   * true when the step verifies GENERATED AUDIO and therefore must run
   * post-spend by construction (asset existence, truncation/loudness QC,
   * final-text judge on the rendered copy). Never weakened, never moved
   * pre-audio — audio-dependent checks cannot run before audio exists.
   */
  verifiesAudio?: boolean
}

/** Standalone critical path, in execution order. */
export const STANDALONE_CRITICAL_PATH: CriticalStep[] = [
  { step: 'validate_voice_conformance', phase: 'validate', paid: false, contentGate: true },
  { step: 'validate_script',            phase: 'validate', paid: false, contentGate: true },
  { step: 'validate_story_resolution',  phase: 'validate', paid: false, contentGate: true },
  { step: 'voice_preflight',            phase: 'preflight', paid: false, contentGate: true },
  { step: 'generate_voices',            phase: 'voice',   paid: true,  contentGate: false },
  { step: 'generate_belle_assets',      phase: 'belle',   paid: true,  contentGate: false },
  { step: 'validate_belle_assets',      phase: 'belle',   paid: false, contentGate: false, verifiesAudio: true },
  { step: 'validate_belle_quality',     phase: 'belle',   paid: false, contentGate: false, verifiesAudio: true },
  { step: 'generate_music',             phase: 'music',   paid: true,  contentGate: false },
  { step: 'render_final_mix',           phase: 'mix',     paid: false, contentGate: false },
  { step: 'complete_story_package',     phase: 'publish', paid: false, contentGate: false },
  { step: 'ready_for_review',           phase: 'publish', paid: false, contentGate: false },
]

/** Series critical path, in execution order. */
export const SERIES_CRITICAL_PATH: CriticalStep[] = [
  { step: 'generate_episode_script',   phase: 'validate',  paid: false, contentGate: false },
  { step: 'score_validate_package',    phase: 'validate',  paid: false, contentGate: true },
  { step: 'series_voice_preflight',    phase: 'preflight', paid: false, contentGate: true },
  { step: 'series_generate_voices',    phase: 'voice',     paid: true,  contentGate: false },
  { step: 'series_generate_belle_assets', phase: 'belle',  paid: true,  contentGate: false },
  { step: 'series_generate_music',     phase: 'music',     paid: true,  contentGate: false },
  { step: 'series_render_final_mix',   phase: 'mix',       paid: false, contentGate: false },
  { step: 'complete_story_package',    phase: 'publish',   paid: false, contentGate: false },
]

/**
 * Returns violation messages when any content gate sorts at/after a paid
 * step. Empty array = gate ordering valid (content failures burn $0).
 */
export function assertGatesPrecedePaidCalls(path: CriticalStep[]): string[] {
  const violations: string[] = []
  const paidIndices = path
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.paid)
  for (const [gateIdx, gate] of path.entries()) {
    if (!gate.contentGate) continue
    for (const { s: paidStep, i: paidIdx } of paidIndices) {
      if (gateIdx >= paidIdx) {
        violations.push(
          `content gate "${gate.step}" (index ${gateIdx}) does not precede paid step "${paidStep.step}" (index ${paidIdx})`
        )
      }
    }
  }
  return violations
}

/**
 * HOOK-GATE-STALE-001 predicate (mirrors runStandaloneVoiceSegment):
 * purge stored voice segments ONLY on the very first voice-generation
 * invocation for a job (no prior progress recorded). A resume after a
 * transient failure must NOT purge — existing segments are good and are
 * reused via retryMissingOnly.
 */
export function shouldPurgeVoiceSegments(prev: {
  lastUpdatedAt?: unknown
  presentCount?: unknown
}): boolean {
  return !prev.lastUpdatedAt && !prev.presentCount
}

/**
 * Belle-asset reuse predicate (mirrors generate-voices generateBelleOnly):
 * an existing intro/outro recording is reused UNLESS the text was repaired
 * (repaired text invalidates the old recording).
 */
export function belleAssetShouldRender(opts: {
  hasExistingFile: boolean
  textRepaired: boolean
}): boolean {
  return !opts.hasExistingFile || opts.textRepaired
}

/**
 * Music reuse prefix predicate (mirrors runStandaloneMusicGeneration):
 * a recorded music URL is reusable when present and not a pending marker.
 * (The route additionally verifies the file exists in storage before reuse;
 * that IO stays in the route — this is the $0 pre-check.)
 */
export function musicUrlReusable(url: unknown): boolean {
  return typeof url === 'string' && url.trim().length > 0 && !url.trim().startsWith('pending:')
}
