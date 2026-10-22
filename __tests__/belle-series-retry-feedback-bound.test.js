/**
 * BELLE-RETRY-FEEDBACK-BOUND: bounded repair-and-resume for the series
 * package Belle-retry path (run-next route.ts).
 *
 * Regression for Creek job f02896f1 (Ep1, 2026-10-22): the regenerated copy
 * failed validation (companion-presence) and the code THREW immediately WITHOUT
 * consuming the retry bound and WITHOUT feeding the validation issues back into
 * the regenerator — one wasted LLM call, operator loop required.
 *
 * Fix under test: regen+validate runs in a loop bounded by the remaining
 * per-episode attempts (MAX_SERIES_BELLE_RETRIES - currentRetry). Each failed
 * round's validation issues feed back into the next regen via the existing
 * `issues` channel of regenerateSeriesBelleFromFeedback (no signature change).
 * Each round consumes one unit of bound (retryCount = currentRetry + attempts).
 * The marc_required throw (kind series_belle_retry_validation_failed) fires
 * ONLY when the bound is exhausted with no passing copy.
 *
 * This file mirrors the production control flow 1:1 with injected fakes
 * (established norm: belle-series-422.test.js, belle-validation.test.js).
 *
 * Acceptance criteria tested:
 *   (a) invalid first retry + valid second retry succeeds within bound
 *   (b) persistently-invalid retry exhausts the bound (exactly MAX attempts,
 *       no infinite loop) and fails marc_required
 *   (c) untouched episodes' doneByEp/audio untouched (asset preservation)
 *   (d) resume target remains series_generate_belle_assets on the same job
 *
 * Run: npx jest __tests__/belle-series-retry-feedback-bound.test.js --no-coverage
 */

'use strict'

// ─── Mirrors from production (route.ts) ────────────────────────────────────

const MAX_SERIES_BELLE_RETRIES = 3
const NEXT_STEP_AFTER_SERIES_VOICES = 'series_generate_belle_assets'

// Faithful mirror of the fixed retry block + success-path assembly.
// Deps injected so tests control regen/validate/delete outcomes.
async function runSeriesBelleRetry(deps, ctx) {
  const {
    regenerateSeriesBelleFromFeedback,
    validateIntroOutroPositionRules,
    deleteBelleAudioFiles,
    replaceBelleSection,
    extractBelleSection,
  } = deps
  const { belleRetryTarget, targetStory, nextEpisode, model, currentRetry, resultState } = ctx

  const remainingBelleAttempts = MAX_SERIES_BELLE_RETRIES - currentRetry
  let repaired = null
  let lastAttemptRepaired = null
  let repairedScript = String(targetStory.script || '')
  let lastValidationIssues = [...belleRetryTarget.issues]
  let belleAttemptsUsed = 0
  const regenFeedbackSeen = []
  for (let belleAttempt = 0; belleAttempt < remainingBelleAttempts; belleAttempt++) {
    const attemptTarget = { ...belleRetryTarget, issues: lastValidationIssues }
    regenFeedbackSeen.push([...attemptTarget.issues])
    const attemptRepaired = await regenerateSeriesBelleFromFeedback(targetStory, attemptTarget, nextEpisode, model)
    let attemptScript = String(targetStory.script || '')
    if (belleRetryTarget.repairIntro) attemptScript = replaceBelleSection(attemptScript, 'intro', attemptRepaired.introText)
    if (belleRetryTarget.repairOutro) attemptScript = replaceBelleSection(attemptScript, 'outro', attemptRepaired.outroText)
    const attemptValidation = await validateIntroOutroPositionRules(
      { ...targetStory, script: attemptScript },
      extractBelleSection(attemptScript, 'intro'),
      extractBelleSection(attemptScript, 'outro')
    )
    belleAttemptsUsed += 1
    lastAttemptRepaired = attemptRepaired
    repairedScript = attemptScript
    if (attemptValidation.passed) {
      repaired = attemptRepaired
      break
    }
    lastValidationIssues = [...attemptValidation.issues]
  }
  if (!repaired) {
    const retryValidationError = new Error(`Belle retry produced invalid copy: ${lastValidationIssues.join('; ')}`)
    retryValidationError.structuredErrorDetail = {
      kind: 'series_belle_retry_validation_failed',
      storyId: belleRetryTarget.storyId,
      episodeNumber: belleRetryTarget.episodeNumber,
      issues: lastValidationIssues,
      repairedIntroText: belleRetryTarget.repairIntro ? (lastAttemptRepaired && lastAttemptRepaired.introText) || null : null,
      repairedOutroText: belleRetryTarget.repairOutro ? (lastAttemptRepaired && lastAttemptRepaired.outroText) || null : null,
    }
    // failJob() maps any such throw to marc_required: true.
    retryValidationError.marc_required = true
    throw retryValidationError
  }

  const deletedBelleFiles = await deleteBelleAudioFiles(
    belleRetryTarget.storyId,
    belleRetryTarget.repairIntro,
    belleRetryTarget.repairOutro
  )

  const storyUpdates = {
    script: repairedScript,
    audio_url: null,
    story_audio_url: null,
    outro_with_music_url: null,
    ...(belleRetryTarget.repairIntro ? {
      announcement_text: repaired.introText,
      announcement_url: null,
    } : {}),
    ...(belleRetryTarget.repairOutro ? {
      outro_text: repaired.outroText,
      outro_audio_url: null,
    } : {}),
  }

  const retryCount = currentRetry + belleAttemptsUsed
  const epKey = String(belleRetryTarget.episodeNumber || belleRetryTarget.storyId)
  const nextBelleDoneByEp = { ...(resultState.seriesBelleGeneration?.doneByEp || {}), [epKey]: false }
  const nextRenderDoneByEp = { ...(resultState.seriesRenderFinalMix?.doneByEp || {}), [epKey]: false }
  const nextPackageDoneByEp = { ...(resultState.seriesCompleteStoryPackage?.doneByEp || {}), [epKey]: false }

  // Same-job requeue assembly (mirrors production update payload).
  const requeue = {
    jobId: 'same-job-id',
    status: 'queued',
    current_step: NEXT_STEP_AFTER_SERIES_VOICES,
    retryCount,
    maxRetries: MAX_SERIES_BELLE_RETRIES,
  }

  return {
    repaired, repairedScript, storyUpdates, deletedBelleFiles,
    retryCount, belleAttemptsUsed, regenFeedbackSeen,
    nextBelleDoneByEp, nextRenderDoneByEp, nextPackageDoneByEp,
    requeue,
  }
}

