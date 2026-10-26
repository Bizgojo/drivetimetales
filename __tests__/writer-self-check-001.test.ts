import { readFileSync } from 'fs'
import { join } from 'path'
import {
  briefMinutesOf,
  briefRuntimeImpossible,
  buildWriterRewriteFeedback,
  checkScriptReadiness,
  checkSeriesCastContinuity,
  voicedCharacterSpeakers,
  writeWithSelfCheck,
  WRITER_SELF_CHECK_MAX_REWRITES,
} from '@/lib/scriptReadiness'

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

/** A series-episode script in the real layout (planning headers, guide, then
 * [START AUDIO DRAMA SCRIPT] — all 11 prod scripts with PREMISE/ENDING labels
 * carry that marker). Spoken length is controlled by `lines`. */
function episodeScript(lines: number, extra = '') {
  const body: string[] = [
    'TITLE: The Ultimatum',
    'DESCRIPTION: A town votes on whether to stay alive.',
    'NARRATOR: Ray Dolan',
    'PREMISE: A dying town must choose.',
    'ENDING: Cliffhanger at the vote.',
    '',
    'CHARACTER GUIDE',
    '---',
    'MARTHA LOCKE — 50s, female.',
    'GAVIN CROWE — 40s, male.',
    '---',
    '',
    '[START AUDIO DRAMA SCRIPT]',
    '',
    'BELLE B: [LISTENER_NAME], Ghost Town Vote — Episode 1: The Ultimatum.',
    '',
    '[SFX: wind through a broken shutter]',
    '',
  ]
  for (let i = 0; i < lines; i++) {
    body.push(`NARRATOR: ${filler(40)}`, '', `MARTHA LOCKE: ${filler(20)}`, '', `GAVIN CROWE: ${filler(10)}`, '')
  }
  if (extra) body.push(extra)
  return body.join('\n')
}

const check = (brief: number) => (script: string) =>
  checkScriptReadiness({
    script,
    storyType: 'series_episode',
    seriesId: 's1',
    seriesTotalEpisodes: 3,
    episodeNumber: 1,
    narratorVoiceNames: ['Ray Dolan'],
    briefMinutes: brief,
  })

describe('WRITER-SELF-CHECK-001: bounded write → check → rewrite', () => {
  test('passes on the first draft → exactly one writing call, no feedback', async () => {
    const calls: string[] = []
    const res = await writeWithSelfCheck({
      briefMinutes: 14,
      check: check(14),
      generate: async (feedback) => {
        calls.push(feedback)
        return { script: episodeScript(32), description: 'd', inputTokens: 10, outputTokens: 20 }
      },
    })
    expect(res.ok).toBe(true)
    expect(calls).toEqual([''])
    expect(res.attempts).toHaveLength(1)
    expect(res.usage).toEqual({ input: 10, output: 20 })
  })

  test('short first draft (CEO shape) → rewrite with length feedback → passes on draft 2', async () => {
    const calls: string[] = []
    const drafts = [episodeScript(12), episodeScript(32)]
    const res = await writeWithSelfCheck({
      briefMinutes: 14,
      check: check(14),
      generate: async (feedback) => {
        calls.push(feedback)
        return { script: drafts[calls.length - 1], description: 'd' }
      },
    })
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatch(/REWRITE REQUIRED/)
    expect(calls[1]).toMatch(/LENGTH: .* must have about 2240 spoken words/)
    expect(res.script).toBe(drafts[1])
  })

  test('never fixed → stops after 1 + max rewrites and reports failure (fail closed)', async () => {
    let n = 0
    const res = await writeWithSelfCheck({
      briefMinutes: 20,
      check: check(20),
      generate: async () => {
        n++
        return { script: episodeScript(12), description: 'd' }
      },
    })
    expect(res.ok).toBe(false)
    expect(n).toBe(1 + WRITER_SELF_CHECK_MAX_REWRITES)
    expect(res.attempts.at(-1)!.blockers.join(' ')).toMatch(/RUNTIME/)
  })

  test('feedback lists every non-length blocker verbatim', () => {
    const report = check(14)(episodeScript(32, 'NARRATOR: At 8:52 the vote began.'))
    const fb = buildWriterRewriteFeedback(report, 14)
    expect(fb).toMatch(/NUMERAL-PRETTS/)
    expect(fb).toMatch(/Keep characters, names, places, and continuity exactly/)
  })
})

