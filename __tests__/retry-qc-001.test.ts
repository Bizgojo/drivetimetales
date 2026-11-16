/**
 * RETRY-QC-001 — a QC-rejected voices job must retry itself instead of
 * sitting idle until a human notices.
 *
 * Trigger: Mercy Island job 2f68f4cb sat failed for ~16h because
 * `Segment transcript QC failed ... expected "Nell.", detected "now."`
 * matched neither resume class (not a transport error, not a Belle block).
 */
import {
  qcResumeDecision,
  isResumableQcFailure,
  qcErrorTextOf,
  MAX_QC_RESUMES,
  QC_RESUME_BACKOFF_MS,
} from '@/lib/qcVerdictResume'

const T0 = Date.parse('2026-11-16T04:40:57.998Z')
const LATER = T0 + QC_RESUME_BACKOFF_MS[0] + 1000

function job(errorJson: unknown, over: Record<string, unknown> = {}) {
  return {
    status: 'failed',
    current_step: 'series_generate_voices',
    job_type: 'series_production',
    updated_at: new Date(T0).toISOString(),
    error_json: errorJson,
    state_json: {},
    ...over,
  }
}

// The exact error shape captured from production job 2f68f4cb.
const MERCY_ERROR = {
  at: '2026-11-16T04:40:57.998Z',
  step: 'series_generate_voices',
  message:
    'Segment transcript QC failed for segment_0015.mp3: expected "Nell.", detected "now." (similarity: 57.1%)',
  voiceGenerationReport: {
    failures: [
      {
        error:
          'Segment transcript QC failed for segment_0015.mp3: expected "Nell.", detected "now." (similarity: 57.1%)',
      },
    ],
  },
}

describe('RETRY-QC-001 — qcVerdictResume', () => {
  it('resumes the real Mercy Island failure after its back-off', () => {
    const d = qcResumeDecision(job(MERCY_ERROR), LATER)
    expect(d).toEqual({ action: 'resume', attempt: 1, step: 'series_generate_voices' })
  })

  it('finds the QC text nested under episodeResult (series wrapper)', () => {
    const wrapped = { at: T0, step: 'series_generate_voices', episodeResult: { error: MERCY_ERROR.message } }
    expect(qcErrorTextOf(wrapped)).toContain('transcript QC failed')
    expect(qcResumeDecision(job(wrapped), LATER)?.action).toBe('resume')
  })

  it('waits inside the back-off window', () => {
    expect(qcResumeDecision(job(MERCY_ERROR), T0 + 1000)).toEqual({
      action: 'wait',
      attempt: 1,
      retryAtMs: T0 + QC_RESUME_BACKOFF_MS[0],
    })
  })

  it('back-off grows each attempt (5, 15, 30 min)', () => {
    expect(QC_RESUME_BACKOFF_MS).toEqual([5 * 60000, 15 * 60000, 30 * 60000])
  })

  it('gives up after MAX_QC_RESUMES', () => {
    const d = qcResumeDecision(job(MERCY_ERROR, { state_json: { qcResumeCount: MAX_QC_RESUMES } }), LATER)
    expect(d).toEqual({ action: 'exhausted', attempt: MAX_QC_RESUMES })
  })

  it('counts attempts across resumes, and the second wait is longer', () => {
    const second = job(MERCY_ERROR, { state_json: { qcResumeCount: 1 } })
    // attempt 2 uses the 15-minute back-off, so the 5-minute mark is still 'wait'
    expect(qcResumeDecision(second, LATER)).toEqual({
      action: 'wait',
      attempt: 2,
      retryAtMs: T0 + QC_RESUME_BACKOFF_MS[1],
    })
    const afterSecond = T0 + QC_RESUME_BACKOFF_MS[1] + 1000
    expect(qcResumeDecision(second, afterSecond)).toEqual({
      action: 'resume',
      attempt: 2,
      step: 'series_generate_voices',
    })
  })

  it('resumes a loudness QC verdict too', () => {
    const loud = { message: 'Segment loudness QC failed for segment_0042.mp3: best candidate B 2.10 LUFS, -0.40 dBTP' }
    expect(qcResumeDecision(job(loud), LATER)?.action).toBe('resume')
  })

  // ── must never be auto-resumed ──────────────────────────────────────────
  it('does NOT resume REPEATED_IDENTICAL_TRUNCATION (code says retrying will not help)', () => {
    const t = {
      message:
        'Segment transcript QC failed for segment_0015.mp3 [REPEATED_IDENTICAL_TRUNCATION]: Whisper returned the same partial output "now." across all 3 retry candidates. Retrying will not help. Split this segment into shorter sub-segments.',
    }
    expect(qcResumeDecision(job(t), LATER)).toBeNull()
  })

  it('does NOT resume ambiguous audio (TRANSCRIPT_AMBIGUOUS)', () => {
    const t = { message: 'TRANSCRIPT_AMBIGUOUS: Segment segment_0007.mp3 - Whisper returned "?". This is not a QC normalisation case.' }
    expect(qcResumeDecision(job(t), LATER)).toBeNull()
  })

  it('does NOT resume account-wide causes (credits / keys)', () => {
    expect(qcResumeDecision(job({ ...MERCY_ERROR, transient_cause: 'elevenlabs_auth_or_quota' }), LATER)).toBeNull()
  })

  it('does NOT resume an already-exhausted job', () => {
    expect(qcResumeDecision(job({ ...MERCY_ERROR, exhausted: true }), LATER)).toBeNull()
  })

  it('does NOT resume network errors (that is RETRY-NET-001 territory)', () => {
    expect(qcResumeDecision(job({ message: 'TypeError: fetch failed' }), LATER)).toBeNull()
  })

  it('does NOT resume writer/preflight defects (content, not QC verdict)', () => {
    const t = { message: 'WRITER-SELF-CHECK-001: episode 5 still fails pre-save checks after 3 drafts' }
    expect(qcResumeDecision(job(t), LATER)).toBeNull()
  })

  it('ignores jobs that are not failed', () => {
    expect(qcResumeDecision(job(MERCY_ERROR, { status: 'running' }), LATER)).toBeNull()
    expect(qcResumeDecision(job(MERCY_ERROR, { status: 'queued' }), LATER)).toBeNull()
  })

  it('ignores TEST_ jobs even when they look like the real thing', () => {
    expect(qcResumeDecision(job(MERCY_ERROR, { job_type: 'TEST_series_production' }), LATER)).toBeNull()
  })

  it('isResumableQcFailure rejects empty input', () => {
    expect(isResumableQcFailure('')).toBe(false)
  })
})
