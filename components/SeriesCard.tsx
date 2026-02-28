'use client'

import Link from 'next/link'

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
}


function PlayPill({ label }: { label: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    'Play':       { bg: 'rgba(249,115,22,0.88)',  text: 'white' },
    'Continue':   { bg: 'rgba(34,197,94,0.88)',   text: '#042013' },
    'Play Again': { bg: 'rgba(59,130,246,0.88)',  text: 'white' },
  }
  const c = colors[label] || colors['Play']
  return (
    <div style={{ position: 'absolute', bottom: '7px', right: '7px', background: c.bg, borderRadius: '20px', padding: '4px 9px 4px 7px', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
      <svg width="7" height="9" viewBox="0 0 12 14" fill={c.text}><path d="M1 1l10 6-10 6V1z"/></svg>
      <span style={{ color: c.text, fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
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
}: SeriesCardProps) {

  const avgDuration = episode_count > 0 ? Math.round(total_duration_mins / episode_count) : 0
  const progressPercent = episode_count > 0 ? Math.round((completed_episodes / episode_count) * 100) : 0
  const hasProgress = completed_episodes > 0

  return (
    <Link
      href={`/series/${id}`}
      style={{
        display: 'flex',
        background: '#1e293b',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.06)',
        textDecoration: 'none',
        alignItems: 'stretch',
        padding: 0,
      }}
    >
      <div style={{
        flexShrink: 0,
        padding: '10px 0 10px 10px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          width: '130px',
          height: '130px',
          borderRadius: '6px',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)',
          position: 'relative',
        }}>
          <img
            src={cover_url || '/images/default-cover.png'}
            alt={series_name}
            style={{ width: '130px', height: '130px', objectFit: 'cover', display: 'block' }}
          />
          <PlayPill label={completed_episodes >= episode_count && episode_count > 0 ? 'Play Again' : completed_episodes > 0 ? 'Continue' : 'Play'} />
        </div>
      </div>

      <div style={{
        flex: 1,
        padding: '10px 12px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
      }}>

        <div style={{ display: 'flex', gap: '5px', minHeight: '18px', alignItems: 'center' }}>
          <span style={{
            background: '#f59e0b',
            color: 'black',
            padding: '2px 7px',
            borderRadius: '3px',
            fontSize: '9px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}>
            Series
          </span>
        </div>

        <h3 style={{
          color: 'white',
          fontSize: '15px',
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {series_name}
        </h3>

        <div style={{ fontSize: '11px', lineHeight: 1.3 }}>
          <div style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {author || ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {genre}
            </span>
            <span style={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '6px' }}>
              {episode_count} ep · ~{avgDuration} min
            </span>
          </div>
        </div>

        {description && (
          <p style={{
            color: '#94a3b8',
            fontSize: '11px',
            lineHeight: 1.35,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {description}
          </p>
        )}

        {hasProgress && (
          <div style={{ marginTop: '4px' }}>
            <div style={{ height: '4px', backgroundColor: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPercent}%`,
                backgroundColor: progressPercent >= 100 ? '#22c55e' : '#f97316',
                borderRadius: '2px',
                transition: 'width 0.3s',
                minWidth: '4px',
              }} />
            </div>
            <p style={{ color: progressPercent >= 100 ? '#22c55e' : '#f97316', fontSize: '10px', margin: '2px 0 0', fontWeight: 600 }}>
              {completed_episodes} of {episode_count} completed
            </p>
          </div>
        )}

      </div>
    </Link>
  )
}
