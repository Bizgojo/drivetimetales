// GATE-ENGINE regression tests — feat/unified-gate-engine
// Covers: digit contradiction (Alderton), six modules (happy + cap exhaustion),
// S-class halts, quality floor unchanged, marc_required conversions, sequencing.

import * as fs from 'fs'
import * as path from 'path'

import {
  classifyDefect,
  isSClassSignal,
  resolveAutonomousRoute,
  applyGateRouting,
  nextAttempt,
  createCircuit,
  circuitCheck,
  circuitRecord,
  episodeCircuitKey,
  auditFix,
  appendAudit,
  QUALITY_FLOOR_PUBLISH,
  QUALITY_REWRITE_CAP,
  applyQualityFloor,
  headEpisode,
  markEpisodePassed,
  markEpisodeBlocked,
  registerForGenre,
  autoCastVoices,
  housePenName,
  HOUSE_PEN_NAME_UNSET,
  resolvePenName,
  canonicalizeSeriesIntro,
  introHasCanonicalEpisodeDigit,
  introSatisfiesPackageCheck,
  isEpisodeNumberPassThrough,
  generateAnnouncementScript,
  buildCoverPrompt,
  COVER_RETRY_CAP,
  buildSeriesMetadata,
  DESCRIPTION_MAX_WORDS,
  TITLE_MAX_CHARS,
} from '@/lib/unifiedGateEngine'

import { numeralPreTtsScan, scanTextForDigitNumerals } from '@/lib/numeralPreTtsScan'
import { buildStructuredError } from '@/lib/pipeline-runner/types'

// ─── 1. DIGIT CONTRADICTION (Alderton b92596ad/b28cc33f/21621165) ────────────

describe('digit contradiction — digit intro passes both gates', () => {
  const intro = 'BELLE B: [LISTENER_NAME], "Alderton," Episode 3: "The Ledger." The numbers tell a story they were never meant to tell.'
  const script = ['TITLE: The Ledger', '[START AUDIO DRAMA SCRIPT]', intro, 'NARRATOR: The mill had stood empty for years.'].join('\n')

  test('without pass-through the required digit flags (the proven contradiction)', () => {
    const r = numeralPreTtsScan(script)
    expect(r.passed).toBe(false)
    expect(r.failures.some((f) => f.offendingText === '3')).toBe(true)
  })

  test('with episode-number pass-through the digit intro passes the numeral scan', () => {
    const r = numeralPreTtsScan(script, { episodeNumberPassThrough: 3 })
    expect(r.failures.filter((f) => f.offendingText === '3')).toHaveLength(0)
  })

  test('canonical intro satisfies the package check (digit accepted)', () => {
    const built = canonicalizeSeriesIntro({ seriesName: 'Alderton', episodeNumber: 3, episodeTitle: 'The Ledger', hook: 'The numbers tell a story.' })
    const pkg = introSatisfiesPackageCheck(built, { seriesName: 'Alderton', episodeNumber: 3, episodeTitle: 'The Ledger' })
    expect(pkg.passed).toBe(true)
  })

  test('real numerals still fail with pass-through active', () => {
    expect(scanTextForDigitNumerals('The rating was 4.6 out of five.', { episodeNumberPassThrough: 3 })).toEqual(['4.6'])
    expect(scanTextForDigitNumerals('There were 2,000 people there.', { episodeNumberPassThrough: 3 })).toEqual(['2,000'])
  })

  test('bare digit outside Episode context still fails', () => {
    expect(scanTextForDigitNumerals('He counted 3 coins.', { episodeNumberPassThrough: 3 })).toEqual(['3'])
    expect(scanTextForDigitNumerals('Episode 4 begins.', { episodeNumberPassThrough: 3 })).toEqual(['4'])
  })

  test('isEpisodeNumberPassThrough is narrow: decimals/years/grouped never pass', () => {
    expect(isEpisodeNumberPassThrough('3.0', 'Episode 3.0', 3)).toBe(false)
    expect(isEpisodeNumberPassThrough('2,000', 'Episode 2,000', 2000)).toBe(false)
    expect(isEpisodeNumberPassThrough('3', 'Episode 3', 3)).toBe(true)
    expect(isEpisodeNumberPassThrough('3', 'Chapter 3', 3)).toBe(false)
    expect(isEpisodeNumberPassThrough('3', 'Episode 3', null)).toBe(false)
  })
})

// ─── 2. SIX MODULES — happy path + cap exhaustion ────────────────────────────