describe('false-positive guards found against real published scripts', () => {
  test('header lines (PREMISE:, ENDING:) are not treated as characters', () => {
    const speakers = voicedCharacterSpeakers(episodeScript(2))
    expect(speakers.has('PREMISE')).toBe(false)
    expect(speakers.has('ENDING')).toBe(false)
    expect(Array.from(speakers).sort()).toEqual(['GAVIN CROWE', 'MARTHA LOCKE'])
  })

  test('a script with NO character guide is not blocked for it ("The Woman Who Took My Place" shape)', () => {
    const noGuide = episodeScript(32).replace(/CHARACTER GUIDE\n---\n[\s\S]*?\n---\n/, '')
    expect(noGuide).not.toMatch(/CHARACTER GUIDE/)
    expect([...check(14)(noGuide).blockers, ...check(14)(noGuide).warnings].map((b) => b.gate)).not.toContain('CHARACTER-GUIDE')
  })

  test('mixed-case guide entries ("Jonah Bell", Harbor Light) still count', () => {
    const script = episodeScript(32).replace('GAVIN CROWE — 40s, male.', 'Gavin Crowe — 40s, male.')
    expect(check(14)(script).warnings.map((b) => b.gate)).not.toContain('CHARACTER-GUIDE')
  })
})

describe('brief helpers', () => {
  test('briefMinutesOf prefers duration_mins, falls back to brief_json.runtime', () => {
    expect(briefMinutesOf({ duration_mins: 14, brief_json: { runtime: '20 min' } })).toBe(14)
    expect(briefMinutesOf({ duration_mins: null, brief_json: { runtime: '18 min' } })).toBe(18)
    expect(briefMinutesOf({})).toBeNull()
  })

  test('impossible briefs fail fast before any writing call', () => {
    expect(briefRuntimeImpossible(11)).toMatch(/Re-brief to >= 12 min/)
    expect(briefRuntimeImpossible(12)).toBeNull()
    expect(briefRuntimeImpossible(20)).toBeNull()
    expect(briefRuntimeImpossible(null)).toBeNull()
  })
})

describe('wiring in run-next generateOneSeriesEpisodeScript', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fnStart = src.indexOf('async function generateOneSeriesEpisodeScript(')
  const fnEnd = src.indexOf('\nfunction validateSeriesMetadata(', fnStart)
  const fn = src.slice(fnStart, fnEnd)

  test('impossible-brief check runs before the self-check writer', () => {
    expect(fn.indexOf('briefRuntimeImpossible(')).toBeGreaterThan(-1)
    expect(fn.indexOf('briefRuntimeImpossible(')).toBeLessThan(fn.indexOf('writeWithSelfCheck('))
  })

  test('the only writing call is inside writeWithSelfCheck, and the self-check gates the save', () => {
    expect((fn.match(/anthropic\.messages\.create\(/g) || []).length).toBe(1)
    const writer = fn.indexOf('writeWithSelfCheck(')
    expect(fn.indexOf('anthropic.messages.create(')).toBeGreaterThan(writer)
    expect(fn.indexOf('if (!selfCheck.ok)')).toBeLessThan(fn.indexOf(".from('stories')\n    .update({"))
  })

  test('series cast continuity is checked once all scripts exist, before returning', () => {
    const cont = fn.indexOf('assertSeriesCastContinuity(String(seriesId), refreshedEpisodes)')
    expect(cont).toBeGreaterThan(fn.indexOf('const allScriptsGenerated'))
    expect(cont).toBeLessThan(fn.lastIndexOf('return {'))
  })

  test('self-check attempts are recorded on the saved episode', () => {
    expect(fn).toMatch(/writer_self_check: \{ passed: true, attempts: writerAttempts \}/)
  })
})

