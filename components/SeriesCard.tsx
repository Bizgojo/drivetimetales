'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { storeSeriesPlayback } from '@/lib/seriesPlayback'

const PLAYLIST_KEY = 'et_current_playlist'

interface SeriesCardProps {
  id: string
  series_name: string
  genre: string
  author?: string | null
  episode_count: number
  total_duration_mins: number
  cover_url: string | null
  description?: string | null
  completed_episodes?: number
  not_for_me?: boolean
  first_episode_id?: string
  episodes?: Array<{ id: string; episode_number: number }>
  play_episode_id?: string | null
  resume_seconds?: number
  is_in_progress?: boolean
}

export default function SeriesCard({
  id,
  series_name,
  genre,
  author,
  episode_count,
  total_duration_mins,
  cover_url,
  description,
  completed_episodes = 0,
  not_for_me = false,
  first_episode_id,
  episodes = [],
  play_episode_id,
  resume_seconds = 0,
  is_in_progress = false,
}: SeriesCardProps) {
  const router = useRouter()
  const [inPlaylist, setInPlaylist] = useState(false)
  const avgDuration = episode_count > 0 ? Math.round(total_duration_mins / episode_count) : 0
  const progressPercent = episode_count > 0 ? Math.round((completed_episodes / episode_count) * 100) : 0
  const hasProgress = completed_episodes > 0
  const cardKey = `series-${id}`
  const playLabel = is_in_progress ? '▶ Continue' : '▶ Play now'
  const firstEpisodeId = first_episode_id || episodes[0]?.id || null
  const playEpisodeId = play_episode_id || firstEpisodeId

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]')
      setInPlaylist(Array.isArray(stored) && stored.includes(cardKey))
    } catch {
      setInPlaylist(false)
    }
  }, [cardKey])

  const handleCardClick = () => {
    router.push(`/series/${id}`)
  }

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!playEpisodeId) {
      router.push(`/series/${id}`)
      return
    }

    try {
      storeSeriesPlayback({
        episodeId: playEpisodeId,
        resumeSeconds: resume_seconds || 0,
        isInProgress: !!is_in_progress,
        playlist: episodes,
      })
    } catch {}

    router.push(`/player/${playEpisodeId}${resume_seconds && resume_seconds > 0 ? `?resume=${resume_seconds}` : ''}`)
  }

  const handleSeriesClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/series/${id}`)
  }

  const handlePlaylistClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]')
      const current = Array.isArray(stored) ? stored : []
      const next = current.includes(cardKey)
        ? current.filter((key: string) => key !== cardKey)
        : [...current, cardKey]
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(next))
      setInPlaylist(next.includes(cardKey))
    } catch {
      setInPlaylist((current) => !current)
    }
  }

  return (
    <div
      style={{
        background: '#2b313d',
        borderRadius: '12px',
        padding: '10px',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        <div
          onClick={handleCardClick}
          style={{
            width: '108px',
            minHeight: '126px',
            borderRadius: '8px',
            backgroundColor: '#1e1b4b',
            backgroundImage: cover_url ? `url(${cover_url})` : 'url(/images/default-cover.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 0 12px rgba(255,255,255,0.2)',
            alignSelf: 'stretch',
            cursor: 'pointer',
          }}
          aria-label={`Open ${series_name} episodes`}
        />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            onClick={handleSeriesClick}
            style={{
              background: '#a855f7',
              color: 'white',
              fontSize: '10px',
              padding: '2px 7px',
              borderRadius: '8px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              lineHeight: 1,
              minHeight: 0,
              fontFamily: 'inherit',
            }}
          >
            Series · {episode_count} eps
          </button>
          {not_for_me && (
            <span style={{ fontSize: '13px', background: '#111', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>👎</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 500 }}>~{avgDuration}min</span>
        </div>

        <div
          onClick={handleCardClick}
          style={{ color: 'white', fontSize: '14px', fontWeight: 700, lineHeight: 1.2, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {series_name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
          <span style={{ color: '#4ade80', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{author || 'Unknown'}</span>
          {genre && <span style={{ color: '#4ade80', whiteSpace: 'nowrap' }}>· {genre}</span>}
        </div>

        {description && (
          <div style={{ color: 'white', fontSize: '11px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {description.length > 70 ? `${description.slice(0, 67)}…` : description}
          </div>
        )}

        <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
          {inPlaylist ? (
            <button
              type="button"
              onClick={handlePlaylistClick}
              style={{
                flex: 1,
                background: 'transparent',
                color: '#93c5fd',
                border: '0.5px solid #3b82f6',
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '10px',
                lineHeight: 1,
                minHeight: '20px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ✓ In your playlist · Remove
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePlayClick}
                style={{
                  flex: 1,
                  background: is_in_progress ? '#16a34a' : '#f97316',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  lineHeight: 1,
                  minHeight: '20px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {playLabel}
              </button>
              <button
                type="button"
                onClick={handlePlaylistClick}
                style={{
                  flex: 1,
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  lineHeight: 1,
                  minHeight: '20px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                + Playlist
              </button>
            </>
          )}
        </div>

        <div
          style={{
            height: '3px',
            background: 'rgba(148,163,184,0.15)',
            borderRadius: '2px',
            marginTop: '2px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {hasProgress && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${Math.min(100, progressPercent)}%`,
                background: progressPercent >= 100 ? '#16a34a' : '#f97316',
                borderRadius: '2px',
              }}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
