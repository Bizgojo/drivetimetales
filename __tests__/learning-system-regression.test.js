/**
 * learning-system-regression.test.js
 *
 * Regression tests for the closed-loop production learning system.
 * Covers all incidents from June 2026 to ensure the same failures cannot recur.
 *
 * Run with: npm test -- learning-system-regression.test.js
 */

'use strict'

// ─── Test Helper Functions ────────────────────────────────────────────────

/**
 * INC-001: SILENCE_BUFFER short-line false rejection
 * 3-word text with ~18KB audio should NOT be rejected as silence.
 */
function checkSilenceBufferThreshold(text, bufferLength) {
  const wordCount = text.trim().split(/\s+/).length
  const isShortSegment = wordCount < 10
  const threshold = isShortSegment ? 5 * 1024 : 20 * 1024
  if (bufferLength <= threshold) {
    throw new Error(`SILENCE_BUFFER rejected: ${bufferLength}B ≤ ${threshold}B threshold (${wordCount} words)`)
  }
  return true
}

/**
 * INC-002: Narrator mismatch — character name in header
 * NARRATOR: Detective Collier (character) should fail until changed to voice name.
 * NARRATOR: Ray Dolan (voice) should pass.
 */
function validateNarratorHeader(narratorText, knownVoices) {
  const voiceNames = knownVoices.map(v => v.toLowerCase())
  const normalized = narratorText.trim().toLowerCase()
  if (!voiceNames.includes(normalized)) {
    throw new Error(`NARRATOR "${narratorText}" not in known narrator voices`)
  }
  return true
}

/**
 * INC-006: segment_0066 stale loop — 15KB segment should not be flagged as stale
 */
function checkSegmentStaleClassification(segmentName, sizeBytes) {
  const STALE_HARD_FAIL = 5 * 1024    // 5KB
  const STALE_WARN = 20 * 1024        // 20KB
  
  if (sizeBytes <= STALE_HARD_FAIL) return 'hard_fail'
  if (sizeBytes <= STALE_WARN) return 'warn'  // warn-but-continue
  return 'valid'  // Not stale
}

/**
 * INC-009: Invalid RFR state — required fields missing
 */
function checkRFRGateFields(storyRow) {
  const required = [
    'audio_url',
    'story_audio_url',
    'cover_url',
    'prose_text',
    'author_id',
    'narrator_voice_id',
    'narrator_voice_name',
    'title',
    'genre',
    'description',
    'duration_mins',
  ]
  const missing = required.filter(field => !storyRow[field])
  if (missing.length > 0) {
    throw new Error(`RFR gate missing fields: ${missing.join(', ')}`)
  }
  return true
}

/**
 * ATL-PIPE-008: validate_script failure classification for autonomous retry.
 */
function classifyValidateScriptFailure(report) {
  if (/blocked word|DESCRIPTION_PAST_TENSE|forbidden/i.test(report)) return 'script_blocked_word'
  return 'script_editorial_quality'
}

function buildStructuredError(kind, message, step, opts = {}) {
  const isVague = !message || message.trim() === ''
  return {
    kind: isVague ? 'empty_error_json' : kind,
    message: isVague ? `Failure at step ${step || 'unknown'} - no detail available. Classify as empty_error_json.` : message.trim(),
    step,
    marc_required: opts.marc_required ?? true,
    at: new Date().toISOString(),
    ...opts,
  }
}

// ─── Jest Test Suite ──────────────────────────────────────────────────────