test('continuity check still separates Ghost Town Vote from The Understudy using parser speakers', () => {
  const s = (names: string[]) => `NARRATOR: Ray Dolan\n\nBELLE B: hi\n\n${names.map((n) => `${n}: words here now.`).join('\n\n')}`
  expect(checkSeriesCastContinuity([
    { episodeNumber: 1, script: s(['GAVIN CROWE']) },
    { episodeNumber: 2, script: s(['SUSANNA']) },
  ])).toHaveLength(1)
  expect(checkSeriesCastContinuity([
    { episodeNumber: 1, script: s(['PRU ADLER']) },
    { episodeNumber: 2, script: s(['PRU']) },
  ])).toEqual([])
})

// ── Fixes from the independent review (2026-10-26) ──────────────────────────
import { RUNTIME_BRIEF_PRESPEND_TOLERANCE, dispatchReadinessReasons } from '@/lib/scriptReadiness'
import { runNextTimeoutMs } from '@/lib/pipeline-runner/runner'

describe('review B1: RUNTIME-BRIEF is standalone-only (RUNTIME-GATE-001 never runs on series)', () => {
  const base = (storyType: string, brief: number, lines: number) =>
    checkScriptReadiness({ script: episodeScript(lines), storyType, seriesId: storyType === 'series_episode' ? 's' : null, seriesTotalEpisodes: storyType === 'series_episode' ? 3 : null, episodeNumber: storyType === 'series_episode' ? 1 : null, briefMinutes: brief })
  test('series episode ~14 min vs 20-min brief: no RUNTIME-BRIEF', () => {
    expect(base('series_episode', 20, 32).blockers.map((b) => b.gate)).not.toContain('RUNTIME-BRIEF')
  })
  test('standalone ~14 min vs 20-min brief: blocked (would fail RUNTIME-GATE-001 after spend)', () => {
    expect(base('single', 20, 32).blockers.map((b) => b.gate)).toContain('RUNTIME-BRIEF')
  })
  test('standalone within the pre-spend tolerance is not blocked', () => {
    const r = base('single', 15, 32)
    const dev = Math.abs(r.metrics.estimatedMins - 15) / 15
    expect(dev).toBeLessThan(RUNTIME_BRIEF_PRESPEND_TOLERANCE)
    expect(r.blockers.map((b) => b.gate)).not.toContain('RUNTIME-BRIEF')
  })
})

describe('review B2: writer step cannot be aborted mid-write and re-run', () => {
  test('generate_episode_script gets an extended fetch budget (others keep 90s)', () => {
    expect(runNextTimeoutMs('generate_episode_script')).toBe(720_000)
    expect(runNextTimeoutMs('voice_preflight')).toBe(90_000)
  })
  test('writer stops starting new drafts once its time budget is spent', async () => {
    let t = 0
    let calls = 0
    const res = await writeWithSelfCheck({
      briefMinutes: 20,
      check: check(20),
      budgetMs: 400,
      now: () => t,
      generate: async () => { calls++; t += 300; return { script: episodeScript(12), description: 'd' } },
    })
    expect(calls).toBe(2) // draft 1 at t=0, draft 2 at t=300 (<400), no draft 3 at t=600
    expect(res.ok).toBe(false)
  })
})

