/**
 * ALARM-SERIES-SEGMENTS-001 (Nov 4, 2026).
 *
 * Bug: series jobs (no story_id) fingerprinted presentCount=0 and only
 * counted finished episodes (audio_url). Last Well and Callisto were saving
 * hundreds of segments but were flagged "stuck".
 *
 * Pins:
 *  1. Segments are summed across all episode folders of a series.
 *  2. A series that saves new segments is healthy (fingerprint moves).
 *  3. The Nov 2-4 loop (same segment re-saved, count frozen) still alerts.
 *  4. The route counts series segments when the job has no story_id.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  countSegments,
  sumSeriesSegments,
  evaluateProgressAlarm,
  type SavedProgress,
} from '@/lib/progressAlarm'

const seg = (n: number) => ({ name: `segment_${String(n).padStart(4, '0')}.mp3` })
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => seg(a + i))

describe('ALARM-SERIES-SEGMENTS-001', () => {
  it('counts only segment files', () => {
    expect(countSegments([seg(1), { name: 'diag' }, { name: 'final_mix.mp3' }, seg(2)])).toBe(2)
    expect(countSegments(null)).toBe(0)
  })

  it('sums segments across every episode folder', () => {
    expect(sumSeriesSegments([range(1, 150), range(1, 43), null, []])).toBe(193)
  })

  it('a series saving new segments stays healthy', () => {
    const t0 = Date.parse('2026-11-04T21:00:00Z')
    const before: SavedProgress = { presentCount: 400, audioUrl: null, step: 'series_generate_voices', episodeCount: 0 }
    const first = evaluateProgressAlarm(null, before, t0)
    const after: SavedProgress = { ...before, presentCount: 437 }
    const later = evaluateProgressAlarm(first.nextState, after, t0 + 65 * 60_000)
    expect(later.healthy).toBe(true)
    expect(later.decision).toBe('ok')
  })

  it('the Nov 2-4 loop (count frozen) still alerts', () => {
    const t0 = Date.parse('2026-11-04T21:00:00Z')
    const frozen: SavedProgress = { presentCount: 437, audioUrl: null, step: 'series_generate_voices', episodeCount: 0 }
    const first = evaluateProgressAlarm(null, frozen, t0)
    const later = evaluateProgressAlarm(first.nextState, frozen, t0 + 31 * 60_000)
    expect(later.healthy).toBe(false)
    expect(later.decision).toBe('stuck_first_alert')
  })

  it('route sums series segments when the job has no story_id', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'progress-alarm', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/job\.series_id && !storyId/)
    expect(src).toMatch(/sumSeriesSegments\(listings\)/)
  })
})