const CATALOG = [
  { voice_id: 'v-warm-1', voice_name: 'Warm One', register: 'warm-intimate' },
  { voice_id: 'v-low-1', voice_name: 'Low One', register: 'low-slowburn' },
  { voice_id: 'v-bright-1', voice_name: 'Bright One', register: 'bright-propulsive' },
]

describe('module (a) casting', () => {
  test('happy path: genre register honored, locked assignments respected, voices distinct', () => {
    expect(registerForGenre('thriller')).toBe('low-slowburn')
    expect(registerForGenre('unknown-genre')).toBe('warm-intimate')
    const r = autoCastVoices({ genre: 'thriller', characters: ['ALICE', 'BOB'], catalog: CATALOG, lockedAssignments: { ALICE: 'v-bright-1' } })
    expect(r.ok).toBe(true)
    expect(r.narrator!.voice_id).toBe('v-low-1')
    expect(r.characters!.find((c) => c.role === 'ALICE')!.voice_id).toBe('v-bright-1')
    const ids = new Set([r.narrator!.voice_id, ...r.characters!.map((c) => c.voice_id)])
    expect(ids.size).toBe(3)
  })
  test('cap exhaustion: no catalog => retry; single-voice catalog => park, never Marc', () => {
    const empty = autoCastVoices({ genre: 'drama', catalog: [] })
    expect(empty.ok).toBe(false)
    expect(empty.action).toBe('retry_step')
    const solo = autoCastVoices({ genre: 'drama', characters: ['A', 'B'], catalog: [{ voice_id: 'v1', voice_name: 'Solo' }] })
    expect(solo.ok).toBe(true) // degrades: reuses single voice, stays autonomous
  })
})

describe('module (b) pen name', () => {
  test('happy path: series metadata wins; house default otherwise', () => {
    expect(resolvePenName({ pen_name: 'Carter Vale' }, {})).toEqual({ penName: 'Carter Vale', source: 'series_metadata', needsDecision: false })
    expect(resolvePenName({}, { HOUSE_PEN_NAME: 'House Name' })).toEqual({ penName: 'House Name', source: 'house_default', needsDecision: false })
  })
  test('needs decision: unset house name never invents one', () => {
    const r = resolvePenName({}, {})
    expect(r.penName).toBe(HOUSE_PEN_NAME_UNSET)
    expect(r.needsDecision).toBe(true)
    expect(housePenName({})).toBe(HOUSE_PEN_NAME_UNSET)
  })
})

describe('module (c) intro canonicalization', () => {
  test('happy path: canonical digit format enforced', () => {
    const t = canonicalizeSeriesIntro({ seriesName: 'Alderton', episodeNumber: 3, episodeTitle: 'The Ledger', hook: 'Hook here.' })
    expect(t).toBe('[LISTENER_NAME], "Alderton," Episode 3: "The Ledger." Hook here.')
    expect(introHasCanonicalEpisodeDigit(t, 3)).toBe(true)
    expect(introHasCanonicalEpisodeDigit(t, 4)).toBe(false)
  })
  test('package check fails loudly on missing pieces', () => {
    const pkg = introSatisfiesPackageCheck('Hello world.', { seriesName: 'Alderton', episodeNumber: 3, episodeTitle: 'The Ledger' })
    expect(pkg.passed).toBe(false)
    expect(pkg.issues).toHaveLength(3)
  })
})

describe('module (d) announcement', () => {
  test('happy path: all five kinds generate with checks', () => {
    const kinds = ['series_intro', 'series_non_finale_outro', 'series_finale_outro', 'standalone_intro', 'standalone_outro'] as const
    for (const kind of kinds) {
      const r = generateAnnouncementScript({
        kind, seriesName: 'Alderton', episodeNumber: 2, episodeTitle: 'Ep Two',
        standaloneTitle: 'Solo', author: 'A. Uthor', narrator: 'N. Arrato',
        nextTease: 'Next time, the truth surfaces.',
      })
      expect(r.text.length).toBeGreaterThan(10)
      expect(r.checks.length).toBeGreaterThan(0)
    }
  })
  test('finale names credits; non-finale carries tease without credits', () => {
    const fin = generateAnnouncementScript({ kind: 'series_finale_outro', seriesName: 'Alderton', author: 'A. Uthor', narrator: 'N. Arrato' })
    expect(fin.text).toMatch(/A\. Uthor/)
    expect(fin.text).toMatch(/N\. Arrato/)
    const non = generateAnnouncementScript({ kind: 'series_non_finale_outro', nextTease: 'Next: the fall.' })
    expect(non.text).toMatch(/Next: the fall\./)
  })
})

