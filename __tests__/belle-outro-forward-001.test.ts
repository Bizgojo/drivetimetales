import { checkNonFinaleOutro, checkClosingOutroExtras, episodeNumberWords, sentences, nonFinaleOutroPrompt } from '../lib/belleOutroForward'

const ctx = { seriesName: 'Rerouted', nextEpisodeNumber: 4, author: 'Jack Malone', narrator: 'Evelyn Bales' }

describe('BELLE-OUTRO-FORWARD-001', () => {
  it('passes Marc\'s two-part shape (number in words or digits)', () => {
    expect(checkNonFinaleOutro('Daniel heard his own name on the tape, and so did the men outside. In Episode Four of "Rerouted," the voice finally says who killed Sarah.', ctx)).toEqual([])
    expect(checkNonFinaleOutro('Daniel heard his own name on the tape. In Episode 4 of "Rerouted," the voice says who killed Sarah.', ctx)).toEqual([])
  })
  it('fails the old style: reflection, vague "next episode", no number', () => {
    const issues = checkNonFinaleOutro('Twenty-two feet of dark between Daniel and whoever just parked beside him, and the dread hasn’t let go of me yet. You heard his name on that tape, and so did they. Stay with me, because in the next episode, The Name, someone finally says it out loud.', ctx)
    expect(issues.some(i => /exactly two sentences/.test(i))).toBe(true)
    expect(issues.some(i => /by number/.test(i))).toBe(true)
    expect(issues.some(i => /series "Rerouted"/.test(i))).toBe(true)
  })
  it('fails wrong episode number, recap that promotes, time of day, too long', () => {
    expect(checkNonFinaleOutro('Daniel ran. In Episode Five of "Rerouted," it gets worse.', ctx).join(' ')).toMatch(/Episode Four/)
    expect(checkNonFinaleOutro('Episode Three ended with Daniel running. In Episode Four of "Rerouted," it gets worse.', ctx).join(' ')).toMatch(/recap sentence/)
    expect(checkNonFinaleOutro('Tonight Daniel ran. In Episode Four of "Rerouted," it gets worse.', ctx).join(' ')).toMatch(/time of day/)
    const long = 'Daniel ' + 'ran and '.repeat(25) + 'stopped. In Episode Four of "Rerouted," it gets worse.'
    expect(checkNonFinaleOutro(long, ctx).join(' ')).toMatch(/too long/)
  })
  it('closing outros: time of day and 42 words', () => {
    expect(checkClosingOutroExtras('You\'ve been listening to "Rerouted" by Jack Malone, read by Evelyn Bales, an Endless Tales Original.')).toEqual([])
    expect(checkClosingOutroExtras('On this late drive, you\'ve been listening.').join(' ')).toMatch(/time of day/)
  })
  it('helpers', () => {
    expect(episodeNumberWords(4)).toBe('Four')
    expect(episodeNumberWords(23)).toBe('Twenty-Three')
    expect(sentences('He said "Run." Then he ran. In Episode Four of "X," more.')).toHaveLength(3)
    expect(nonFinaleOutroPrompt({ seriesName: 'Rerouted', nextEpisodeNumber: 4 })).toMatch(/Episode Four/)
  })
})
