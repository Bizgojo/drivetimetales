import { getEpisodeLine } from '@/lib/playerControls'

describe('PLAYER-COMPACT-001 getEpisodeLine', () => {
  it('uses episode_title when present', () => {
    expect(getEpisodeLine({ episode_title: 'The Toast', series_episode_number: 1, title: 'The Toast' }, 'The Widow Who Watched'))
      .toBe('Episode 1 - The Toast')
  })
  it('strips "<series> — Episode N:" prefix from old titles', () => {
    expect(getEpisodeLine({ title: 'The Bell Beneath Falls Park — Episode 2: The Seventh Token', episode_number: 2 }, 'The Bell Beneath Falls Park'))
      .toBe('Episode 2 - The Seventh Token')
  })
  it('shows only the number when the title is just "Series — Episode N"', () => {
    expect(getEpisodeLine({ title: 'Letters to Nobody — Episode 2', episode_number: 2 }, 'Letters to Nobody')).toBe('Episode 2')
  })
  it('drops an episode title that only repeats the series title', () => {
    expect(getEpisodeLine({ title: 'Rerouted', series_episode_number: 1 }, 'Rerouted')).toBe('Episode 1')
  })
  it('prefers series_episode_number over episode_number', () => {
    expect(getEpisodeLine({ title: 'X', episode_number: 9, series_episode_number: 3 }, 'S')).toBe('Episode 3 - X')
  })
  it('returns null without an episode number', () => {
    expect(getEpisodeLine({ title: 'Standalone' }, '')).toBeNull()
  })
})
