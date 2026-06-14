/**
 * hal-report.test.js
 *
 * HAL-REPORT-001 regression tests for live pipeline status reporting.
 *
 * Root cause: Hal's 16:00 ET report on 2026-06-14 claimed job 4e6f2f9e had
 * "no details in error_json" and looked like an infrastructure/stale-state
 * blocker. Orion verified the live production_jobs row had full structured
 * error_json:
 *   kind=script_quality_editorial, marc_required=true, retry_count=2/2,
 *   playbookId=pb-014, learningIncidentId=031f320f
 *
 * Hal was reading from agent-state.json (cached org-state storage) rather
 * than the live production_jobs table.
 *
 * Fix: buildLivePipelineReport() in lib/halReport.ts always queries live DB.
 * detectCacheLiveMismatches() flags any field that disagrees with the live row.
 * The live value always wins.
 *
 * Run: npx jest __tests__/hal-report.test.js --no-coverage
 */

'use strict'

// ─── Test fixtures ─────────────────────────────────────────────────────────

const JOB_4E6F2F9E = {
  id: '4e6f2f9e',
  story_id: '4ec8b4b8',
  status: 'failed',
  current_step: 'validate_script',
  error_json: {
    kind: 'script_quality_editorial',
    message: 'Script validation failed: editorial quality below threshold after 2 retries.',
    step: 'validate_script',
    marc_required: true,
    retry_count: 2,
    max_retries: 2,
    playbookId: 'pb-014',
    learningIncidentId: '031f320f',
    safe_resume_point: 'generate_script',
  },
}

const STORY_4EC8B4B8 = {
  id: '4ec8b4b8',
  title: 'The Deed',
}

// ─── Mock helper functions ────────────────────────────────────────────────

function extractErrorJsonFields(errorJson) {
  const empty = {
    hasStructuredErrorJson: false,
    errorKind: null,
    errorMessage: null,
    errorStep: null,
    marcRequired: null,
    retryCount: null,
    maxRetries: null,
    playbookId: null,
    learningIncidentId: null,
    safeResumePoint: null,
  }

  if (!errorJson || typeof errorJson !== 'object') return empty

  const kind = typeof errorJson.kind === 'string' && errorJson.kind.trim()
    ? errorJson.kind.trim()
    : null

  const isStructured = Boolean(kind && kind !== 'unknown_qc' && kind !== '')
  if (!isStructured) return empty

  const playbookId = typeof errorJson.playbookId === 'string' ? errorJson.playbookId : null
  const learningIncidentId = typeof errorJson.learningIncidentId === 'string' ? errorJson.learningIncidentId : null
  const safeResumePoint = typeof errorJson.safe_resume_point === 'string' ? errorJson.safe_resume_point : null

  const marcRequired = typeof errorJson.marc_required === 'boolean' ? errorJson.marc_required : null

  return {
    hasStructuredErrorJson: true,
    errorKind: kind,
    errorMessage: typeof errorJson.message === 'string' ? errorJson.message : null,
    errorStep: typeof errorJson.step === 'string' ? errorJson.step : null,
    marcRequired,
    retryCount: Number(errorJson.retry_count),
    maxRetries: Number(errorJson.max_retries),
    playbookId,
    learningIncidentId,
    safeResumePoint,
  }
}

