import { formatPlaybackTime, getPlayerGenres, shouldAutoStartPlayer } from '../lib/playerControls'

describe('player listening intent', () => {
  test.each(['', '?autoplay=1&playNow=1', '?resume=120', '?playlist=1'])('attempts listening on %s', search => {
    expect(shouldAutoStartPlayer(search)).toBe(true)
  })
  test.each(['?openReader=1', '?approvalReview=1&autoplay=1', '?onboard=1&playNow=1', '?autoplay=0'])('preserves non-listening intent on %s', search => {
    expect(shouldAutoStartPlayer(search)).toBe(false)
  })
})

describe('player metadata display', () => {
  test('shows all stored genres, once, without decomposing compound names', () => {
    expect(getPlayerGenres({ genre:'Romance', primary_genre:' romance ', genre_secondary:'Western', genre_third:'Historical', sub_genres:['Western','Romantic Suspense'] }))
      .toEqual(['Romance','Western','Historical','Romantic Suspense'])
  })
  test('handles explicit genre lists and ignores non-text metadata', () => {
    expect(getPlayerGenres({ genre:'Romance, Western | Historical', sub_genres:[null,5,'Western'] })).toEqual(['Romance','Western','Historical'])
    expect(getPlayerGenres(null)).toEqual([])
  })
  test.each([[0,'0:00'],[666,'11:06'],[951.9,'15:51'],[3600,'60:00'],[-2,'0:00'],[NaN,'0:00']])('formats %s seconds as %s', (seconds, label) => {
    expect(formatPlaybackTime(seconds as number)).toBe(label)
  })
})


import { waitForSegmentResume } from '../lib/playerControls'
describe('saved-position playback readiness', () => {
  it('holds segmented autoplay until the entire seek map is available', () => {
    expect(waitForSegmentResume(true, 107, false)).toBe(true)
    expect(waitForSegmentResume(true, 107, true)).toBe(false)
  })
  it('does not delay a fresh start or a single-file seek', () => {
    expect(waitForSegmentResume(true, 0, false)).toBe(false)
    expect(waitForSegmentResume(false, 107, false)).toBe(false)
  })
})

import { isActiveLibraryCard } from '../lib/playerControls'
describe('active card visibility', () => {
  it('hides only the active single story, including when paused', () => {
    expect(isActiveLibraryCard({story:{id:'active'}}, 'active')).toBe(true)
    expect(isActiveLibraryCard({story:{id:'other'}}, 'active')).toBe(false)
    expect(isActiveLibraryCard({story:{id:'active'}}, null)).toBe(false)
  })
  it('matches a grouped series through its actual episode IDs only', () => {
    expect(isActiveLibraryCard({episodePlaylist:[{id:'active'}]}, 'active')).toBe(true)
    expect(isActiveLibraryCard({episodePlaylist:[{id:'other'}]}, 'active')).toBe(false)
  })
})