describe('review B3 + L1: dispatcher never parks stories because of its own lookup failure, and only judges queued episodes', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/cron/dispatch-queue/route.ts'), 'utf8')
  test('narrator lookup error/empty → readiness skipped, nothing flagged', () => {
    expect(src).toMatch(/if \(error \|\| !data \|\| data\.length === 0\) return null/)
    expect(src).toMatch(/if \(!voices\) return \{ error: /)
  })
  test('series flag is scoped to queued episodes; per-script checks only on queued ids', () => {
    const seriesBlock = src.slice(src.indexOf('// DISPATCH-READINESS-GATE-001 (series)'), src.indexOf('const episodeCount = expectedEpisodeCount(episodes)'))
    expect(seriesBlock).toMatch(/\.eq\('workflow_state', 'stories_in_queue'\)/)
    expect(seriesBlock).not.toMatch(/\.neq\('workflow_state', 'cold_storage'\)/)
    expect(seriesBlock).toMatch(/readinessReasonsFor\(queuedIds, seriesId\)/)
  })
  test('continuity uses the whole series while per-script checks use only the given episodes', () => {
    const s = (names: string[]) => `NARRATOR: Ray Dolan\n\nBELLE B: hi\n\n${names.map((n) => `${n}: words here now.`).join('\n\n')}`
    const reasons = dispatchReadinessReasons(
      [{ id: 'q', episodeNumber: 2, script: episodeScript(32), storyType: 'series_episode', seriesId: 's', seriesTotalEpisodes: 2 }],
      [{ episodeNumber: 1, script: s(['ANNA']) }, { episodeNumber: 2, script: s(['BOB']) }],
    )
    expect(reasons.some((r) => r.startsWith('SERIES-CAST-CONTINUITY'))).toBe(true)
    expect(reasons.some((r) => r.startsWith('EP1 '))).toBe(false)
  })
})

