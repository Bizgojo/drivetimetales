/** Display and intent rules shared by the real player and its transport UI. */
export function formatPlaybackTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function shouldAutoStartPlayer(search: string): boolean {
  const params = new URLSearchParams(search)
  // A player visit is listening intent; reading, approval and onboarding are not.
  return params.get('autoplay') !== '0'
    && params.get('openReader') !== '1'
    && params.get('approvalReview') !== '1'
    && params.get('onboard') !== '1'
}

export interface PlayerGenreFields {
  genre?: unknown
  primary_genre?: unknown
  genre_secondary?: unknown
  genre_third?: unknown
  sub_genres?: unknown
}

export function getPlayerGenres(story: PlayerGenreFields | null | undefined): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  const add = (input: unknown) => {
    if (Array.isArray(input)) { input.forEach(add); return }
    if (typeof input !== 'string') return
    // Preserve compound genre names (e.g. Romantic Suspense); split explicit lists only.
    for (const part of input.split(/[,;|·]/)) {
      const label = part.trim()
      const key = label.toLocaleLowerCase('en-US')
      if (!label || seen.has(key)) continue
      seen.add(key)
      labels.push(label)
    }
  }
  add(story?.genre)
  add(story?.primary_genre)
  add(story?.genre_secondary)
  add(story?.genre_third)
  add(story?.sub_genres)
  return labels
}
