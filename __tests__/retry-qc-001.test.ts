/**
 * RETRY-QC-001 — a QC-rejected voices job retries itself ONLY when the rule
 * that rejected it has since been fixed and deployed.
 *
 * Marc's rule (2026-11-16 15:40 EST): "Only allow it when the QC rule that
 * failed has since been fixed and deployed."
 *
 * Trigger: Mercy Island job 2f68f4cb sat failed ~16h because
 * `Segment transcript QC failed ... expected "Nell.", detected "now."`
 * matched neither resume class, and the fix (QC-ONE-WORD-NAME-001, #667)
 * was merged but not yet deployed.
 */
import {
  qcResumeDecision,
  isResumableQcFailure,
  qcErrorTextOf,
  identifyQcRule,
  parseQcMismatch,
  fixIsDeployed,
  castNamesOf,
  shaOf,
  MAX_QC_RESUMES,
  QC_RESUME_BACKOFF_MS,
} from '@/lib/qcVerdictResume'

const T0 = Date.parse('2026-11-16T04:40:57.998Z')

/** Mercy Island cast — "Nell" is the speaker whose line was rejected. */
const CAST = ['Nell', 'Ray', 'Ada']

/** Simulates git ancestry for the two real builds. */
/**
 * git says: is <fix> an ancestor of <dep>?
 * Models only our two real builds. The DEPLOYED sha decides the answer — the
 * fix sha is the same in both cases, so keying on it alone is a no-op.
 */
const FIX_FULL = '6cfbd7b033f64b9a81606eafa1357095b0d64a78'
/** git: "is <fix> an ancestor of <dep>?" — true for the build that shipped the fix. */
const ancestryWithFix = (fix: string, dep: string) => fix === FIX_FULL && dep === '2353ef695a3c'
/** git: the build from BEFORE the fix — the fix is NOT in it. */
const ancestryWithoutFix = (fix: string, dep: string) => {
  if (dep === '1fe7c2502dd2') return false
  return fix === FIX_FULL && dep === '2353ef695a3c'
}
const AFTER_BACKOFF = T0 + QC_RESUME_BACKOFF_MS[0] + 1000

/** The commit that fixes QC-ONE-WORD-NAME-001 (PR #667). */
const FIX_SHA = '6cfbd7b033f64b9a81606eafa1357095b0d64a78'
/** Production build that CONTAINS the fix. */
const DEPLOYED_WITH_FIX = '2353ef695a3c-mwjotfgw'
/** Production build from BEFORE the fix (what was live while Mercy failed). */
const DEPLOYED_WITHOUT_FIX = '1fe7c2502dd2-mwil5jw4'

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

describe('RETRY-QC-001 — the deployed-fix gate (Marc rule)', () => {
  it('resumes the real Mercy failure once the fix is deployed', () => {
    const d = qcResumeDecision(job(MERCY_ERROR), {
      deployedVersion: DEPLOYED_WITH_FIX,
      resolveAncestry: ancestryWithFix,
      castNames: CAST,
      nowMs: AFTER_BACKOFF,
    })
    expect(d).toEqual({
      action: 'resume',
      attempt: 1,
      step: 'series_generate_voices',
      ruleId: 'QC-ONE-WORD-NAME-001',
      deployed: DEPLOYED_WITH_FIX,
    })
  })

  it('REFUSES when the fix is merged but not deployed (the actual Mercy state)', () => {
    const d = qcResumeDecision(job(MERCY_ERROR), {
      deployedVersion: DEPLOYED_WITHOUT_FIX,
      resolveAncestry: ancestryWithoutFix,
      castNames: CAST,
      nowMs: AFTER_BACKOFF,
    })
    expect(d?.action).toBe('blocked')
    expect(JSON.stringify(d)).toContain('not in deployed build')
  })

  it('REFUSES when the deployed version cannot be determined (fail closed)', () => {
    const d = qcResumeDecision(job(MERCY_ERROR), { deployedVersion: null, resolveAncestry: ancestryWithFix, castNames: CAST, nowMs: AFTER_BACKOFF })
    expect(d?.action).toBe('blocked')
  })

  it('REFUSES a QC verdict with no known fix', () => {
    const unknown = { message: 'Segment transcript QC failed for segment_0003.mp3: expected "the long road home", detected "the long road" (similarity: 71.0%)' }
    const d = qcResumeDecision(job(unknown), { deployedVersion: DEPLOYED_WITH_FIX, resolveAncestry: ancestryWithFix, castNames: CAST, nowMs: AFTER_BACKOFF })
    expect(d?.action).toBe('blocked')
  })

  it('fixIsDeployed uses git ancestry, not string prefix', () => {
    // the two real shas share NO prefix; ancestry is what decides
    expect(shaOf(DEPLOYED_WITH_FIX)).toBe('2353ef695a3c')
    expect(FIX_SHA.startsWith(shaOf(DEPLOYED_WITH_FIX))).toBe(false)
    expect(fixIsDeployed(FIX_SHA, DEPLOYED_WITH_FIX, ancestryWithFix)).toBe(true)
    expect(fixIsDeployed(FIX_SHA, DEPLOYED_WITHOUT_FIX, ancestryWithoutFix)).toBe(false)
  })

  it('fixIsDeployed fails closed when git cannot answer', () => {
    expect(fixIsDeployed(FIX_SHA, DEPLOYED_WITH_FIX, () => null)).toBe(false)
    expect(fixIsDeployed(FIX_SHA, '', ancestryWithFix)).toBe(false)
  })
})