describe('review L2–L7', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('async function generateOneSeriesEpisodeScript('), src.indexOf('\nfunction validateSeriesMetadata('))
  test('L2: continuity also guards the resume path, and flags episodes', () => {
    const resume = fn.slice(0, fn.indexOf('COVER-PIPELINE-DECOUPLE-001: backfill'))
    expect(resume).toMatch(/await assertSeriesCastContinuity\(String\(seriesId\), episodes\)/)
    const helper = src.slice(src.indexOf('async function assertSeriesCastContinuity('), src.indexOf('async function generateOneSeriesEpisodeScript('))
    expect(helper).toMatch(/markStoriesNeedAttention\(/)
  })
  test('L3: every writer refusal flags the episode before throwing', () => {
    // impossible brief, narrator, spend cap, thrown writer call, failed drafts
    expect((fn.match(/await markStoryNeedsAttention\(String\(targetEpisode\.id\), msg\)\s*\n\s*throw new Error\(msg\)/g) || []).length).toBe(5)
  })
  test('L4: spend is metered per draft inside generate, not once at the end', () => {
    const gen = fn.slice(fn.indexOf('generate: async (feedback) => {'), fn.indexOf('check: (draftScript) =>'))
    expect(gen).toMatch(/logAnthropicCall\(/)
    expect((fn.match(/logAnthropicCall\(/g) || []).length).toBe(1)
  })
  test('L5: narrator is resolved before any writing call', () => {
    expect(fn.indexOf('is not in narrator_voices (no writing call made)')).toBeLessThan(fn.indexOf('writeWithSelfCheck('))
  })
  test('L6: finale/total come from the episode row first', () => {
    expect(fn).toMatch(/targetEpisode\.series_total_episodes/)
    expect(fn).toMatch(/Boolean\(targetEpisode\.series_is_finale\)/)
  })
  test('L7: Belle-exempt variants are not blocked for missing Belle', () => {
    const noBelle = episodeScript(32).replace(/BELLE B:[^\n]*\n/, '').replace('TITLE: The Ultimatum', 'TITLE: The Ultimatum\nVARIANT: LANDING-STORY-001')
    expect(noBelle).not.toMatch(/^BELLE B:/m)
    expect(check(14)(noBelle).blockers.map((b) => b.gate)).not.toContain('BELLE')
    const plain = episodeScript(32).replace(/BELLE B:[^\n]*\n/, '')
    expect(check(14)(plain).blockers.map((b) => b.gate)).toContain('BELLE')
  })
})

// ── Review round 2 ──────────────────────────────────────────────────────────
import { writerClaimIsFresh, writerDraftTimeoutMs, WRITER_CLAIM_STALE_MS, WRITER_SELF_CHECK_BUDGET_MS, WRITER_DRAFT_TIMEOUT_MS, WRITER_STEP_HARD_LIMIT_MS } from '@/lib/scriptReadiness'

describe('review round 2', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')

  test('writer claim: fresh claim blocks, stale or missing claim allows', () => {
    const now = Date.parse('2026-10-26T16:00:00Z')
    expect(writerClaimIsFresh({ writerClaim: { at: '2026-10-26T15:55:00Z' } }, now)).toBe(true)
    expect(writerClaimIsFresh({ writerClaim: { at: new Date(now - WRITER_CLAIM_STALE_MS - 1).toISOString() } }, now)).toBe(false)
    expect(writerClaimIsFresh({}, now)).toBe(false)
    expect(writerClaimIsFresh(null, now)).toBe(false)
  })

  test('claim stale window outlives the longest possible writer step', () => {
    expect(WRITER_CLAIM_STALE_MS).toBeGreaterThan(WRITER_STEP_HARD_LIMIT_MS)
  })

  test('time limits: no draft can run past the hard limit, and the hard limit sits inside the runner abort', () => {
    expect(WRITER_SELF_CHECK_BUDGET_MS + WRITER_DRAFT_TIMEOUT_MS).toBeLessThanOrEqual(WRITER_STEP_HARD_LIMIT_MS)
    expect(WRITER_STEP_HARD_LIMIT_MS).toBeLessThan(runNextTimeoutMs('generate_episode_script'))
    expect(runNextTimeoutMs('generate_episode_script')).toBeLessThanOrEqual(740_000)
    expect(writerDraftTimeoutMs(0)).toBe(WRITER_DRAFT_TIMEOUT_MS)
    expect(writerDraftTimeoutMs(WRITER_SELF_CHECK_BUDGET_MS)).toBe(WRITER_STEP_HARD_LIMIT_MS - WRITER_SELF_CHECK_BUDGET_MS)
    expect(writerDraftTimeoutMs(WRITER_STEP_HARD_LIMIT_MS)).toBe(30_000)
  })

  test('every draft call has a timeout and no SDK retries', () => {
    const fn = src.slice(src.indexOf('async function generateOneSeriesEpisodeScript('), src.indexOf('\nfunction validateSeriesMetadata('))
    expect(fn).toMatch(/timeout: writerDraftTimeoutMs\(Date\.now\(\) - writerStepStartedAt\),\s*\n\s*maxRetries: 0,/)
  })

  test('writer step claims the job (compare-and-set on updated_at) before writing, and steps aside with 409', () => {
    const branch = src.slice(src.indexOf('if (step === NEXT_STEP_AFTER_SERIES_CREATE) {'), src.indexOf('const result = await generateOneSeriesEpisodeScript(lockedJob, model)'))
    expect(branch).toMatch(/writerClaimIsFresh\(claimState, Date\.now\(\)\)/)
    expect(branch).toMatch(/\.eq\('updated_at', lockedJob\.updated_at\)/)
    expect((branch.match(/status: 409/g) || []).length).toBe(2)
  })

  test('episode save uses an optimistic script_version check (no empty-string filter)', () => {
    const fn = src.slice(src.indexOf('async function generateOneSeriesEpisodeScript('), src.indexOf('\nfunction validateSeriesMetadata('))
    expect(fn).not.toMatch(/script\.eq\./)
    expect(fn).toMatch(/episodeSave\.is\('script_version', null\)/)
    expect(fn).toMatch(/episodeSave\.eq\('script_version', targetEpisode\.script_version\)/)
  })

  test('series loader fetches the brief of record (duration_mins) the writer uses', () => {
    const loader = src.slice(src.indexOf('async function loadSeriesEpisodes('), src.indexOf('async function loadSeriesEpisodes(') + 900)
    expect(loader).toMatch(/duration_mins/)
  })

  test('RUNTIME-BRIEF needs an explicit standalone type', () => {
    const r = checkScriptReadiness({ script: episodeScript(32), briefMinutes: 20 })
    expect(r.blockers.map((b) => b.gate)).not.toContain('RUNTIME-BRIEF')
  })
})

