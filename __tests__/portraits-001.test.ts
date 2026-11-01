import { buildPortraitPrompt, genderFromBio, ageFromBirthYear, slugForPortrait } from '@/lib/portraitPrompt'

describe('PORTRAITS-001', () => {
  test('prompts describe an invented person and never name a real author', () => {
    const p = buildPortraitPrompt({ kind: 'author', name: 'Jesse Crane', gender: 'man', age: 'about 55 years old', genre: 'Western' })
    expect(p).toMatch(/invented man, about 55 years old, a fiction author who writes Western/)
    expect(p).toMatch(/do not resemble any real, famous, or historical individual/)
    expect(p).not.toMatch(/Elmore|Leonard|Jesse Crane/)
  })
  test('narrator prompts use gender, age and tone', () => {
    expect(buildPortraitPrompt({ kind: 'narrator', name: 'X', gender: 'female', age: '30s', tone: 'Warm' })).toMatch(/invented woman, 30s, an audiobook narrator.*warm presence/)
  })
  test('helpers', () => {
    expect(genderFromBio('His stories find absurdity in ordinary routines.')).toBe('man')
    expect(genderFromBio('Her stories favor female researchers.')).toBe('woman')
    expect(genderFromBio('Writes mystery.')).toBeNull()
    expect(ageFromBirthYear(1971, new Date('2026-11-01'))).toBe('about 55 years old')
    expect(ageFromBirthYear(null)).toBeNull()
    expect(slugForPortrait('J. Calloway Reid')).toBe('j-calloway-reid')
  })
})
