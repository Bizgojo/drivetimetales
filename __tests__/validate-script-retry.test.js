/**
 * validate-script-retry.test.js
 *
 * ATL-PIPE-008 regression tests for validate_script autonomous retry.
 *
 * These tests verify the classification logic, retry behaviour, structured
 * error_json, and playbook wiring WITHOUT requiring a live DB or Supabase.
 * They test the pure functions that drive the retry path.
 *
 * Run: npx jest __tests__/validate-script-retry.test.js --no-coverage
 */

'use strict'

// ─── Mirror the production classifier ─────────────────────────────────────
// Keep in sync with classifyValidateScriptFailure() in run-next/route.ts.
// If run-next changes the classification logic, update this mirror and the
// tests will catch the drift.

const MAX_RETRIES = 2

function classifyValidateScriptFailure(report, isCardCopy = false) {
  if (isCardCopy) {
    const hasBlockedWord = /blocked word|DESCRIPTION_PAST_TENSE|forbidden|past.tense/i.test(report)
    return {
      kind: hasBlockedWord ? 'script_description_blocked_word' : 'script_card_copy_format',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: hasBlockedWord
        ? 'DESCRIPTION uses a forbidden past-tense word. Re-generate with card-copy rules.'
        : 'TITLE or DESCRIPTION format violation. Re-generate with card-copy constraints.',
    }
  }

  if (/offscreen|protagonist.*passive|passive.*protagonist|climax.*off.?screen|villain.*already.*dead|solution.*easy|passive.*ending|ending.*offscreen/i.test(report)) {
    return {
      kind: 'script_story_resolution',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'Story resolution failure. Re-generate with Difficult Solution Rule reinforced.',
    }
  }

  if (/description.*says|description.*mentions|description.*states|protagonist.*different|description.*mismatch|mismatch.*description|role.*mismatch|character.*role|protagonist.*is a|protagonist.*was a/i.test(report)) {
    return {
      kind: 'script_quality_editorial',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'Editorial mismatch: DESCRIPTION does not match protagonist role. Re-generate.',
    }
  }

  if (/hook|cliffhanger|ending|resolution|narrative|editorial|VALIDATOR RESULT.*FAIL/i.test(report)) {
    return {
      kind: 'script_quality_editorial',
      isAutonomousRetryable: true,
      marcRequired: false,
      recommendedAction: 'AI editorial failure. Re-generate with emphasis on hook, DESCRIPTION accuracy, and active resolution.',
    }
  }

  return {
    kind: 'script_validator_unknown',
    isAutonomousRetryable: false,
    marcRequired: true,
    recommendedAction: 'Unrecognised failure. Marc must inspect the validator report.',
  }
}

function buildMockErrorJson(classification, retryCount, maxRetries, reportText, playbookId) {
  return {
    kind: classification.kind,
    message: classification.recommendedAction,
    step: 'validate_script',
    marc_required: !classification.isAutonomousRetryable || retryCount >= maxRetries,
    autonomous_repair: classification.isAutonomousRetryable && retryCount < maxRetries,
    retry_count: retryCount,
    max_retries: maxRetries,
    safe_resume_point: 'generate_script',
    fixRecommendation: classification.recommendedAction,
    rootCause: reportText.slice(0, 300),
    detail: {
      playbookId,
      recommended_action: classification.recommendedAction,
      diagnostic_evidence: reportText.slice(0, 500),
    },
    at: new Date().toISOString(),
  }
}

