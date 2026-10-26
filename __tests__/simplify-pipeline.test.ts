/**
 * SIMPLIFY-PIPELINE (Marc commission 2026-10-26)
 *
 * Gate-ordering: content gates run BEFORE any paid call, so content failures
 * burn $0 of voice/music spend. Resume: valid stages are never re-rendered.
 *
 * Zero paid ops, zero production writes. The source-wiring section reads the
 * route file as text and asserts gate placement — no imports of the route
 * module (which boots Supabase/Anthropic clients).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  STANDALONE_CRITICAL_PATH,
  SERIES_CRITICAL_PATH,
  assertGatesPrecedePaidCalls,
  shouldPurgeVoiceSegments,
  belleAssetShouldRender,
  musicUrlReusable,
} from '@/app/lib/pipeline-gates'

describe('gate ordering — canonical critical paths', () => {
  test('standalone: every content gate precedes every paid step', () => {
    expect(assertGatesPrecedePaidCalls(STANDALONE_CRITICAL_PATH)).toEqual([])
  })

  test('series: every content gate precedes every paid step', () => {
    expect(assertGatesPrecedePaidCalls(SERIES_CRITICAL_PATH)).toEqual([])
  })

  test('standalone path is exactly validate → preflight → voice → belle → music → mix → publish', () => {
    expect(STANDALONE_CRITICAL_PATH.map((s) => s.step)).toEqual([
      'validate_voice_conformance',
      'validate_script',
      'validate_story_resolution',
      'voice_preflight',
      'generate_voices',
      'generate_belle_assets',
      'validate_belle_assets',
      'validate_belle_quality',
      'generate_music',
      'render_final_mix',
      'complete_story_package',
      'ready_for_review',
    ])
  })

  test('series path is exactly validate → preflight → voice → belle → music → mix → publish', () => {
    expect(SERIES_CRITICAL_PATH.map((s) => s.step)).toEqual([
      'generate_episode_script',
      'score_validate_package',
      'series_voice_preflight',
      'series_generate_voices',
      'series_generate_belle_assets',
      'series_generate_music',
      'series_render_final_mix',
      'complete_story_package',
    ])
  })

  test('pre-spend gate set includes the voice preflights (hook + Belle text moved before spend)', () => {
    const gates = (path: typeof STANDALONE_CRITICAL_PATH) =>
      path.filter((s) => s.contentGate).map((s) => s.step)
    expect(gates(STANDALONE_CRITICAL_PATH)).toEqual([
      'validate_voice_conformance',
      'validate_script',
      'validate_story_resolution',
      'voice_preflight',
    ])
    expect(gates(SERIES_CRITICAL_PATH)).toEqual([
      'score_validate_package',
      'series_voice_preflight',
    ])
  })

  test('post-audio verification stays downstream of voice spend (never weakened, never pre-audio)', () => {
    const audioGates = STANDALONE_CRITICAL_PATH.filter((s) => s.verifiesAudio).map((s) => s.step)
    expect(audioGates).toEqual(['validate_belle_assets', 'validate_belle_quality'])
    const idx = (step: string) => STANDALONE_CRITICAL_PATH.findIndex((s) => s.step === step)
    // verification runs after the voice paid steps it checks …
    expect(idx('validate_belle_assets')).toBeGreaterThan(idx('generate_voices'))
    expect(idx('validate_belle_quality')).toBeGreaterThan(idx('generate_belle_assets'))
    // … and before publish
    expect(idx('validate_belle_quality')).toBeLessThan(idx('complete_story_package'))
  })

  test('paid steps are exactly the voice/belle-asset/music generators', () => {
    const paid = STANDALONE_CRITICAL_PATH.filter((s) => s.paid).map((s) => s.step)
    expect(paid).toEqual(['generate_voices', 'generate_belle_assets', 'generate_music'])
    const seriesPaid = SERIES_CRITICAL_PATH.filter((s) => s.paid).map((s) => s.step)
    expect(seriesPaid).toEqual([
      'series_generate_voices',
      'series_generate_belle_assets',
      'series_generate_music',
    ])
  })

  test('detector catches a gate placed after a paid step (guard against silent reorder)', () => {
    const broken = STANDALONE_CRITICAL_PATH.map((s) =>
      s.step === 'voice_preflight'
        ? { ...s, step: 'voice_preflight' }
        : s
    )
    // move voice_preflight after generate_voices
    const gate = broken.splice(3, 1)[0]
    broken.splice(4, 0, gate)
    const violations = assertGatesPrecedePaidCalls(broken)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join(' ')).toMatch('voice_preflight')
  })
})

// ── Source wiring: the gate code physically runs before paid dispatch ────────
// Reads the route file as text. runStandaloneVoicePreflight /
// runSeriesVoicePreflight must invoke the Belle-text content gate
// (validateBelleText) BEFORE the generate-voices preflight request, and the
// voice-segment runner must purge stored audio only on first invocation.

function routeSource(): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'admin', 'production-jobs', 'run-next', 'route.ts'),
    'utf8'
  )
}

function functionBody(src: string, fnName: string): string {
  const start = src.indexOf(`async function ${fnName}`)
  if (start === -1) throw new Error(`function ${fnName} not found in route source`)
  const nextFn = src.indexOf('\nasync function ', start + 1)
  return nextFn === -1 ? src.slice(start) : src.slice(start, nextFn)
}

describe('gate ordering — wired in run-next source', () => {
  const src = routeSource()

  test('standalone preflight runs the Belle-text content gate before the voice preflight request', () => {
    const body = functionBody(src, 'runStandaloneVoicePreflight')
    const gateIdx = body.indexOf('validateBelleText')
    const paidIdx = body.indexOf('runGenerateVoicesPreflightRequest(origin')
    expect(gateIdx).toBeGreaterThan(-1)
    expect(paidIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeLessThan(paidIdx)
  })

  test('series preflight runs the Belle-text content gate before the voice preflight request', () => {
    const body = functionBody(src, 'runSeriesVoicePreflight')
    const gateIdx = body.indexOf('validateBelleText')
    const paidIdx = body.indexOf('runGenerateVoicesPreflightRequest(origin')
    expect(gateIdx).toBeGreaterThan(-1)
    expect(paidIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeLessThan(paidIdx)
  })

  test('series preflight runs hook/position rules pre-spend (gate moved from complete_story_package)', () => {
    const body = functionBody(src, 'runSeriesVoicePreflight')
    expect(body).toMatch('validateIntroOutroPositionRules')
  })

  test('pre-voice failures carry a routable belle_quality_* kind (autonomous retry, not silent)', () => {
    const body = functionBody(src, 'runStandaloneVoicePreflight')
    expect(body).toMatch('classifyBelleIssues')
    expect(body).toMatch('preVoiceContentGate')
  })

  test('voice-segment resume purges only on first invocation (reuse otherwise)', () => {
    const body = functionBody(src, 'runStandaloneVoiceSegment')
    expect(body).toMatch('shouldPurgeVoiceSegments')
    expect(body).toMatch('retryMissingOnly')
  })
})

describe('resume-from-failed-step — valid stages are not re-rendered', () => {
  test('first voice invocation purges stale segments; resume keeps them', () => {
    // fresh job: no progress recorded → purge stale audio from prior runs
    expect(shouldPurgeVoiceSegments({})).toBe(true)
    expect(shouldPurgeVoiceSegments({ lastUpdatedAt: undefined, presentCount: 0 })).toBe(true)
    // partial run after transient failure → reuse via retryMissingOnly
    expect(shouldPurgeVoiceSegments({ lastUpdatedAt: '2026-10-26T00:00:00Z', presentCount: 12 })).toBe(false)
    expect(shouldPurgeVoiceSegments({ lastUpdatedAt: '2026-10-26T00:00:00Z' })).toBe(false)
    expect(shouldPurgeVoiceSegments({ presentCount: 5 })).toBe(false)
  })

  test('belle intro/outro reuses existing recordings unless text was repaired', () => {
    expect(belleAssetShouldRender({ hasExistingFile: true, textRepaired: false })).toBe(false)
    expect(belleAssetShouldRender({ hasExistingFile: true, textRepaired: true })).toBe(true)
    expect(belleAssetShouldRender({ hasExistingFile: false, textRepaired: false })).toBe(true)
    expect(belleAssetShouldRender({ hasExistingFile: false, textRepaired: true })).toBe(true)
  })

  test('music reuses a recorded URL; pending markers and blanks re-render', () => {
    expect(musicUrlReusable('https://cdn.example.com/asc3/abc/background_music.mp3')).toBe(true)
    expect(musicUrlReusable('pending:abc123')).toBe(false)
    expect(musicUrlReusable('  pending:x')).toBe(false)
    expect(musicUrlReusable('')).toBe(false)
    expect(musicUrlReusable('   ')).toBe(false)
    expect(musicUrlReusable(null)).toBe(false)
    expect(musicUrlReusable(undefined)).toBe(false)
  })

  test('generate-voices belle path reuses existing files (skipped_existing, no paid re-render)', () => {
    const voicesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'generate-voices', 'route.ts'),
      'utf8'
    )
    expect(voicesSrc).toMatch('skipped_existing')
    // existing intro/outro short-circuit generation
    expect(voicesSrc).toMatch('!existingIntroFile && introLine')
    expect(voicesSrc).toMatch('!existingOutroFile && outroLine')
  })
})
