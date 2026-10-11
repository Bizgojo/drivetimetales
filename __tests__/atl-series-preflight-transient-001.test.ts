/**
 * ATL-SERIES-PREFLIGHT-TRANSIENT-001
 *
 * Regression source: "The Extraction" series (072ec869-b438-4408-84b7-b651c0d0f184)
 * failed series_voice_preflight twice (2026-10-11 20:30 and 23:30 UTC) and
 * several more times earlier (2026-10-04, 2026-10-05) with the generate-voices
 * self-fetch throwing a plain network error ("fetch failed") before any
 * provider was even reached. All 3 episodes ended up parked in repair_queue
 * via "Dispatch failure circuit open: 3 failed production jobs ... within 2h" —
 * a backend/network blip, not a story defect.
 *
 * Root cause (two compounding bugs, both fixed here):
 *
 * 1. app/api/admin/production-jobs/run-next/route.ts's series_voice_preflight
 *    failure branch (step === NEXT_STEP_AFTER_SERIES_VALIDATION) built
 *    error_json directly and never called classifyTransientFailure(), unlike
 *    its sibling step series_generate_voices (NEXT_STEP_AFTER_SERIES_PREFLIGHT)
 *    a few hundred lines below it, which already does. So even a correctly
 *    classifiable network error could never be tagged transient on this step.
 *
 * 2. runGenerateVoicesPreflightRequest()'s catch block (same file) captured
 *    only `error.message` ("fetch failed") instead of the full error string
 *    ("TypeError: fetch failed"). classifyTransientFailure's network rule is
 *    deliberately anchored to the literal "TypeError: fetch failed" (and a
 *    short list of errno codes) specifically so story dialogue containing the
 *    plain English words "fetch failed" is never misclassified (see
 *    transient-failure-001.test.ts, "plain-English fetch failed ... stays
 *    PERMANENT"). Dropping the "TypeError: " prefix meant the real runtime
 *    error could never match that rule — "network" transient_cause had in
 *    fact never once been recorded in production (verified against
 *    production_jobs before this fix).
 *
 * This file pins the fix: the exact string the preflight self-fetch now
 * produces classifies as transient, while the old (buggy) bare-message form
 * stays unclassified — documenting why the prefix matters.
 */

import { classifyTransientFailure, isTransientJobRow, stripQuotedScriptText, transientErrorFields } from '@/lib/transientFailure'

describe('ATL-SERIES-PREFLIGHT-TRANSIENT-001', () => {
  test('fix: full error string (as String(error) now produces) classifies as network-transient', () => {
    const blockingReason = 'generate-voices preflight request failed: TypeError: fetch failed'
    expect(classifyTransientFailure(stripQuotedScriptText(blockingReason))).toBe('network')
  })

  test('bug (pre-fix): bare error.message alone did NOT classify — this is why "The Extraction" got parked', () => {
    const buggyBlockingReason = 'generate-voices preflight request failed: fetch failed'
    expect(classifyTransientFailure(stripQuotedScriptText(buggyBlockingReason))).toBeNull()
  })

  test('series_voice_preflight error_json, once classified, is recognized as transient and not Marc-required', () => {
    const cause = classifyTransientFailure('generate-voices preflight request failed: TypeError: fetch failed')
    expect(cause).toBe('network')
    const fields = cause ? transientErrorFields(cause) : {}
    const errorJson = {
      step: 'series_voice_preflight',
      seriesId: '072ec869-b438-4408-84b7-b651c0d0f184',
      preflightReport: { success: false, error: 'TypeError: fetch failed' },
      ...fields,
    }
    expect(isTransientJobRow({ status: 'failed', error_json: errorJson })).toBe(true)
    expect(errorJson.marc_required).toBe(false)
  })

  test('a real narrator/script defect on the same step still stays PERMANENT (unchanged behavior)', () => {
    const cause = classifyTransientFailure('NARRATOR not found for author — narrator mismatch')
    expect(cause).toBeNull()
    const errorJson = {
      step: 'series_voice_preflight',
      narratorIssues: ['NARRATOR not found for author — narrator mismatch'],
      ...(cause ? transientErrorFields(cause) : {}),
    }
    expect(isTransientJobRow({ status: 'failed', error_json: errorJson })).toBe(false)
  })
})
