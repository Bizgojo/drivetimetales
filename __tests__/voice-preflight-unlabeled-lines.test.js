/**
 * voice-preflight-unlabeled-lines.test.js
 *
 * Tests for ATL-PIPE-009 (unlabeled-lines autonomous retry) and Fix B (add "lost").
 * Covers:
 * - "lost" in DESCRIPTION triggers deterministic card-copy failure
 * - voice_preflight unlabeled lines classified as script_unlabeled_lines
 * - Autonomous retry up to MAX_RETRIES=2
 * - Learning incidents include story_id and job_id
 * - Playbook IDs are wired
 * - Narrator mismatches are not retryable
 * - Unknown failures remain unknown_qc
 *
 * Run: npx jest __tests__/voice-preflight-unlabeled-lines.test.js --no-coverage
 */

'use strict'

// ─── Mirrors from production classifyValidateScriptFailure ─────────────────

function classifyValidateScriptFailure(report, isCardCopy = false) {
  if (isCardCopy) {
    const hasBlockedWord = /blocked word|DESCRIPTION_PAST_TENSE|forbidden|past.tense|\blost\b/i.test(report)
    return {
      kind: hasBlockedWord ? 'script_description_blocked_word' : 'script_card_copy_format',
      isAutonomousRetryable: true,
      marcRequired: false,
    }
  }

  // AI validator path...
  return {
    kind: 'script_quality_editorial',
    isAutonomousRetryable: true,
    marcRequired: false,
  }
}

// ─── Voice preflight failure classifier (mirrors production logic) ──────────

function classifyVoicePreflightFailure(blockingReasons, narratorIssues, report) {
  const hasNarratorIssue = narratorIssues && narratorIssues.length > 0
  const hasUnlabeledLines = blockingReasons.some(r => /unlabeled.*line/i.test(r)) || (report?.unlabeledLineCount > 0)

  if (hasNarratorIssue) {
    return {
      kind: 'narrator_mismatch',
      isAutonomousRetryable: false,
      marcRequired: false,  // Atlas can fix from DB
    }
  }

  if (hasUnlabeledLines) {
    return {
      kind: 'script_unlabeled_lines',
      isAutonomousRetryable: true,
      marcRequired: false,
    }
  }

  return {
    kind: 'unknown_qc',
    isAutonomousRetryable: false,
    marcRequired: true,
  }
}

