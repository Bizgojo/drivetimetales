export type SeriesEpisodeRef = {
  id: string
  episode_number?: number | null
}

export type SeriesProgressRef = {
  story_id: string
  progress?: number | null
  completed?: boolean | null
}

export type SeriesPlaybackTarget = {
  episodeId: string | null
  resumeSeconds: number
  isInProgress: boolean
  playlist: Array<{ id: string; episode_number: number }>
}

export function buildSeriesPlaybackTarget(
  episodes: SeriesEpisodeRef[],
  progressRows: SeriesProgressRef[] = []
): SeriesPlaybackTarget {
  const playlist = episodes
    .filter((episode) => episode.id)
    .slice()
    .sort((a, b) => {
      const aNumber = Number(a.episode_number || 0)
      const bNumber = Number(b.episode_number || 0)
      if (aNumber > 0 && bNumber > 0) return aNumber - bNumber
      if (aNumber > 0) return -1
      if (bNumber > 0) return 1
      return 0
    })
    .map((episode, index) => ({
      id: episode.id,
      episode_number: episode.episode_number || index + 1,
    }))

  const progressByStoryId = new Map(progressRows.map((row) => [row.story_id, row]))

  // Prefer an actively in-progress episode (has real progress, not yet completed)
  const inProgressEpisode = playlist.find((episode) => {
    const progress = progressByStoryId.get(episode.id)
    return progress && !progress.completed && (progress.progress || 0) > 0
  })

  // If no in-progress episode, find the first episode that hasn't been completed yet.
  // This correctly advances past completed episodes (EP1 done → target EP2) and
  // handles pre-created rows (progress=0, completed=false) from auto-advance.
  const firstUncompletedEpisode = inProgressEpisode
    ? null
    : playlist.find((episode) => {
        const progress = progressByStoryId.get(episode.id)
        // No row → never started → uncompleted.
        // Row exists but completed=false → uncompleted (even at progress=0).
        return !progress?.completed
      })

  // Fallback: all episodes completed → restart from EP1 (re-listen mode)
  const playEpisode = inProgressEpisode || firstUncompletedEpisode || playlist[0]
  const playProgress = playEpisode ? progressByStoryId.get(playEpisode.id) : null

  return {
    episodeId: playEpisode?.id || null,
    resumeSeconds:
      playProgress && !playProgress.completed && (playProgress.progress || 0) > 15
        ? Math.max(0, (playProgress.progress || 0))
        : 0,
    isInProgress: !!inProgressEpisode,
    playlist,
  }
}

export function storeSeriesPlayback(target: SeriesPlaybackTarget) {
  if (!target.episodeId) return
  const startIndex = Math.max(0, target.playlist.findIndex((episode) => episode.id === target.episodeId))
  localStorage.setItem('dtt_series_playlist', JSON.stringify(target.playlist.slice(startIndex)))
  localStorage.setItem('dtt_series_index', '0')
}