// ─── Fakes ─────────────────────────────────────────────────────────────────

function makeDeps({ regenScript, validateScript, deletedFiles }) {
  const calls = { regen: 0, validate: 0, deleteFiles: [] }
  return {
    calls,
    regenerateSeriesBelleFromFeedback: async (_story, target) => {
      calls.regen += 1
      return regenScript(calls.regen, target)
    },
    validateIntroOutroPositionRules: async () => {
      calls.validate += 1
      return validateScript(calls.validate)
    },
    deleteBelleAudioFiles: async (storyId, repairIntro, repairOutro) => {
      calls.deleteFiles.push({ storyId, repairIntro, repairOutro })
      return deletedFiles
    },
    replaceBelleSection: (script, _kind, text) => `${script}||REPAIRED:${text}`,
    extractBelleSection: (script, kind) => `${kind}-of(${script.slice(0, 12)})`,
  }
}

const BASE_TARGET = {
  storyId: 'story-ep1',
  episodeNumber: 1,
  title: 'Ep One',
  issues: ['EP1 series intro must include a concrete narrative hook'],
  repairIntro: true,
  repairOutro: false,
}

const BASE_STORY = { id: 'story-ep1', script: 'ORIGINAL SCRIPT BODY' }

const BASE_STATE = {
  seriesBelleGeneration: { doneByEp: { 1: true, 2: true, 3: true }, allDone: true },
  seriesRenderFinalMix: { doneByEp: { 1: true, 2: true, 3: true }, allDone: true },
  seriesCompleteStoryPackage: { doneByEp: { 1: true, 2: true, 3: true }, allDone: true },
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('BELLE-RETRY-FEEDBACK-BOUND: bounded repair-and-resume', () => {
  test('(a) invalid first retry + valid second retry succeeds within bound', async () => {
    const deps = makeDeps({
      regenScript: (n) => (n === 1
        ? { introText: 'weak intro, no hook', outroText: '' }
        : { introText: '[LISTENER_NAME], Creek, Episode 1: The Fall. The ledger names a killer.', outroText: '' }),
      validateScript: (n) => (n === 1
        ? { passed: false, issues: ['series intro must include a concrete narrative hook'] }
        : { passed: true, issues: [] }),
      deletedFiles: ['asc3/story-ep1/announcement.mp3'],
    })
    const out = await runSeriesBelleRetry(deps, {
      belleRetryTarget: BASE_TARGET,
      targetStory: BASE_STORY,
      nextEpisode: null,
      model: 'test-model',
      currentRetry: 0,
      resultState: BASE_STATE,
    })

    // Two regen rounds, both validations run; second round succeeds.
    expect(deps.calls.regen).toBe(2)
    expect(deps.calls.validate).toBe(2)
    expect(out.belleAttemptsUsed).toBe(2)
    // Bound consumed per round: 0 + 2.
    expect(out.retryCount).toBe(2)
    expect(out.retryCount).toBeLessThanOrEqual(MAX_SERIES_BELLE_RETRIES)
    // Failed round's issues fed back into the second regen call.
    expect(out.regenFeedbackSeen[0]).toEqual(BASE_TARGET.issues)
    expect(out.regenFeedbackSeen[1]).toEqual(['series intro must include a concrete narrative hook'])
    // Repaired copy carried through.
    expect(out.repaired.introText).toContain('ledger')
    expect(out.storyUpdates.announcement_text).toContain('ledger')
  })

  test('(b) persistently-invalid retry exhausts bound: exactly MAX attempts, marc_required', async () => {
    const deps = makeDeps({
      regenScript: () => ({ introText: 'still weak', outroText: '' }),
      validateScript: () => ({ passed: false, issues: ['companion-presence: intro missing required hook'] }),
      deletedFiles: [],
    })
    let thrown = null
    try {
      await runSeriesBelleRetry(deps, {
        belleRetryTarget: BASE_TARGET,
        targetStory: BASE_STORY,
        nextEpisode: null,
        model: 'test-model',
        currentRetry: 0,
        resultState: BASE_STATE,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).not.toBeNull()
    // Exactly MAX attempts — bounded, no infinite loop.
    expect(deps.calls.regen).toBe(MAX_SERIES_BELLE_RETRIES)
    expect(deps.calls.validate).toBe(MAX_SERIES_BELLE_RETRIES)
    // marc_required failure with the canonical kind.
    expect(thrown.marc_required).toBe(true)
    expect(thrown.structuredErrorDetail.kind).toBe('series_belle_retry_validation_failed')
    expect(thrown.message).toMatch(/Belle retry produced invalid copy/)
    // No destructive side effects on total failure: audio never deleted.
    expect(deps.calls.deleteFiles).toEqual([])

    // Partially-consumed bound: currentRetry=2 leaves exactly 1 attempt.
    const deps2 = makeDeps({
      regenScript: () => ({ introText: 'still weak', outroText: '' }),
      validateScript: () => ({ passed: false, issues: ['companion-presence: intro missing required hook'] }),
      deletedFiles: [],
    })
    let thrown2 = null
    try {
      await runSeriesBelleRetry(deps2, {
        belleRetryTarget: BASE_TARGET,
        targetStory: BASE_STORY,
        nextEpisode: null,
        model: 'test-model',
        currentRetry: 2,
        resultState: BASE_STATE,
      })
    } catch (err) {
      thrown2 = err
    }
    expect(thrown2).not.toBeNull()
    expect(deps2.calls.regen).toBe(1)
    expect(thrown2.marc_required).toBe(true)
  })

  test('(c) untouched episodes doneByEp/audio untouched (asset preservation)', async () => {
    const deps = makeDeps({
      regenScript: () => ({ introText: 'good intro with concrete danger hook', outroText: '' }),
      validateScript: () => ({ passed: true, issues: [] }),
      deletedFiles: ['asc3/story-ep1/announcement.mp3'],
    })
    const out = await runSeriesBelleRetry(deps, {
      belleRetryTarget: BASE_TARGET,
      targetStory: BASE_STORY,
      nextEpisode: null,
      model: 'test-model',
      currentRetry: 0,
      resultState: BASE_STATE,
    })

    // Only the repaired episode is reset; siblings keep done=true.
    for (const next of [out.nextBelleDoneByEp, out.nextRenderDoneByEp, out.nextPackageDoneByEp]) {
      expect(next['1']).toBe(false)
      expect(next['2']).toBe(true)
      expect(next['3']).toBe(true)
    }
    // Audio deletion scoped to the repaired sections of the target story only.
    expect(deps.calls.deleteFiles).toEqual([{ storyId: 'story-ep1', repairIntro: true, repairOutro: false }])
    expect(out.deletedBelleFiles).toEqual(['asc3/story-ep1/announcement.mp3'])
    // URL nulling touches only the affected columns.
    expect(out.storyUpdates.audio_url).toBeNull()
    expect(out.storyUpdates.story_audio_url).toBeNull()
    expect(out.storyUpdates.outro_with_music_url).toBeNull()
    expect(out.storyUpdates.announcement_url).toBeNull()
    expect('outro_audio_url' in out.storyUpdates).toBe(false)
    expect('outro_text' in out.storyUpdates).toBe(false)
  })

  test('(d) resume target remains series_generate_belle_assets on the same job', async () => {
    const deps = makeDeps({
      regenScript: () => ({ introText: 'good intro with concrete danger hook', outroText: '' }),
      validateScript: () => ({ passed: true, issues: [] }),
      deletedFiles: [],
    })
    const out = await runSeriesBelleRetry(deps, {
      belleRetryTarget: BASE_TARGET,
      targetStory: BASE_STORY,
      nextEpisode: null,
      model: 'test-model',
      currentRetry: 0,
      resultState: BASE_STATE,
    })
    expect(out.requeue.jobId).toBe('same-job-id')
    expect(out.requeue.status).toBe('queued')
    expect(out.requeue.current_step).toBe('series_generate_belle_assets')
    expect(out.requeue.current_step).toBe(NEXT_STEP_AFTER_SERIES_VOICES)
  })
})