describe('module (e) cover', () => {
  test('happy path: bright default, dark exception, no-text rule', () => {
    const b = buildCoverPrompt({ title: 'The Ledger', genre: 'mystery', concept: 'A mill at dawn' })
    expect(b.bright).toBe(true)
    expect(b.prompt).toMatch(/No text/)
    const d = buildCoverPrompt({ title: 'The Ledger', darkException: true })
    expect(d.bright).toBe(false)
  })
  test('cap exhaustion: feedback marks attempt 1 of COVER_RETRY_CAP', () => {
    const r = buildCoverPrompt({ title: 'X', feedback: 'brighter' })
    expect(r.attemptsUsed).toBe(1)
    expect(r.attemptsUsed).toBeLessThanOrEqual(COVER_RETRY_CAP)
  })
})

describe('module (f) metadata', () => {
  test('happy path: description within limits, present tense', () => {
    const r = buildSeriesMetadata({ seriesName: 'Alderton', premise: 'A driver inherits a mill that hums at night.', genre: 'mystery', totalEpisodes: 6, penName: 'Carter Vale' }, {})
    expect(r.ok).toBe(true)
    expect(r.author).toBe('Carter Vale')
  })
  test('violations reported, never silently passed', () => {
    const long = buildSeriesMetadata({ seriesName: 'A'.repeat(TITLE_MAX_CHARS + 1), premise: 'He vanished after he found the sealed box that was hidden and lost and forged and buried long ago indeed truly.' }, {})
    expect(long.ok).toBe(false)
    expect(long.issues.length).toBeGreaterThanOrEqual(2)
    expect(long.description.split(/\s+/).length).toBeLessThanOrEqual(DESCRIPTION_MAX_WORDS)
  })
})

// ─── 3. RETRY DRIVER + CIRCUITS + AUDIT ──────────────────────────────────────

describe('bounded retry + per-ep circuits + audit', () => {
  test('nextAttempt allows up to cap, then denies', () => {
    expect(nextAttempt({ attempt: 0, cap: 3 })).toEqual({ allow: true, attempt: 1 })
    expect(nextAttempt({ attempt: 3, cap: 3 }).allow).toBe(false)
  })
  test('per-episode circuits isolate failures (Canon Rule 3)', () => {
    const ledger = createCircuit()
    const k3 = episodeCircuitKey('series-1', 3, 'numeral_pre_tts')
    const k4 = episodeCircuitKey('series-1', 4, 'numeral_pre_tts')
    circuitRecord(ledger, k3); circuitRecord(ledger, k3)
    expect(circuitCheck(ledger, k3, 2).allow).toBe(false)
    expect(circuitCheck(ledger, k4, 2).allow).toBe(true)
  })
  test('every autonomous fix carries before/after audit', () => {
    const e = auditFix({ kind: 'numeral_pre_tts', defectClass: 'B', action: 'sendback_rewrite', attempt: 1, before: 'rating 4.6', after: 'rating four point six', note: 'spell-out' })
    expect(e.at).toBeTruthy()
    const log = appendAudit([], e)
    expect(log).toHaveLength(1)
  })
})

// ─── 4. S-CLASS STILL HALTS ──────────────────────────────────────────────────

describe('S-class halts; everything else routes autonomous', () => {
  test('safety/legal/corruption/infra signals halt', () => {
    expect(isSClassSignal('possible copyright infringement claim')).toBe(true)
    expect(isSClassSignal('takedown notice received')).toBe(true)
    expect(isSClassSignal('unrecoverable WAL corrupt, data loss risk')).toBe(true)
    expect(isSClassSignal('widespread corrupt rows across episodes')).toBe(true)
    expect(isSClassSignal('TTS misread a numeral')).toBe(false)
    // runner /tmp-full is transient-retryable, NOT S-class:
    expect(isSClassSignal('TMP_SPACE_LOW runner_tmp_full safe to retry')).toBe(false)
  })
  test('unknown/unclassified kinds halt (S-conservative)', () => {
    for (const k of ['', 'unknown', 'empty_error_json', 'unknown_step', 'unknown_qc', 'some_future_kind']) {
      const r = resolveAutonomousRoute(k, 'boom')
      expect(r.action).toBe('halt_for_marc')
      expect(r.marc_required).toBe(true)
    }
    expect(classifyDefect({ kind: '' }).defectClass).toBe('S')
  })
  test('script_validator_unknown halts (unclassified validator output)', () => {
    const r = resolveAutonomousRoute('script_validator_unknown', 'weird')
    expect(r.marc_required).toBe(true)
  })
})

// ─── 5. MARC_REQUIRED CONVERSIONS ────────────────────────────────────────────