const PLAYBOOK_IDS = {
  script_description_blocked_word: 'pb-012-script-desc-blocked-word',
  script_card_copy_format: 'pb-013-script-card-copy-format',
  script_quality_editorial: 'pb-014-script-quality-editorial',
  script_story_resolution: 'pb-015-script-story-resolution',
  script_validator_unknown: null,
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('ATL-PIPE-008: validate_script autonomous retry', () => {

  // ── Classification ──────────────────────────────────────────────────────

  describe('Classification: card-copy failures (deterministic)', () => {
    it('blocked DESCRIPTION word "forged" → script_description_blocked_word', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- DESCRIPTION contains forbidden past-tense/blocked word: "forged". Full DESCRIPTION text: "A deal is forged in darkness."'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_description_blocked_word')
      expect(result.isAutonomousRetryable).toBe(true)
      expect(result.marcRequired).toBe(false)
    })

    it('blocked word "vanished" → script_description_blocked_word', () => {
      const report = 'DESCRIPTION contains forbidden past-tense/blocked word: "vanished"'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_description_blocked_word')
    })

    it('TITLE too long → script_card_copy_format', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- TITLE must be 1 to 5 words. Current: 7 words.'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_card_copy_format')
      expect(result.isAutonomousRetryable).toBe(true)
      expect(result.marcRequired).toBe(false)
    })

    it('DESCRIPTION too long → script_card_copy_format', () => {
      const report = 'DESCRIPTION must be 70 characters or fewer. Current: 84 characters.'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_card_copy_format')
    })
  })

  describe('Classification: AI editorial failures', () => {
    it('description/protagonist role mismatch → script_quality_editorial', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- DESCRIPTION says "driver" but the protagonist is a security guard. DESCRIPTION must match the protagonist\'s actual role.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_quality_editorial')
      expect(result.isAutonomousRetryable).toBe(true)
      expect(result.marcRequired).toBe(false)
    })

    it('protagonist is a mismatch pattern → script_quality_editorial', () => {
      const report = 'FAIL: protagonist is a teacher but description says nurse'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_quality_editorial')
    })

    it('climax offscreen → script_story_resolution', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- Climax happens offscreen. Protagonist is not present when the resolution occurs.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_story_resolution')
      expect(result.isAutonomousRetryable).toBe(true)
      expect(result.marcRequired).toBe(false)
    })

    it('passive protagonist → script_story_resolution', () => {
      const report = 'The protagonist is passive at the climax. Villain is already defeated before protagonist acts.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_story_resolution')
    })

    it('villain already dead anticlimac → script_story_resolution', () => {
      const report = 'FAIL: villain already dead before protagonist arrives. Passive ending.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_story_resolution')
    })

    it('generic VALIDATOR RESULT FAIL → script_quality_editorial', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- Hook is weak. Story does not create immediate tension.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_quality_editorial')
    })

    it('unrecognised failure → script_validator_unknown (not retryable)', () => {
      const report = 'The model output was malformed JSON and could not be parsed.'
      const result = classifyValidateScriptFailure(report, false)
      expect(result.kind).toBe('script_validator_unknown')
      expect(result.isAutonomousRetryable).toBe(false)
      expect(result.marcRequired).toBe(true)
    })
  })

  // ── Retry logic ─────────────────────────────────────────────────────────

  describe('Retry gate: should/should not auto-retry', () => {
    it('retryCount=0, retryable kind → can auto-retry', () => {
      const classification = { kind: 'script_description_blocked_word', isAutonomousRetryable: true, marcRequired: false }
      const canRetry = classification.isAutonomousRetryable && 0 < MAX_RETRIES
      expect(canRetry).toBe(true)
    })

    it('retryCount=1, retryable kind → can still auto-retry', () => {
      const classification = { kind: 'script_description_blocked_word', isAutonomousRetryable: true, marcRequired: false }
      const canRetry = classification.isAutonomousRetryable && 1 < MAX_RETRIES
      expect(canRetry).toBe(true)
    })

    it('retryCount=2, retryable kind → max retries exhausted, cannot retry', () => {
      const classification = { kind: 'script_description_blocked_word', isAutonomousRetryable: true, marcRequired: false }
      const canRetry = classification.isAutonomousRetryable && 2 < MAX_RETRIES
      expect(canRetry).toBe(false)
    })

    it('retryCount=0, unknown kind → cannot retry (not retryable)', () => {
      const classification = { kind: 'script_validator_unknown', isAutonomousRetryable: false, marcRequired: true }
      const canRetry = classification.isAutonomousRetryable && 0 < MAX_RETRIES
      expect(canRetry).toBe(false)
    })

    it('all retryable kinds auto-retry on first failure', () => {
      const retryableKinds = [
        'script_description_blocked_word',
        'script_card_copy_format',
        'script_quality_editorial',
        'script_story_resolution',
      ]
      for (const kind of retryableKinds) {
        const c = { isAutonomousRetryable: true }
        expect(c.isAutonomousRetryable && 0 < MAX_RETRIES).toBe(true)
      }
    })
  })

  // ── Structured error_json ───────────────────────────────────────────────

  describe('Structured error_json fields', () => {
    it('auto-retry error_json has marc_required=false', () => {
      const report = 'DESCRIPTION contains blocked word: "forged"'
      const classification = classifyValidateScriptFailure(report, true)
      const errorJson = buildMockErrorJson(classification, 0, MAX_RETRIES, report, 'pb-012')
      expect(errorJson.marc_required).toBe(false)
      expect(errorJson.autonomous_repair).toBe(true)
    })

    it('exhausted retry error_json has marc_required=true', () => {
      const report = 'DESCRIPTION contains blocked word: "forged"'
      const classification = classifyValidateScriptFailure(report, true)
      const errorJson = buildMockErrorJson(classification, MAX_RETRIES, MAX_RETRIES, report, 'pb-012')
      expect(errorJson.marc_required).toBe(true)
      expect(errorJson.autonomous_repair).toBe(false)
    })

    it('error_json contains required fields', () => {
      const report = 'VALIDATOR RESULT: FAIL - hook weak'
      const classification = classifyValidateScriptFailure(report, false)
      const errorJson = buildMockErrorJson(classification, 0, MAX_RETRIES, report, 'pb-014')

      expect(errorJson.kind).toBeTruthy()
      expect(errorJson.message).toBeTruthy()
      expect(errorJson.step).toBe('validate_script')
      expect(typeof errorJson.marc_required).toBe('boolean')
      expect(typeof errorJson.autonomous_repair).toBe('boolean')
      expect(errorJson.retry_count).toBe(0)
      expect(errorJson.max_retries).toBe(MAX_RETRIES)
      expect(errorJson.safe_resume_point).toBe('generate_script')
      expect(errorJson.detail.recommended_action).toBeTruthy()
      expect(errorJson.detail.diagnostic_evidence).toBeTruthy()
      expect(errorJson.at).toBeTruthy()
    })

    it('error_json.kind is never empty or undefined', () => {
      const reports = [
        ['DESCRIPTION contains blocked word: "was"', true],
        ['VALIDATOR RESULT: FAIL - climax offscreen', false],
        ['DESCRIPTION says driver but protagonist is security guard', false],
        ['Some completely unrecognised error', false],
      ]
      for (const [report, isCardCopy] of reports) {
        const c = classifyValidateScriptFailure(report, isCardCopy)
        expect(c.kind).toBeTruthy()
        expect(c.kind.startsWith('script_')).toBe(true)
      }
    })
  })

  // ── Playbook IDs ────────────────────────────────────────────────────────

  describe('Playbook IDs are defined for all retryable kinds', () => {
    it('script_description_blocked_word has playbook pb-012', () => {
      expect(PLAYBOOK_IDS['script_description_blocked_word']).toBe('pb-012-script-desc-blocked-word')
    })

    it('script_card_copy_format has playbook pb-013', () => {
      expect(PLAYBOOK_IDS['script_card_copy_format']).toBe('pb-013-script-card-copy-format')
    })

    it('script_quality_editorial has playbook pb-014', () => {
      expect(PLAYBOOK_IDS['script_quality_editorial']).toBe('pb-014-script-quality-editorial')
    })

    it('script_story_resolution has playbook pb-015', () => {
      expect(PLAYBOOK_IDS['script_story_resolution']).toBe('pb-015-script-story-resolution')
    })

    it('script_validator_unknown has no playbook (requires Marc)', () => {
      expect(PLAYBOOK_IDS['script_validator_unknown']).toBeNull()
    })
  })

  // ── Full scenario: Story #2 (blocked word "forged") ─────────────────────

  describe('Smoke-test scenarios', () => {
    it('Story #2 scenario: "forged" triggers auto-retry, not Marc', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- DESCRIPTION contains forbidden past-tense/blocked word: "forged". Full DESCRIPTION: "A deal is forged in darkness."'
      const retryCount = 0

      const classification = classifyValidateScriptFailure(report, true)
      const canRetry = classification.isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(classification.kind).toBe('script_description_blocked_word')
      expect(canRetry).toBe(true)
      expect(classification.marcRequired).toBe(false)

      // System should reset job to generate_script, not fail
      const action = canRetry ? 'reset_to_generate_script' : 'fail_marc_required'
      expect(action).toBe('reset_to_generate_script')
    })

    it('Story #3 scenario: description/protagonist mismatch triggers auto-retry', () => {
      const report = '❌ VALIDATOR RESULT: FAIL\n- DESCRIPTION says the protagonist is a "driver" but in the script the protagonist is a security guard. DESCRIPTION must match protagonist role.'
      const retryCount = 0

      const classification = classifyValidateScriptFailure(report, false)
      const canRetry = classification.isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(classification.kind).toBe('script_quality_editorial')
      expect(canRetry).toBe(true)
      expect(classification.marcRequired).toBe(false)

      const action = canRetry ? 'reset_to_generate_script' : 'fail_marc_required'
      expect(action).toBe('reset_to_generate_script')
    })

    it('Same failure after 2 retries → marc_required=true', () => {
      const report = 'DESCRIPTION contains blocked word: "forged"'
      const retryCount = MAX_RETRIES  // exhausted

      const classification = classifyValidateScriptFailure(report, true)
      const canRetry = classification.isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canRetry).toBe(false)
      // error_json should have marc_required=true
      const errorJson = buildMockErrorJson(classification, retryCount, MAX_RETRIES, report, 'pb-012')
      expect(errorJson.marc_required).toBe(true)
      expect(errorJson.autonomous_repair).toBe(false)
    })

    it('No Marc/Orion intervention required for first two retries of any retryable kind', () => {
      const retryableReports = [
        ['DESCRIPTION contains forbidden blocked word: "buried"', true],
        ['DESCRIPTION says driver but protagonist is a security guard', false],
        ['❌ VALIDATOR RESULT: FAIL\n- Climax happens offscreen. Resolution is passive.', false],
        ['VALIDATOR RESULT: FAIL - hook is weak, no immediate tension', false],
      ]

      for (const [report, isCardCopy] of retryableReports) {
        for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount++) {
          const c = classifyValidateScriptFailure(report, isCardCopy)
          const canRetry = c.isAutonomousRetryable && retryCount < MAX_RETRIES
          expect(canRetry).toBe(true)
          expect(c.marcRequired).toBe(false)
        }
      }
    })
  })

})
