import { testStoryReason, partialSeriesReason } from '@/lib/publishGuards'

describe('PUBLISH-GUARDS-001', () => {
  test('test markers are refused', () => {
    expect(testStoryReason({ series_name: '[GARBLE-TEST] The Iron Meridian [S2V2-CLEAN]' })).toMatch(/test/)
    expect(testStoryReason({ series_name: 'Pipeline Verification Test — 2026-09-01 (TEST ONLY)' })).toMatch(/test/)
    expect(testStoryReason({ series_name: 'Music002 Test Series 1788289652519' })).toMatch(/test/)
  })
  test('real titles that merely contain the word are not', () => {
    expect(testStoryReason({ title: 'The Test of Time', series_name: 'Rerouted' })).toBeNull()
    expect(testStoryReason({ title: 'Live Signal', series_name: 'Rerouted' })).toBeNull()
  })
  test('one episode alone is refused; the last missing episode completing the series is allowed', () => {
    const sibs = [{ id: 'a', status: 'published', is_hidden: false }, { id: 'b', status: 'audio_ready', is_hidden: true }, { id: 'c', status: 'audio_ready', is_hidden: true }]
    expect(partialSeriesReason('b', sibs)).toMatch(/1 other episode/)
    expect(partialSeriesReason('b', sibs.slice(0, 2))).toBeNull()
  })
})
