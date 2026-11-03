/**
 * AUTHOR-WRITTEN-EXEMPT-001 (Marc commission 2026-11-03, Sunset e9f3ff76 only)
 *
 * Flag off = today's behavior. Flag on = skips only the author-copy gates
 * (series: runtime floor, pre-voice Belle content, position validation,
 * Belle auto-repair; standalone: runtime floor, pre-voice Belle content,
 * Belle quality check, Belle AI repair fails closed); technical gates
 * (numerals, roster voices, transcript QC, loudness, duration, publish)
 * stay enforced.
 *
 * Zero paid ops, zero production writes. The source-wiring section reads the
 * route file as text — no import of the route module (boots Supabase clients).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  AUTHOR_WRITTEN_EXEMPT_ID,
  AUTHOR_WRITTEN_SUNSET_SERIES_ID,
  AUTHOR_WRITTEN_SKIPPED_GATES,
  AUTHOR_WRITTEN_KEPT_GATES,
  isAuthorWrittenSeries,
} from '@/lib/authorWrittenExempt'

describe('author-written flag defaults', () => {
  test('off by default: missing / null / false all behave as today', () => {
    expect(isAuthorWrittenSeries(null)).toBe(false)
    expect(isAuthorWrittenSeries(undefined)).toBe(false)
    expect(isAuthorWrittenSeries({})).toBe(false)
    expect(isAuthorWrittenSeries({ author_written: false })).toBe(false)
    expect(isAuthorWrittenSeries({ author_written: null })).toBe(false)
  })

  test('on only when explicitly true (Sunset row)', () => {
    expect(isAuthorWrittenSeries({ author_written: true })).toBe(true)
  })

  test('Sunset series id is pinned', () => {
    expect(AUTHOR_WRITTEN_SUNSET_SERIES_ID).toBe(
      'e9f3ff76-9401-4bf5-bf5a-36d83b5398f7',
    )
  })
})

describe('exempt contract: skip list vs keep list', () => {
  test('skips exactly the author-copy gates (series + standalone)', () => {
    expect([...AUTHOR_WRITTEN_SKIPPED_GATES]).toEqual([
      'series_runtime_floor',
      'series_prevoice_belle_content',
      'series_belle_position_validation',
      'series_belle_auto_repair',
      'standalone_runtime_floor',
      'standalone_prevoice_belle_content',
      'standalone_belle_quality',
      'standalone_belle_auto_repair',
    ])
  })

  test('keeps every technical gate', () => {
    expect([...AUTHOR_WRITTEN_KEPT_GATES]).toEqual(
      expect.arrayContaining([
        'numeral_pre_tts_scan',
        'narrator_roster_voices',
        'transcript_qc',
        'loudness',
        'runtime_gate_measured',
        'publish_guard',
      ]),
    )
  })

  test('skip list and keep list do not overlap', () => {
    const overlap = AUTHOR_WRITTEN_SKIPPED_GATES.filter((g) =>
      (AUTHOR_WRITTEN_KEPT_GATES as readonly string[]).includes(g),
    )
    expect(overlap).toEqual([])
  })
})

describe('route wiring (source check, no DB)', () => {
  const routePath = path.join(
    __dirname,
    '..',
    'app',
    'api',
    'admin',
    'production-jobs',
    'run-next',
    'route.ts',
  )
  const src = fs.readFileSync(routePath, 'utf8')

  test('imports the exemption predicate', () => {
    expect(src).toContain("from '@/lib/authorWrittenExempt'")
    expect(src).toContain('isAuthorWrittenSeries')
    expect(src).toContain(AUTHOR_WRITTEN_EXEMPT_ID)
  })

  test('series runtime floor is gated on the flag (numerals/narrator above untouched)', () => {
    expect(src).toContain('!authorWrittenExempt')
    // numeral scan still blocks unconditionally in series preflight
    expect(src).toMatch(/numeralPreTtsScan\(\(nextEpisode as any\)\.script/)
  })

  test('pre-voice Belle content gate is gated on the flag', () => {
    expect(src).toContain('!epBelleExempt && !authorWrittenExempt')
  })

  test('series package position validation bypasses when flag is on', () => {
    expect(src).toContain('isBelleExemptEpisode || authorWrittenExempt')
  })

  test('series Belle auto-retry fails closed when flag is on (no rewrite)', () => {
    expect(src).toContain('no auto-repair of author-written copy')
  })

  test('standalone preflight reads the flag from the story series_id', () => {
    expect(src).toContain('standaloneAuthorExempt')
    // lookup keys off the story row's series_id (Sunset eps run standalone
    // jobs with job_type single despite story_type series_episode)
    expect(src).toContain("(storyForNarrator as any)?.series_id")
  })

  test('standalone runtime floor is gated on the flag', () => {
    expect(src).toContain('!runtimeCheck.skipped && !standaloneAuthorExempt')
    expect(src).toContain('runtime floor skipped (author-written')
  })

  test('standalone pre-voice Belle content gate is gated on the flag', () => {
    expect(src).toContain('!gateBelleExempt && !standaloneAuthorExempt')
  })

  test('standalone Belle quality check skips when flag is on', () => {
    expect(src).toContain('Belle quality check skipped (author-written')
    expect(src).toContain("status: 'skipped_author_written'")
  })

  test('standalone Belle repair fails closed when flag is on (no rewrite)', () => {
    expect(src).toContain('no auto-repair of author-written copy): ${repairIssues}')
    // numerals + narrator still block unconditionally in standalone preflight
    expect(src).toMatch(/numeralPreTtsScan\(storyForNarrator\.script/)
  })
})