describe('RETRY-QC-001 — rule identification', () => {
  it('parses expected/detected from the QC message', () => {
    expect(parseQcMismatch(MERCY_ERROR.message)).toEqual({ expected: 'Nell.', detected: 'now.' })
  })

  it('identifies the one-word cast-name shape', () => {
    expect(identifyQcRule(MERCY_ERROR.message, CAST)?.id).toBe('QC-ONE-WORD-NAME-001')
  })

  it('does not identify a multi-word mismatch as that rule', () => {
    const multi = { message: 'Segment transcript QC failed for x.mp3: expected "and then she left", detected "and then she" (similarity: 60.0%)' }
    expect(identifyQcRule(multi.message, CAST)).toBeNull()
    expect(qcErrorTextOf(multi)).toContain('transcript QC failed')
  })

  it('finds the QC text nested under episodeResult (series wrapper)', () => {
    const wrapped = { episodeResult: { error: MERCY_ERROR.message } }
    expect(qcErrorTextOf(wrapped)).toContain('transcript QC failed')
  })
})

describe('RETRY-QC-001 — the rule must actually APPLY to this failure', () => {
  /**
   * Review round 2, blocking finding #1: identifyQcRule matched on word count
   * alone, so `expected "Yes." / detected "No."` was labelled the name rule and
   * resumed — even though the deployed fix (oneWordCastNameLine) requires the
   * expected word to BE a cast name and rejects that take. Resuming it burns
   * three ElevenLabs retakes on a failure the deployed rule still rejects.
   */
  const opts = { deployedVersion: DEPLOYED_WITH_FIX, resolveAncestry: ancestryWithFix, castNames: CAST, nowMs: AFTER_BACKOFF }
  const qc = (expected: string, detected: string) => ({
    message: `Segment transcript QC failed for segment_0015.mp3: expected "${expected}", detected "${detected}" (similarity: 0.0%)`,
  })

  it('REFUSES a one-word mismatch that is not a cast name (Yes./No.)', () => {
    const d = qcResumeDecision(job(qc('Yes.', 'No.')), opts)
    expect(d?.action).toBe('blocked')
  })

  it('REFUSES other non-cast single words (Go./no, Stop./top)', () => {
    expect(qcResumeDecision(job(qc('Go.', 'no')), opts)?.action).toBe('blocked')
    expect(qcResumeDecision(job(qc('Stop.', 'top')), opts)?.action).toBe('blocked')
  })

  it('REFUSES when cast names are unknown (cannot prove the rule applies)', () => {
    const d = qcResumeDecision(job(MERCY_ERROR), { ...opts, castNames: null })
    expect(d?.action).toBe('blocked')
    expect(JSON.stringify(d)).toContain('cast names unavailable')
  })

  it('still RESUMES the real name case once cast names are known', () => {
    expect(qcResumeDecision(job(MERCY_ERROR), opts)?.action).toBe('resume')
  })

  it('identifyQcRule requires the expected word to be a cast name', () => {
    expect(identifyQcRule(qc('Nell.', 'Now.').message, CAST)?.id).toBe('QC-ONE-WORD-NAME-001')
    expect(identifyQcRule(qc('Yes.', 'No.').message, CAST)).toBeNull()
    expect(identifyQcRule(qc('Nell.', 'Now.').message, null)).toBeNull()
    expect(identifyQcRule(qc('Nell.', 'Now.').message, [])).toBeNull()
  })

  it('castNamesOf reads cast names from the error envelope', () => {
    expect(castNamesOf({ castNames: ['Nell', 'Ray'] })).toEqual(['Nell', 'Ray'])
    expect(castNamesOf({ cast: [{ name: 'Nell' }] })).toEqual(['Nell'])
    expect(castNamesOf({ message: 'x' })).toBeNull()
  })
})

