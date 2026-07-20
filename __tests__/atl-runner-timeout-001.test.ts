/**
 * ATL-RUNNER-TIMEOUT-001 — per-step run-next abort budget.
 *
 * The pipeline runner's flat 90s AbortSignal on the run-next fetch was
 * killing healthy render_final_mix calls on long episodes (>90s ffmpeg
 * concat + two-pass loudnorm). The aborted job stayed running+locked,
 * zombie cleanup reset it, the next invocation re-rendered from scratch,
 * and the cycle repeated (zombie lock thrash).
 *
 * Fix: runNextTimeoutMs(step) — 600s for render_final_mix and
 * series_render_final_mix, 90s default for everything else.
 *
 * Invariants pinned here:
 *   1. Final-mix steps get 600s; all other steps keep 90s.
 *   2. Unknown/null/undefined steps fall back to the 90s default
 *      (never zero, never unlimited).
 *   3. The final-mix budget fits inside the runner invocation deadline
 *      (740s) and under the heartbeat zombie threshold (15 min), so a
 *      healthy long render can complete without tripping self-healing.
 */

import {
  runNextTimeoutMs,
  RUN_NEXT_TIMEOUT_DEFAULT_MS,
  RUN_NEXT_TIMEOUT_MS_BY_STEP,
} from '@/lib/pipeline-runner/runner'

// Mirror runner.ts constants (not exported; keep in sync)
const RUNNER_DEADLINE_MS = 740_000
const HEARTBEAT_ZOMBIE_MS = 15 * 60 * 1000

describe('ATL-RUNNER-TIMEOUT-001: per-step run-next timeout', () => {
  test('render_final_mix gets the extended 600s budget', () => {
    expect(runNextTimeoutMs('render_final_mix')).toBe(600_000)
  })

  test('series_render_final_mix gets the extended 600s budget', () => {
    expect(runNextTimeoutMs('series_render_final_mix')).toBe(600_000)
  })

  test('ordinary steps keep the 90s default', () => {
    for (const step of [
      'create_story_row',
      'generate_script',
      'validate_script',
      'voice_preflight',
      'generate_voices',
      'generate_belle_assets',
      'generate_music',
      'complete_story_package',
      'ready_for_review',
      'series_generate_voices',
      'series_generate_music',
    ]) {
      expect(runNextTimeoutMs(step)).toBe(90_000)
    }
  })

  test('null/undefined/unknown steps fall back to the default (never 0, never unlimited)', () => {
    expect(runNextTimeoutMs(null)).toBe(RUN_NEXT_TIMEOUT_DEFAULT_MS)
    expect(runNextTimeoutMs(undefined)).toBe(RUN_NEXT_TIMEOUT_DEFAULT_MS)
    expect(runNextTimeoutMs('some_future_step')).toBe(RUN_NEXT_TIMEOUT_DEFAULT_MS)
    // Prototype pollution guard: inherited keys must not resolve as overrides
    expect(runNextTimeoutMs('toString')).toBe(RUN_NEXT_TIMEOUT_DEFAULT_MS)
    expect(runNextTimeoutMs('hasOwnProperty')).toBe(RUN_NEXT_TIMEOUT_DEFAULT_MS)
  })

  test('default is 90s (unchanged for non-final-mix steps)', () => {
    expect(RUN_NEXT_TIMEOUT_DEFAULT_MS).toBe(90_000)
  })

  test('every per-step override is positive, above default, and fits the runner budget', () => {
    for (const [step, ms] of Object.entries(RUN_NEXT_TIMEOUT_MS_BY_STEP)) {
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeGreaterThanOrEqual(RUN_NEXT_TIMEOUT_DEFAULT_MS)
      // Must complete inside one runner invocation (740s deadline)…
      expect(ms).toBeLessThan(RUNNER_DEADLINE_MS)
      // …and under the heartbeat zombie threshold, so a healthy render
      // in progress is never reset by self-healing mid-flight.
      expect(ms).toBeLessThan(HEARTBEAT_ZOMBIE_MS)
      expect(typeof step).toBe('string')
    }
  })
})
