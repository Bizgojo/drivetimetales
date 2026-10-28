import { speakerMatchesCharacter } from '../scripts/recast-series-character'

describe('RECAST-SERIES-001 speaker matching', () => {
  test('full name, first name, and case/spacing variants match', () => {
    expect(speakerMatchesCharacter('FELIX COBB', 'FELIX COBB')).toBe(true)
    expect(speakerMatchesCharacter('Felix', 'FELIX COBB')).toBe(true)
    expect(speakerMatchesCharacter(' felix  cobb ', 'FELIX COBB')).toBe(true)
  })
  test('other characters and narrator do not match', () => {
    expect(speakerMatchesCharacter('NARRATOR', 'FELIX COBB')).toBe(false)
    expect(speakerMatchesCharacter('REUBEN VERNON', 'FELIX COBB')).toBe(false)
    expect(speakerMatchesCharacter('FELIXA', 'FELIX COBB')).toBe(false)
    expect(speakerMatchesCharacter('', 'FELIX COBB')).toBe(false)
  })
})