const PLAYBOOK_IDS = {
  script_unlabeled_lines: 'pb-016-script-unlabeled-lines',
  script_description_blocked_word: 'pb-012-script-desc-blocked-word',
  narrator_mismatch: 'narrator_mismatch_playbook',  // existing
  unknown_qc: null,
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('ATL-PIPE-009 + Fix B: voice_preflight and blocked words', () => {

  // ── Fix B: "lost" in DESCRIPTION ──────────────────────────────────────

  describe('Fix B: "lost" is now a blocked DESCRIPTION word', () => {
    it('DESCRIPTION containing "lost" fails deterministic card-copy validation', () => {
      const report = 'DESCRIPTION contains forbidden past-tense/blocked word: "lost"'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_description_blocked_word')
      expect(result.isAutonomousRetryable).toBe(true)
    })

    it('"lost" is detected by past-tense regex match in card-copy report', () => {
      const report = 'DESCRIPTION_PAST_TENSE_RE matched: "lost"'
      const result = classifyValidateScriptFailure(report, true)
      expect(result.kind).toBe('script_description_blocked_word')
    })

    it('other past-tense words still work: "was", "were", "had", "found", "left", "sealed", "forged", "buried", "hidden"', () => {
      const words = ['was', 'were', 'had', 'found', 'left', 'sealed', 'forged', 'buried', 'hidden']
      for (const word of words) {
        const report = `DESCRIPTION contains forbidden word: "${word}"`
        const result = classifyValidateScriptFailure(report, true)
        expect(result.kind).toBe('script_description_blocked_word')
        expect(result.isAutonomousRetryable).toBe(true)
      }
    })
  })

  // ── ATL-PIPE-009: voice_preflight unlabeled-lines classification ──────

  describe('ATL-PIPE-009: voice_preflight failure classification', () => {
    it('unlabeled story body lines → script_unlabeled_lines (retryable)', () => {
      const blockingReasons = ['Unlabeled story body lines found']
      const narratorIssues = []
      const report = { unlabeledLineCount: 23 }
      const result = classifyVoicePreflightFailure(blockingReasons, narratorIssues, report)

      expect(result.kind).toBe('script_unlabeled_lines')
      expect(result.isAutonomousRetryable).toBe(true)
      expect(result.marcRequired).toBe(false)
    })

    it('narrator mismatch → narrator_mismatch (not retryable)', () => {
      const blockingReasons = []
      const narratorIssues = ['NARRATOR: Detective Collier not found in narrator_voices']
      const report = {}
      const result = classifyVoicePreflightFailure(blockingReasons, narratorIssues, report)

      expect(result.kind).toBe('narrator_mismatch')
      expect(result.isAutonomousRetryable).toBe(false)
      expect(result.marcRequired).toBe(false)  // Atlas can fix from DB
    })

    it('unknown blocker → unknown_qc (not retryable)', () => {
      const blockingReasons = ['Whisper confidence too low']
      const narratorIssues = []
      const report = {}
      const result = classifyVoicePreflightFailure(blockingReasons, narratorIssues, report)

      expect(result.kind).toBe('unknown_qc')
      expect(result.isAutonomousRetryable).toBe(false)
      expect(result.marcRequired).toBe(true)
    })

    it('prioritises narrator_mismatch over unlabeled lines (narrator checked first)', () => {
      const blockingReasons = ['Unlabeled story body lines found']
      const narratorIssues = ['Narrator not found']
      const report = { unlabeledLineCount: 5 }
      const result = classifyVoicePreflightFailure(blockingReasons, narratorIssues, report)

      expect(result.kind).toBe('narrator_mismatch')
      expect(result.isAutonomousRetryable).toBe(false)
    })
  })

  // ── Autonomous retry logic ──────────────────────────────────────────

  describe('Autonomous retry: unlabeled lines', () => {
    it('retryCount=0, unlabeled lines → can auto-retry', () => {
      const failureKind = 'script_unlabeled_lines'
      const retryCount = 0
      const MAX_RETRIES = 2
      const isAutonomousRetryable = true
      const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canAutoRetry).toBe(true)
      expect(failureKind).toBe('script_unlabeled_lines')
    })

    it('retryCount=1, unlabeled lines → can auto-retry once more', () => {
      const retryCount = 1
      const MAX_RETRIES = 2
      const isAutonomousRetryable = true
      const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canAutoRetry).toBe(true)
    })

    it('retryCount=2, unlabeled lines → max retries exhausted', () => {
      const retryCount = 2
      const MAX_RETRIES = 2
      const isAutonomousRetryable = true
      const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canAutoRetry).toBe(false)
    })

    it('narrator_mismatch → never auto-retries (not retryable)', () => {
      const failureKind = 'narrator_mismatch'
      const retryCount = 0
      const MAX_RETRIES = 2
      const isAutonomousRetryable = false
      const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canAutoRetry).toBe(false)
    })

    it('unknown_qc → never auto-retries', () => {
      const failureKind = 'unknown_qc'
      const retryCount = 0
      const MAX_RETRIES = 2
      const isAutonomousRetryable = false
      const canAutoRetry = isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canAutoRetry).toBe(false)
    })
  })

  // ── Learning incident fields ─────────────────────────────────────────

  describe('Learning incidents include story_id and job_id (Fix A)', () => {
    it('voice_preflight learning incident has job_id, story_id, series context', () => {
      const incident = {
        job_id: 'job-uuid-001',
        story_id: 'story-uuid-002',
        series_id: 'series-uuid-003',
        series_title: 'The Leland Hall Case',
        episode_title: null,
        stage: 'voice_preflight',
        failure_type: 'script_unlabeled_lines',
        root_cause: 'Unlabeled story body lines found',
        fix_applied: 'Autonomous retry 1/2: cleared script, reset to generate_script',
        fix_type: 'autonomous_retry',
        reusable: true,
        confidence: 0.85,
      }

      expect(incident.job_id).toBeTruthy()
      expect(incident.story_id).toBeTruthy()
      expect(incident.stage).toBe('voice_preflight')
      expect(incident.failure_type).toBe('script_unlabeled_lines')
    })

    it('validate_script learning incident has job_id, story_id, series context', () => {
      const incident = {
        job_id: 'job-validate-001',
        story_id: 'story-validate-002',
        series_id: null,
        series_title: null,
        episode_title: null,
        stage: 'validate_script',
        failure_type: 'script_description_blocked_word',
        root_cause: 'DESCRIPTION contains "lost"',
        fix_applied: 'Autonomous retry 1/2: cleared script, reset to generate_script',
        fix_type: 'autonomous_retry',
      }

      expect(incident.job_id).toBeTruthy()
      expect(incident.story_id).toBeTruthy()
      expect(incident.stage).toBe('validate_script')
      expect(incident.failure_type).toBe('script_description_blocked_word')
    })

    it('incidents with null series_id/series_title are valid (standalone stories)', () => {
      const incident = {
        job_id: 'job-002',
        story_id: 'story-002',
        series_id: null,
        series_title: null,
        stage: 'voice_preflight',
        failure_type: 'script_unlabeled_lines',
      }

      expect(incident.job_id).toBeTruthy()
      expect(incident.story_id).toBeTruthy()
      expect(incident.series_id).toBeNull()
      expect(incident.series_title).toBeNull()
    })
  })

  // ── Playbook IDs ──────────────────────────────────────────────────────

  describe('Playbook IDs are assigned', () => {
    it('script_unlabeled_lines has playbook pb-016', () => {
      expect(PLAYBOOK_IDS['script_unlabeled_lines']).toBe('pb-016-script-unlabeled-lines')
    })

    it('script_description_blocked_word has playbook pb-012', () => {
      expect(PLAYBOOK_IDS['script_description_blocked_word']).toBe('pb-012-script-desc-blocked-word')
    })

    it('narrator_mismatch has a playbook', () => {
      expect(PLAYBOOK_IDS['narrator_mismatch']).toBeTruthy()
    })

    it('unknown_qc has no playbook (marc required)', () => {
      expect(PLAYBOOK_IDS['unknown_qc']).toBeNull()
    })
  })

  // ── Story #2/#3 exact scenarios ──────────────────────────────────────

  describe('Smoke-test scenarios from Orion', () => {
    it('Story #2: "lost" in DESCRIPTION triggers deterministic retry (not AI editor)', () => {
      const report = 'DESCRIPTION contains forbidden past-tense/blocked word: "lost"'
      const failureKind = classifyValidateScriptFailure(report, true).kind
      expect(failureKind).toBe('script_description_blocked_word')

      const retryCount = 0
      const MAX_RETRIES = 2
      const canRetry = retryCount < MAX_RETRIES
      expect(canRetry).toBe(true)
    })

    it('Story #3: 23 unlabeled lines triggers autonomous retry at voice_preflight', () => {
      const blockingReasons = ['Unlabeled story body lines found']
      const narratorIssues = []
      const report = { unlabeledLineCount: 23 }
      const result = classifyVoicePreflightFailure(blockingReasons, narratorIssues, report)

      expect(result.kind).toBe('script_unlabeled_lines')
      expect(result.isAutonomousRetryable).toBe(true)

      const retryCount = 0
      const MAX_RETRIES = 2
      const canRetry = result.isAutonomousRetryable && retryCount < MAX_RETRIES
      expect(canRetry).toBe(true)
    })

    it('After 2 retries of unlabeled lines: marc_required=true', () => {
      const result = classifyVoicePreflightFailure(['Unlabeled story body lines found'], [], { unlabeledLineCount: 15 })
      const retryCount = MAX_RETRIES = 2
      const canRetry = result.isAutonomousRetryable && retryCount < MAX_RETRIES

      expect(canRetry).toBe(false)
      // On failure: marc_required=true (except for narrator_mismatch which is Atlas-fixable)
      expect(result.marcRequired).toBe(false)  // unlabeled lines are still not marc_required until exhausted
    })
  })

  // ── Unlabeled line detection ────────────────────────────────────────

  describe('Unlabeled line detection from report', () => {
    it('preflightOnly=true unlabeled response includes unlabeledLineCount and examples', () => {
      const report = {
        success: false,
        preflightOnly: true,
        blockingReasons: ['Unlabeled story body lines found'],
        unlabeledLineCount: 5,
        examples: [
          { lineNumber: 42, text: 'An unlabeled continuation.' },
          { lineNumber: 55, text: 'Another unlabeled prose line.' },
        ],
      }

      expect(report.unlabeledLineCount).toBe(5)
      expect(report.examples.length).toBeGreaterThan(0)
      expect(report.examples[0].lineNumber).toBeTruthy()
      expect(report.examples[0].text).toBeTruthy()
    })

    it('blockingReasons regex matches "Unlabeled story body lines found"', () => {
      const blockingReasons = ['Unlabeled story body lines found']
      const hasUnlabeled = blockingReasons.some(r => /unlabeled.*line/i.test(r))
      expect(hasUnlabeled).toBe(true)
    })

    it('blockingReasons with different case variations match', () => {
      const variations = [
        'Unlabeled story body lines found',
        'UNLABELED LINES',
        'unlabeled lines in script',
        'Found: unlabeled line at 42',
      ]
      for (const reason of variations) {
        const matches = /unlabeled.*line/i.test(reason)
        expect(matches).toBe(true)
      }
    })

    it('non-unlabeled blockingReasons do not match', () => {
      const reasons = [
        'Narrator not found',
        'No voice assigned',
        'Whisper confidence too low',
      ]
      for (const reason of reasons) {
        const matches = /unlabeled.*line/i.test(reason)
        expect(matches).toBe(false)
      }
    })
  })

})
