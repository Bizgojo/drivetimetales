/**
 * RERECORD-RUNNER-001 — pure helpers used by scripts/rerecord-episodes.ts.
 */

import {
  expectedSegmentNames,
  failedSegmentNumbers,
  filesToBackUp,
  garbleReportProblem,
  parseGarbleReportPath,
  summarizeGarble,
} from '@/lib/rerecordPlan'

describe('filesToBackUp', () => {
  test('moves segment/intro/outro/announcement mp3s, deletes qcskip sidecars, keeps everything else', () => {
    const names = [
      'segment_0000.mp3',
      'segment_0031.mp3',
      'segment_0031.qcskip.json',
      'intro_0001.mp3',
      'outro_0152.mp3',
      'outro_with_music.mp3',
      'announcement_0000.mp3',
      'intro.mp3',
      'outro.mp3',
      'announcement.mp3',
      'final_mix.mp3',
      'music_bed.mp3',
      'segment_0005.json',
      '_backup_rr_20260928/', // subfolder name — never moved
    ]
    const { backup, qcskips } = filesToBackUp(names)
    expect(backup).toEqual([
      'segment_0000.mp3',
      'segment_0031.mp3',
      'intro_0001.mp3',
      'outro_0152.mp3',
      'outro_with_music.mp3',
      'announcement_0000.mp3',
      'intro.mp3',
      'outro.mp3',
      'announcement.mp3',
    ])
    expect(qcskips).toEqual(['segment_0031.qcskip.json'])
  })

  test('empty folder → nothing to do', () => {
    expect(filesToBackUp([])).toEqual({ backup: [], qcskips: [] })
  })
})

describe('expectedSegmentNames', () => {
  test('zero-pads to 4 digits', () => {
    expect(expectedSegmentNames([0, 7, 31, 152])).toEqual([
      'segment_0000.mp3',
      'segment_0007.mp3',
      'segment_0031.mp3',
      'segment_0152.mp3',
    ])
  })
})

describe('parseGarbleReportPath', () => {
  test('finds the report path in gate output', () => {
    const out = 'Checked 151 segments\n  JSON report: /tmp/garble-gate-abc-1790641867595.json\nFAIL: 2'
    expect(parseGarbleReportPath(out)).toBe('/tmp/garble-gate-abc-1790641867595.json')
  })

  test('null when the gate crashed before writing a report', () => {
    expect(parseGarbleReportPath('Error: something broke')).toBeNull()
    expect(parseGarbleReportPath('')).toBeNull()
  })
})

describe('failedSegmentNumbers / summarizeGarble', () => {
  const report = {
    results: [
      { segIndex: 0, segName: 'segment_0000', status: 'ok', wer: 0 },
      { segIndex: 31, segName: 'segment_0031', status: 'fail', wer: 0.62 },
      { segName: 'segment_0062', status: 'fail', wer: 0.45 }, // no segIndex → from name
      { segIndex: 70, segName: 'segment_0070', status: 'warn', wer: 0.2 },
      { segIndex: 80, segName: 'segment_0080', status: 'skipped', wer: null },
      { segIndex: 81, segName: 'segment_0081', status: 'missing', wer: null },
    ],
  }

  test('only "fail" rows are touched up', () => {
    expect(failedSegmentNumbers(report)).toEqual([31, 62])
  })

  test('summary counts and fail rows', () => {
    expect(summarizeGarble(report)).toEqual({
      ok: 1,
      warn: 1,
      fail: 2,
      missing: 1,
      unscored: 0,
      failRows: [
        { segName: 'segment_0031', wer: 0.62 },
        { segName: 'segment_0062', wer: 0.45 },
      ],
    })
  })

  test('missing/empty report is safe', () => {
    expect(failedSegmentNumbers(null)).toEqual([])
    expect(summarizeGarble(undefined)).toEqual({ ok: 0, warn: 0, fail: 0, missing: 0, unscored: 0, failRows: [] })
  })
})

describe('garbleReportProblem — an unchecked episode is never reported clean', () => {
  test('local Whisper crash rows (warn, wer null) are a problem', () => {
    const r = { results: [{ segIndex: 0, status: 'ok', wer: 0 }, { segIndex: 1, status: 'warn', wer: null }] }
    expect(garbleReportProblem(r)).toMatch(/Whisper failed on 1/)
  })
  test('missing segment files are a problem', () => {
    expect(garbleReportProblem({ results: [{ segIndex: 0, status: 'ok', wer: 0 }, { segIndex: 1, status: 'missing', wer: null }] })).toMatch(/missing/)
  })
  test('nothing scored is a problem', () => {
    expect(garbleReportProblem({ results: [] })).toMatch(/no segments/)
  })
  test('scored ok/warn/fail rows are trustworthy (fails are handled by the touch-up)', () => {
    expect(garbleReportProblem({ results: [
      { segIndex: 0, status: 'ok', wer: 0 },
      { segIndex: 1, status: 'warn', wer: 0.2 },
      { segIndex: 2, status: 'fail', wer: 0.6 },
      { segIndex: 3, status: 'skipped', wer: null },
    ] })).toBeNull()
  })
})