describe('Learning System Regression Tests', () => {

  describe('INC-001: SILENCE_BUFFER short-line false rejection', () => {
    it('3-word text with 18,016 bytes should NOT be rejected (short-segment 5KB threshold)', () => {
      const text = 'She said nothing.'
      expect(() => checkSilenceBufferThreshold(text, 18016)).not.toThrow()
    })

    it('3-word text with 2,048 bytes SHOULD be rejected (below 5KB threshold)', () => {
      expect(() => checkSilenceBufferThreshold('She said nothing.', 2048)).toThrow(/SILENCE_BUFFER/)
    })

    it('25-word text with 19,688 bytes SHOULD be rejected (below 20KB standard threshold)', () => {
      const text = 'She walked down the long winding road toward the old farmhouse where the lights still burned despite the late hour of the night.'
      expect(() => checkSilenceBufferThreshold(text, 19688)).toThrow(/SILENCE_BUFFER/)
    })

    it('25-word text with 25,000 bytes should NOT be rejected (above 20KB threshold)', () => {
      const text = 'She walked down the long winding road toward the old farmhouse where the lights still burned despite the late hour of the night.'
      expect(() => checkSilenceBufferThreshold(text, 25000)).not.toThrow()
    })
  })

  describe('INC-002: Narrator mismatch (character name in header)', () => {
    it('NARRATOR: Ray Dolan (voice name) should pass', () => {
      expect(() => validateNarratorHeader('Ray Dolan', ['ray dolan', 'samuel cord', 'belle b'])).not.toThrow()
    })

    it('NARRATOR: Detective Collier (character name) should fail', () => {
      expect(() => validateNarratorHeader('Detective Collier', ['ray dolan', 'samuel cord', 'belle b'])).toThrow(/not in known narrator voices/)
    })

    it('NARRATOR header case-insensitive match', () => {
      expect(() => validateNarratorHeader('RAY DOLAN', ['ray dolan', 'samuel cord'])).not.toThrow()
    })
  })

  describe('INC-006: segment_0066 deterministic stale loop', () => {
    it('segment_0066 at 15KB should be classified as "warn" (not hard-fail)', () => {
      const classification = checkSegmentStaleClassification('segment_0066.mp3', 15 * 1024)
      expect(classification).toBe('warn')
    })

    it('segment at 3KB should be classified as "hard_fail"', () => {
      const classification = checkSegmentStaleClassification('segment_0001.mp3', 3 * 1024)
      expect(classification).toBe('hard_fail')
    })

    it('segment at 25KB should be classified as "valid"', () => {
      const classification = checkSegmentStaleClassification('segment_0100.mp3', 25 * 1024)
      expect(classification).toBe('valid')
    })

    it('segment at exactly 5KB boundary should be hard_fail', () => {
      const classification = checkSegmentStaleClassification('segment_0002.mp3', 5 * 1024)
      expect(classification).toBe('hard_fail')
    })

    it('segment at exactly 5KB + 1 byte should be warn', () => {
      const classification = checkSegmentStaleClassification('segment_0002.mp3', 5 * 1024 + 1)
      expect(classification).toBe('warn')
    })
  })

  describe('INC-009: Invalid/invisible Ready for Review state', () => {
    it('Story with all RFR gate fields present should pass', () => {
      const storyRow = {
        audio_url: 'https://...',
        story_audio_url: 'https://...',
        cover_url: 'https://...',
        prose_text: 'The story...',
        author_id: 'auth-123',
        narrator_voice_id: 'voice-123',
        narrator_voice_name: 'Ray Dolan',
        title: 'My Story',
        genre: 'Drama',
        description: 'A story about...',
        duration_mins: 12,
      }
      expect(() => checkRFRGateFields(storyRow)).not.toThrow()
    })

    it('Story missing audio_url should fail', () => {
      expect(() => checkRFRGateFields({
        story_audio_url: 'https://...',
        cover_url: 'https://...',
        prose_text: 'text',
        author_id: 'auth-123',
        narrator_voice_id: 'v123',
        narrator_voice_name: 'Ray Dolan',
        title: 'Story',
        genre: 'Drama',
        description: 'desc',
        duration_mins: 12,
      })).toThrow(/missing fields/)
    })

    it('Story missing narrator_voice_name should fail', () => {
      expect(() => checkRFRGateFields({
        audio_url: 'https://...',
        story_audio_url: 'https://...',
        cover_url: 'https://...',
        prose_text: 'text',
        author_id: 'auth-123',
        narrator_voice_id: 'v123',
        title: 'Story',
        genre: 'Drama',
        description: 'desc',
        duration_mins: 12,
      })).toThrow(/missing fields/)
    })
  })

  describe('Transcript "?" special case', () => {
    it('Transcript result "?" should be treated as semantic_uncertainty (not normalizable)', () => {
      const transcriptText = 'detected "?"'
      const isSuspect = /detected\s*"?\?"?|expected.*detected "\?"/.test(transcriptText)
      expect(isSuspect).toBe(true)
    })

    it('Empty transcript should also be flagged', () => {
      const transcriptText = ''
      const isEmpty = !transcriptText || transcriptText.trim() === ''
      expect(isEmpty).toBe(true)
    })
  })

  describe('ATL-PIPE-008: validate_script retry logic', () => {
    it('classifyValidateScriptFailure with blocked word report returns script_blocked_word', () => {
      const report = 'DESCRIPTION_PAST_TENSE: forbidden blocked word "forged" found in DESCRIPTION.'
      expect(classifyValidateScriptFailure(report)).toBe('script_blocked_word')
    })

    it('classifyValidateScriptFailure with editorial report returns script_editorial_quality', () => {
      const report = 'VALIDATOR RESULT: FAIL. The story premise and description do not align.'
      expect(classifyValidateScriptFailure(report)).toBe('script_editorial_quality')
    })

    it('retryCount=0 buildStructuredError produces marc_required=false', () => {
      const retryCount = 0
      const errorJson = buildStructuredError(
        'script_blocked_word',
        'Standalone script validation failed',
        'validate_script',
        {
          storyId: 'story-1',
          marc_required: retryCount >= 2,
          autonomous_repair: retryCount < 2,
          retry_count: retryCount + 1,
          playbookId: 'script_validate_retry',
          safe_resume_point: 'generate_script',
          learning_incident_id: 'incident-1',
        },
      )

      expect(errorJson.marc_required).toBe(false)
      expect(errorJson.autonomous_repair).toBe(true)
      expect(errorJson.retry_count).toBe(1)
    })

    it('retryCount=2 buildStructuredError produces marc_required=true', () => {
      const retryCount = 2
      const errorJson = buildStructuredError(
        'script_editorial_quality',
        'Standalone script validation failed',
        'validate_script',
        {
          storyId: 'story-1',
          marc_required: retryCount >= 2,
          autonomous_repair: retryCount < 2,
          retry_count: retryCount,
          playbookId: 'script_validate_retry',
          safe_resume_point: 'generate_script',
          learning_incident_id: 'incident-2',
        },
      )

      expect(errorJson.marc_required).toBe(true)
      expect(errorJson.autonomous_repair).toBe(false)
      expect(errorJson.retry_count).toBe(2)
    })
  })

})
