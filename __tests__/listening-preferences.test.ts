import { cleanListeningPreferences, preferenceScore, avoidsStory } from '@/lib/listeningPreferences'
it('accepts only supported preferences and limits text', () => {
  expect(cleanListeningPreferences({ genres: ['Mystery', 'junk'], interests: 'x'.repeat(600), minutes: 77 })).toEqual({ genres: ['Mystery'], interests: 'x'.repeat(500), avoid: '', minutes: 0 })
})
it('boosts preferred genres, themes and episode length; recognizes Sci-Fi aliases', () => {
  const p = cleanListeningPreferences({ genres: ['Sci-Fi'], interests: 'space exploration, family secrets', minutes: 15 })
  expect(preferenceScore('An adventure in space exploration', 'Science Fiction', 14, p)).toBe(110)
  expect(preferenceScore('A quiet town', 'Mystery', 30, p)).toBe(0)
})
it('matches avoided topics without treating blank entries as exclusions', () => {
  expect(avoidsStory('A graphic horror story', cleanListeningPreferences({ avoid: 'horror, gore' }))).toBe(true)
  expect(avoidsStory('A graphic horror story', cleanListeningPreferences({ avoid: ', ,\n' }))).toBe(false)
})