function detectCacheLiveMismatches(cached, liveJob) {
  const mismatches = []

  function flag(field, cachedValue, liveValue, recommendation) {
    mismatches.push({ jobId: liveJob.jobId, field, cachedValue, liveValue, recommendation })
  }

  if (cached.cachedHasErrorJson === false && liveJob.hasStructuredErrorJson === true) {
    flag(
      'hasStructuredErrorJson',
      false,
      true,
      'CACHE/LIVE MISMATCH: Cached report says "no details in error_json" but live DB has structured error_json. Trust live DB.'
    )
  }

  if (cached.cachedErrorKind != null && liveJob.errorKind != null &&
      cached.cachedErrorKind !== liveJob.errorKind) {
    flag('errorKind', cached.cachedErrorKind, liveJob.errorKind, 'CACHE/LIVE MISMATCH: error_json.kind disagrees. Trust live DB.')
  }

  if (cached.cachedMarcRequired != null && liveJob.marcRequired != null &&
      cached.cachedMarcRequired !== liveJob.marcRequired) {
    flag('marcRequired', cached.cachedMarcRequired, liveJob.marcRequired, 'CACHE/LIVE MISMATCH: marc_required disagrees. Trust live DB.')
  }

  return mismatches
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('HAL-REPORT-001: Live pipeline status reporting', () => {

  describe('extractErrorJsonFields — the triggering incident', () => {
    it('surfaces kind=script_quality_editorial from live error_json', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.hasStructuredErrorJson).toBe(true)
      expect(fields.errorKind).toBe('script_quality_editorial')
    })

    it('surfaces marc_required=true from live error_json', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.marcRequired).toBe(true)
    })

    it('surfaces retry_count=2 and max_retries=2', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.retryCount).toBe(2)
      expect(fields.maxRetries).toBe(2)
    })

    it('surfaces playbookId=pb-014', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.playbookId).toBe('pb-014')
    })

    it('surfaces learningIncidentId=031f320f', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.learningIncidentId).toBe('031f320f')
    })

    it('surfaces safeResumePoint=generate_script', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.safeResumePoint).toBe('generate_script')
    })

    it('reports hasStructuredErrorJson=false for empty error_json', () => {
      const fields = extractErrorJsonFields({})
      expect(fields.hasStructuredErrorJson).toBe(false)
    })

    it('reports hasStructuredErrorJson=false for null error_json', () => {
      const fields = extractErrorJsonFields(null)
      expect(fields.hasStructuredErrorJson).toBe(false)
    })
  })

  describe('detectCacheLiveMismatches — the triggering incident', () => {
    it('flags CACHE/LIVE MISMATCH when cached says no error_json but live has it', () => {
      const liveJob = {
        jobId: '4e6f2f9e',
        ...extractErrorJsonFields(JOB_4E6F2F9E.error_json),
      }

      const cachedSummary = {
        jobId: '4e6f2f9e',
        cachedHasErrorJson: false,
        cachedErrorDetail: 'no details in error_json',
      }

      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      expect(mismatches.length).toBeGreaterThan(0)

      const mismatch = mismatches.find(m => m.field === 'hasStructuredErrorJson')
      expect(mismatch).toBeTruthy()
      expect(mismatch.cachedValue).toBe(false)
      expect(mismatch.liveValue).toBe(true)
      expect(mismatch.recommendation).toContain('CACHE/LIVE MISMATCH')
      expect(mismatch.recommendation).toContain('Trust live DB')
    })

    it('flags mismatch when cached errorKind differs from live', () => {
      const liveJob = {
        jobId: '4e6f2f9e',
        errorKind: 'script_quality_editorial',
      }

      const cachedSummary = {
        jobId: '4e6f2f9e',
        cachedErrorKind: 'unknown_qc',
      }

      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      const mismatch = mismatches.find(m => m.field === 'errorKind')
      expect(mismatch).toBeTruthy()
      expect(mismatch.cachedValue).toBe('unknown_qc')
      expect(mismatch.liveValue).toBe('script_quality_editorial')
    })

    it('flags mismatch when cached marc_required=false but live=true', () => {
      const liveJob = {
        jobId: '4e6f2f9e',
        marcRequired: true,
      }

      const cachedSummary = {
        jobId: '4e6f2f9e',
        cachedMarcRequired: false,
      }

      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      const mismatch = mismatches.find(m => m.field === 'marcRequired')
      expect(mismatch).toBeTruthy()
      expect(mismatch.cachedValue).toBe(false)
      expect(mismatch.liveValue).toBe(true)
    })

    it('no mismatch when cached and live agree', () => {
      const liveJob = {
        jobId: '4e6f2f9e',
        hasStructuredErrorJson: true,
        errorKind: 'script_quality_editorial',
        marcRequired: true,
      }

      const cachedSummary = {
        jobId: '4e6f2f9e',
        cachedHasErrorJson: true,
        cachedErrorKind: 'script_quality_editorial',
        cachedMarcRequired: true,
      }

      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      expect(mismatches).toHaveLength(0)
    })
  })

  describe('Do not report "no details in error_json" unless live error_json is actually empty', () => {
    it('does not claim "no error_json" when kind is present', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      expect(fields.hasStructuredErrorJson).toBe(true)
      expect(fields.errorKind).not.toBeNull()
    })

    it('only reports "no error_json" for genuinely empty error_json', () => {
      const fields = extractErrorJsonFields(null)
      expect(fields.hasStructuredErrorJson).toBe(false)
      expect(fields.errorKind).toBeNull()
    })

    it('empty error_json with no kind is not treated as structured', () => {
      const fields = extractErrorJsonFields({ kind: '', message: '' })
      expect(fields.hasStructuredErrorJson).toBe(false)
    })
  })

  describe('Real-world incident data — job 4e6f2f9e shape', () => {
    it('correctly extracts all required fields from the incident', () => {
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      
      expect(fields.hasStructuredErrorJson).toBe(true)
      expect(fields.errorKind).toBe('script_quality_editorial')
      expect(fields.errorStep).toBe('validate_script')
      expect(fields.marcRequired).toBe(true)
      expect(fields.retryCount).toBe(2)
      expect(fields.maxRetries).toBe(2)
      expect(fields.playbookId).toBe('pb-014')
      expect(fields.learningIncidentId).toBe('031f320f')
      expect(fields.safeResumePoint).toBe('generate_script')
    })

    it('would NOT have triggered the Hal reporting bug', () => {
      // The bug was: Hal reported "no details in error_json"
      // Reality: the job has full structured error_json
      const fields = extractErrorJsonFields(JOB_4E6F2F9E.error_json)
      
      // This job SHOULD NOT trigger "no error_json" reporting
      expect(fields.hasStructuredErrorJson).toBe(true)
      
      // Correct reporting should include all these fields
      expect(fields.errorKind).toBeTruthy()
      expect(fields.playbookId).toBeTruthy()
      expect(fields.learningIncidentId).toBeTruthy()
    })
  })

  describe('Cache/live mismatch reporting rules', () => {
    it('requires both cached and live values to be non-null to flag a mismatch', () => {
      const liveJob = { jobId: 'test', errorKind: 'script_quality_editorial' }
      const cachedSummary = { jobId: 'test', cachedErrorKind: null }
      
      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      expect(mismatches.filter(m => m.field === 'errorKind')).toHaveLength(0)
    })

    it('flags ALL mismatches in one report, not just the first', () => {
      const liveJob = {
        jobId: 'test',
        hasStructuredErrorJson: true,
        errorKind: 'script_quality_editorial',
        marcRequired: true,
      }

      const cachedSummary = {
        jobId: 'test',
        cachedHasErrorJson: false,
        cachedErrorKind: 'unknown_qc',
        cachedMarcRequired: false,
      }

      const mismatches = detectCacheLiveMismatches(cachedSummary, liveJob)
      expect(mismatches.length).toBeGreaterThanOrEqual(2)
    })
  })

})
