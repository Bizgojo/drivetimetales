import { compareRecommendationRank, geographicMatch, normalizeState } from '@/lib/geographicRecommendations'

describe('Home geographic recommendation ranking', () => {
  test.each(['SC', 'sc', ' South Carolina ', 'S.C.'])('normalizes saved state %s', state => {
    expect(normalizeState(state)).toBe('SC')
  })
  test('unknown and missing locations leave ordinary ranking intact', () => {
    expect(geographicMatch('South Carolina', {})).toBe(0)
    expect(geographicMatch('South Carolina', { state: 'unknown' })).toBe(0)
    expect(normalizeState({})).toBeNull()
  })
  test('matches full state names and qualified postal abbreviations', () => {
    expect(geographicMatch('A mystery in South Carolina.', { state: 'SC' })).toBe(1)
    expect(geographicMatch('A mystery in Greenville, SC.', { state: 'South Carolina' })).toBe(1)
    expect(geographicMatch('A mystery in North Carolina.', { state: 'SC' })).toBe(0)
  })
  test('does not confuse dialogue or substrings with postal codes', () => {
    for (const state of ['IN', 'OR', 'ME', 'HI', 'OK']) {
      expect(geographicMatch('HI! COME IN OR WAIT FOR ME. OK?', { state })).toBe(0)
    }
    expect(geographicMatch('A Virginian returns.', { state: 'Virginia' })).toBe(0)
  })
  test('disambiguates Washington DC and West Virginia', () => {
    expect(geographicMatch('Washington DC romance', { state: 'WA' })).toBe(0)
    expect(geographicMatch('Washington, D.C. romance', { state: 'DC' })).toBe(1)
    expect(geographicMatch('Washington state romance', { state: 'WA' })).toBe(1)
    expect(geographicMatch('West Virginia mystery', { state: 'VA' })).toBe(0)
    expect(geographicMatch('West Virginia mystery', { state: 'WV' })).toBe(1)
  })
  test('identifies the South Carolina Lake Marion by its Santee Cooper reference', () => {
    expect(geographicMatch('Lake Marion. The Santee Cooper reservoir.', { state: 'SC' })).toBe(1)
    expect(geographicMatch('Lake Marion alone.', { state: 'SC' })).toBe(0)
  })
  test('city is stronger only within the matched state and respects boundaries', () => {
    expect(geographicMatch('Greenville, South Carolina.', { city: 'Greenville', state: 'SC' })).toBe(2)
    expect(geographicMatch('Greenville, North Carolina.', { city: 'Greenville', state: 'SC' })).toBe(0)
    expect(geographicMatch('Greenville, South Carolina.', { city: 'Green', state: 'SC' })).toBe(1)
    expect(geographicMatch('South Carolina', { city: '.*', state: 'SC' })).toBe(1)
  })
  test('orders city then state then other; retains preference ranking within a tier', () => {
    const rows = [
      { id: 'other', locationMatch: 0, score: 100 },
      { id: 'state-low', locationMatch: 1, score: 10 },
      { id: 'city', locationMatch: 2, score: 0 },
      { id: 'state-high', locationMatch: 1, score: 20 },
    ]
    expect(rows.sort(compareRecommendationRank).map(row => row.id))
      .toEqual(['city', 'state-high', 'state-low', 'other'])
    expect([{ locationMatch: 0, score: 2 }, { locationMatch: 0, score: 4 }]
      .sort(compareRecommendationRank).map(row => row.score)).toEqual([4, 2])
  })
})
