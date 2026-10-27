export const LISTENING_GENRES = ['Adventure', 'Comedy', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'True Crime', 'Western']
export type ListeningPreferences = { genres: string[]; interests: string; avoid: string; minutes: number }
export function cleanListeningPreferences(value: any): ListeningPreferences {
  return { genres: Array.isArray(value?.genres) ? LISTENING_GENRES.filter(g => value.genres.includes(g)) : [],
    interests: typeof value?.interests === 'string' ? value.interests.trim().slice(0, 500) : '',
    avoid: typeof value?.avoid === 'string' ? value.avoid.trim().slice(0, 500) : '',
    minutes: [0, 15, 30, 60].includes(Number(value?.minutes)) ? Number(value.minutes) : 0 }
}
function matches(text: string, terms: string) {
  return terms.toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 1).some(term => text.includes(term))
}
export function preferenceScore(text: string, genre: string, minutes: number, prefs: ListeningPreferences): number {
  const normalized = text.toLowerCase()
  const canonicalGenre = /science fiction|sci.fi/i.test(genre) ? 'Sci-Fi' : genre
  return (prefs.genres.includes(canonicalGenre) ? 60 : 0) + (matches(normalized, prefs.interests) ? 30 : 0)
    + (prefs.minutes && Math.abs(minutes - prefs.minutes) <= 5 ? 20 : 0)
}
export function avoidsStory(text: string, prefs: ListeningPreferences) { return matches(text.toLowerCase(), prefs.avoid) }