describe('RETRY-QC-001 — timing and budget', () => {
  const opts = { deployedVersion: DEPLOYED_WITH_FIX, resolveAncestry: ancestryWithFix, castNames: CAST }

  it('waits inside the back-off window', () => {
    expect(qcResumeDecision(job(MERCY_ERROR), { ...opts, nowMs: T0 + 1000 })).toEqual({
      action: 'wait',
      attempt: 1,
      retryAtMs: T0 + QC_RESUME_BACKOFF_MS[0],
    })
  })

  it('back-off grows each attempt (5, 15, 30 min)', () => {
    expect(QC_RESUME_BACKOFF_MS).toEqual([5 * 60000, 15 * 60000, 30 * 60000])
  })

  it('gives up after MAX_QC_RESUMES', () => {
    const d = qcResumeDecision(job(MERCY_ERROR, { state_json: { qcResumeCount: MAX_QC_RESUMES } }), {
      ...opts,
      nowMs: AFTER_BACKOFF,
    })
    expect(d).toEqual({ action: 'exhausted', attempt: MAX_QC_RESUMES })
  })

  it('counts attempts across resumes', () => {
    const second = job(MERCY_ERROR, { state_json: { qcResumeCount: 1 } })
    expect(qcResumeDecision(second, { ...opts, nowMs: AFTER_BACKOFF })).toEqual({
      action: 'wait',
      attempt: 2,
      retryAtMs: T0 + QC_RESUME_BACKOFF_MS[1],
    })
    expect(
      qcResumeDecision(second, { ...opts, nowMs: T0 + QC_RESUME_BACKOFF_MS[1] + 1000 })?.action
    ).toBe('resume')
  })
})

describe('RETRY-QC-001 — must never be auto-resumed', () => {
  const opts = { deployedVersion: DEPLOYED_WITH_FIX, resolveAncestry: ancestryWithFix, castNames: CAST, nowMs: AFTER_BACKOFF }

  it('REPEATED_IDENTICAL_TRUNCATION (code says retrying will not help)', () => {
    const t = { message: 'Segment transcript QC failed for segment_0015.mp3 [REPEATED_IDENTICAL_TRUNCATION]: Whisper returned the same partial output "now." across all 3 retry candidates. Retrying will not help.' }
    expect(qcResumeDecision(job(t), opts)).toBeNull()
  })

  it('TRANSCRIPT_AMBIGUOUS', () => {
    const t = { message: 'TRANSCRIPT_AMBIGUOUS: Segment segment_0007.mp3 - Whisper returned "?".' }
    expect(qcResumeDecision(job(t), opts)).toBeNull()
  })

  it('account-wide causes (credits / keys)', () => {
    expect(qcResumeDecision(job({ ...MERCY_ERROR, transient_cause: 'elevenlabs_auth_or_quota' }), opts)).toBeNull()
  })

  it('already-exhausted jobs', () => {
    expect(qcResumeDecision(job({ ...MERCY_ERROR, exhausted: true }), opts)).toBeNull()
  })

  it('network errors (RETRY-NET-001 territory)', () => {
    expect(qcResumeDecision(job({ message: 'TypeError: fetch failed' }), opts)).toBeNull()
  })

  it('writer/preflight defects', () => {
    expect(qcResumeDecision(job({ message: 'WRITER-SELF-CHECK-001: episode 5 still fails pre-save checks' }), opts)).toBeNull()
  })

  it('jobs that are not failed', () => {
    expect(qcResumeDecision(job(MERCY_ERROR, { status: 'running' }), opts)).toBeNull()
    expect(qcResumeDecision(job(MERCY_ERROR, { status: 'queued' }), opts)).toBeNull()
  })

  it('TEST_ jobs', () => {
    expect(qcResumeDecision(job(MERCY_ERROR, { job_type: 'TEST_series_production' }), opts)).toBeNull()
  })

  it('empty input', () => {
    expect(isResumableQcFailure('')).toBe(false)
  })
})