describe('formerly-marc_required kinds now route autonomous', () => {
  const cases: Array<[string, string]> = [
    ['premise_collision', 'sendback_rewrite'],
    ['character_description_missing', 'recast'],
    ['continuity_pin_mismatch', 'retry_step'],
    ['transcript_question_mark', 'retranscribe'],
    ['transcript_qc', 'retranscribe'],
    ['music_retry_exhausted', 'library_fallback'],
    ['series_render_retry_exhausted', 'tmp_sweep_retry'],
    ['belle_quality_repair_failed', 'canonical_regen'],
    ['belle_asset_blocked', 'canonical_regen'],
    ['belle_quality_blocked', 'canonical_regen'],
    ['series_belle_retry_validation_failed', 'canonical_regen'],
    ['quality_gate_exhausted', 'park'],
    ['script_quality_editorial', 'sendback_rewrite'],
    ['numeral_pre_tts', 'sendback_rewrite'],
    ['narrator_mismatch', 'metadata_fix'],
    ['cover_art', 'cover_regen'],
  ]
  for (const [kind, action] of cases) {
    test(`${kind} => ${action}, marc_required=false`, () => {
      const r = resolveAutonomousRoute(kind, `${kind} happened`)
      expect(r.action).toBe(action)
      expect(r.marc_required).toBe(false)
      expect(r.autonomous_repair || r.action === 'park').toBe(true)
      expect(r.playbookId).toBeTruthy()
    })
  }
  test('buildStructuredError downgrades routed kinds, preserves S halts', () => {
    const auto = buildStructuredError('numeral_pre_tts', 'Digit numeral "4.6"', 'voice_preflight', { marc_required: true })
    expect(auto.marc_required).toBe(false)
    expect(auto.playbookId).toBe('hal-spell-out-numerals')
    expect(auto.safe_resume_point).toBe('generate_script')
    const halted = buildStructuredError('unknown_qc', 'mystery failure', 'render_final_mix', { marc_required: true })
    expect(halted.marc_required).toBe(true)
    const already = buildStructuredError('narrator_mismatch', 'x', 's', { marc_required: false })
    expect(already.marc_required).toBe(false)
  })
  test('applyGateRouting never clobbers explicit caller fields', () => {
    const r = applyGateRouting('numeral_pre_tts', 'x', { marc_required: true, safe_resume_point: 'custom_step', max_retries: 9 })
    expect(r.marc_required).toBe(false)
    expect(r.safe_resume_point).toBe('custom_step')
    expect(r.max_retries).toBe(9)
  })
})

// ─── 6. QUALITY FLOOR UNCHANGED ──────────────────────────────────────────────

describe('Sep-14 quality floor unchanged', () => {
  test('>=24 publish, <24 rewrite x3 then park', () => {
    expect(applyQualityFloor(24, 0).decision).toBe('publish')
    expect(applyQualityFloor(30, 0).decision).toBe('publish')
    expect(applyQualityFloor(23, 0).decision).toBe('rewrite')
    expect(applyQualityFloor(23, 2).decision).toBe('rewrite')
    expect(applyQualityFloor(23, 3).decision).toBe('park')
    expect(QUALITY_FLOOR_PUBLISH).toBe(24)
    expect(QUALITY_REWRITE_CAP).toBe(3)
  })
  test('engine floor matches storyQualityGate source (source-sync)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'storyQualityGate.ts'), 'utf8')
    const m = src.match(/QUALITY_GATE_AUTO_PUBLISH_THRESHOLD\s*=\s*(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(QUALITY_FLOOR_PUBLISH)
    expect(src).toMatch(/export const QUALITY_GATE_AUTO_PUBLISH_THRESHOLD/)
  })
})

// ─── 7. SEQUENTIAL ORDERING (Canon Rule 3) ───────────────────────────────────

describe('strict ordering preserved', () => {
  test('head advances only; passed episodes lock forever', () => {
    let line = { seriesId: 's1', states: { 1: 'head' as const, 2: 'waiting' as const, 3: 'waiting' as const } }
    expect(headEpisode(line)).toBe(1)
    line = markEpisodePassed(line, 1)
    expect(line.states[1]).toBe('passed_locked')
    expect(headEpisode(line)).toBe(2)
    line = markEpisodeBlocked(line, 2)
    expect(headEpisode(line)).toBe(2)
    line = markEpisodePassed(line, 2)
    // ep1 untouched by ep2's block/pass cycle:
    expect(line.states[1]).toBe('passed_locked')
    expect(headEpisode(line)).toBe(3)
  })
})