// ── Review round 3 ──────────────────────────────────────────────────────────
import { countWriterFailures, WRITER_MAX_FAILED_INVOCATIONS } from '@/lib/scriptReadiness'

describe('review round 3: no lock theft, and a hard per-episode spend cap', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('async function generateOneSeriesEpisodeScript('), src.indexOf('\nfunction validateSeriesMetadata('))

  test('countWriterFailures counts only failures after the last human reset', () => {
    const sj = { writer_self_check_failures: [{ at: '2026-10-26T10:00:00Z' }, { at: '2026-10-26T12:00:00Z' }, { at: 'garbage' }] }
    expect(countWriterFailures(sj, null)).toBe(2)
    expect(countWriterFailures(sj, '2026-10-26T11:00:00Z')).toBe(1)
    expect(countWriterFailures({}, null)).toBe(0)
    expect(countWriterFailures(null, null)).toBe(0)
  })

  test('cap: at most 2 failed writer runs (≤ 6 paid drafts) per episode between resets', () => {
    expect(WRITER_MAX_FAILED_INVOCATIONS).toBe(2)
    expect(WRITER_MAX_FAILED_INVOCATIONS * (1 + WRITER_SELF_CHECK_MAX_REWRITES)).toBe(6)
  })

  test('the cap is checked before any writing call and before the narrator check', () => {
    const cap = fn.indexOf('priorWriterFailures >= WRITER_MAX_FAILED_INVOCATIONS')
    expect(cap).toBeGreaterThan(-1)
    expect(cap).toBeLessThan(fn.indexOf('writeWithSelfCheck({'))
    expect(cap).toBeLessThan(fn.indexOf('is not in narrator_voices'))
  })

  test('every paid-writer failure (failed drafts AND thrown calls) is recorded on the episode before throwing', () => {
    expect((fn.match(/await recordWriterFailure\(msg\)\s*\n\s*await markStoryNeedsAttention/g) || []).length).toBe(2)
    const rec = fn.slice(fn.indexOf('const recordWriterFailure = async'), fn.indexOf('// Narrator must resolve before any writing spend'))
    expect(rec).toMatch(/\.from\('stories'\)/)
    expect(rec).not.toMatch(/ownedJobFence|locked_at/)
  })

  test('the loader fetches the reset stamp the cap uses', () => {
    const loader = src.slice(src.indexOf('async function loadSeriesEpisodes('), src.indexOf('async function loadSeriesEpisodes(') + 900)
    expect(loader).toMatch(/dispatch_failure_reset_at/)
  })

  test('a busy writer is detected BEFORE lockJob (no locked_at rewrite, no clearLock)', () => {
    const post = src.slice(src.indexOf('const candidate = await selectCandidate(requestedJobId)'))
    expect(post.indexOf('writerClaimIsFresh(candidate.state_json, Date.now())')).toBeGreaterThan(-1)
    expect(post.indexOf('writerClaimIsFresh(candidate.state_json, Date.now())')).toBeLessThan(post.indexOf('lockedJob = await lockJob(candidate, lockHolderId)'))
  })

  test('one-job-guard path returns before adopting a job whose writer is busy', () => {
    const guard = src.slice(src.indexOf('.eq(\'locked_by\', lockHolderId)'), src.indexOf('lockedJob = existingJob as ProductionJob'))
    expect(guard).toMatch(/writerClaimIsFresh\(\(existingJob as ProductionJob\)\.state_json, Date\.now\(\)\)/)
    expect(guard).toMatch(/return bad\('Series writer already in progress/)
  })
})
