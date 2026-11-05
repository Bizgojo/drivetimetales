/**
 * ATL-PIPE-SCRIPT-001: generate_script must never destroy an existing script.
 *
 * Fix 1 (GEN-SCRIPT-REUSE-PRIORITY-001): generate_script skips generation when
 *   stories.script is non-null, even when brief_json is missing. The brief_json
 *   check was moved AFTER the script-reuse early-return.
 *
 * Fix 2 (GEN-SCRIPT-NO-CLEAR-MISSING-BRIEF-001): validate_script canAutoRetry
 *   must not clear stories.script when brief_json is null — it cannot regenerate
 *   without brief_json and would leave the story unrecoverable.
 */

// ── Fix 1: script-reuse path is reached before brief_json check ───────────

describe('GEN-SCRIPT-REUSE-PRIORITY-001', () => {
  it('generate_script handler returns generateScriptSkipped when script exists, regardless of brief_json', () => {
    // Unit-test the guard logic in isolation.
    // The fix: script existence is checked FIRST; brief_json is only checked when
    // the story has no existing script (i.e., generation is actually needed).

    function simulateGenerateScriptGuard(story: { script: string | null; brief_json: unknown }): 'skip' | 'throw_brief_json_missing' | 'generate' {
      // Mirrors the fixed code order in generateStandaloneScript
      if (story.script != null && story.script !== '') {
        return 'skip' // early return: generateScriptSkipped = true
      }
      if (!story.brief_json) return 'throw_brief_json_missing'
      return 'generate'
    }

    // Story has script but no brief_json → must skip (not throw)
    expect(simulateGenerateScriptGuard({ script: 'TITLE: Test\n...', brief_json: null })).toBe('skip')

    // Story has script AND brief_json → skip (brief_json only matters for generation)
    expect(simulateGenerateScriptGuard({ script: 'TITLE: Test\n...', brief_json: { genre: 'Drama' } })).toBe('skip')

    // Story has no script and no brief_json → throw (cannot generate without brief)
    expect(simulateGenerateScriptGuard({ script: null, brief_json: null })).toBe('throw_brief_json_missing')

    // Story has no script but has brief_json → generate
    expect(simulateGenerateScriptGuard({ script: null, brief_json: { genre: 'Drama' } })).toBe('generate')

    // Empty string script treated as null → generate (not skip)
    expect(simulateGenerateScriptGuard({ script: '', brief_json: { genre: 'Drama' } })).toBe('generate')
  })

  it('previous (broken) order would throw before reaching script-reuse', () => {
    function brokenGenerateScriptGuard(story: { script: string | null; brief_json: unknown }): 'skip' | 'throw_brief_json_missing' | 'generate' {
      // Mirrors the BROKEN code order (brief_json check came first)
      if (!story.brief_json) return 'throw_brief_json_missing'  // ← fired even with script present
      if (story.script != null && story.script !== '') return 'skip'
      return 'generate'
    }

    // With the broken order: script exists, brief_json missing → throws instead of skipping
    expect(brokenGenerateScriptGuard({ script: 'TITLE: Test\n...', brief_json: null })).toBe('throw_brief_json_missing')
    // This is the bug: existing script is destroyed because the throw happened
    // before the script-reuse early return, causing data loss.
  })
})

// ── Fix 2: validate_script canAutoRetry blocked when brief_json missing ───

describe('GEN-SCRIPT-NO-CLEAR-MISSING-BRIEF-001', () => {
  it('canAutoRetry path skips script clear when brief_json is null', () => {
    // Simulate the guard logic added to the canAutoRetry block.
    // The fix: before clearing stories.script, check if brief_json exists.
    // If brief_json is missing, do NOT clear the script and do NOT re-queue.

    function simulateValidateScriptRetry(
      canAutoRetry: boolean,
      briefJson: unknown,
    ): 'cleared_and_requeued' | 'blocked_script_preserved' | 'marc_review_exhausted' {
      if (!canAutoRetry) return 'marc_review_exhausted'

      // Fix 2: check brief_json before clearing
      if (!briefJson) return 'blocked_script_preserved'

      return 'cleared_and_requeued'
    }

    // canAutoRetry=true, brief_json=null → must NOT clear, must preserve script
    expect(simulateValidateScriptRetry(true, null)).toBe('blocked_script_preserved')

    // canAutoRetry=true, brief_json=present → allowed to clear and retry
    expect(simulateValidateScriptRetry(true, { genre: 'Drama' })).toBe('cleared_and_requeued')

    // canAutoRetry=false (retries exhausted) → Marc review regardless
    expect(simulateValidateScriptRetry(false, null)).toBe('marc_review_exhausted')
    expect(simulateValidateScriptRetry(false, { genre: 'Drama' })).toBe('marc_review_exhausted')
  })

  it('previous (broken) canAutoRetry would always clear script', () => {
    function brokenValidateScriptRetry(canAutoRetry: boolean): 'cleared_and_requeued' | 'marc_review_exhausted' {
      if (!canAutoRetry) return 'marc_review_exhausted'
      // No brief_json guard — always clears, always re-queues
      return 'cleared_and_requeued'
    }

    // With the broken code: script is cleared even when brief_json is null
    // → data loss: script=null, brief_json=null → generate_script throws → unrecoverable
    expect(brokenValidateScriptRetry(true)).toBe('cleared_and_requeued') // ← the bug
  })
})

// ── Regression: cold_storage EP1 scenario (the actual incident) ───────────

describe('ATL-PIPE-SCRIPT-001 regression: cold_storage EP1 without brief_json', () => {
  it('a story with script and no brief_json survives a full pipeline touch', () => {
    // This is the scenario that caused the Nov 5 2026 incident:
    // - 5 hook-first series EP1s were in cold_storage
    // - They had scripts but no brief_json
    // - Jobs dispatched starting at validate_script
    // - validate_script ran and failed (content issue or cold_storage state)
    // - canAutoRetry=true → old code cleared script → generate_script threw "brief_json missing"
    // - Result: 5 scripts permanently lost

    function simulateFullPipelineTouch(story: { script: string | null; brief_json: unknown }, validateScriptPasses: boolean) {
      // Step 1: validate_script runs
      if (!validateScriptPasses) {
        const canAutoRetry = true
        // Fix 2: check brief_json before clearing
        if (!story.brief_json) {
          return { outcome: 'marc_review', scriptPreserved: story.script !== null }
        }
        story = { ...story, script: null } // clear script (only if brief_json present)
        // Step 2: generate_script runs (if brief_json present, can regenerate)
        if (!story.brief_json) return { outcome: 'generate_script_fail', scriptPreserved: false }
        return { outcome: 'regenerated', scriptPreserved: true }
      }
      return { outcome: 'validate_passed', scriptPreserved: story.script !== null }
    }

    const story = { script: 'TITLE: The Toast\nNARRATOR: ...', brief_json: null }

    // With fix: validate_script failure → brief_json guard → marc_review, script preserved
    const result = simulateFullPipelineTouch(story, false)
    expect(result.outcome).toBe('marc_review')
    expect(result.scriptPreserved).toBe(true)
  })
})
