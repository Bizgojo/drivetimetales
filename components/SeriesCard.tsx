'use client'

import Link from 'next/link'

interface SeriesCardProps {
  id: string
  series_name: string
  genre: string
  episode_count: number
  total_duration_mins: number
  cover_url: string | null
  description?: string | null
  completed_episodes?: number
}

export default function SeriesCard({
  id,
  series_name,
  genre,
  episode_count,
  total_duration_mins,
  cover_url,
  description,
  completed_episodes = 0,
}: SeriesCardProps) {
  
  const avgDuration = episode_count > 0 ? Math.round(total_duration_mins / episode_count) : 0
  const progressPercent = episode_count > 0 ? Math.round((completed_episodes / episode_count) * 100) : 0
  const hasProgress = completed_episodes > 0

  const shortDesc = description 
    ? (description.length > 80 ? description.slice(0, 77) + '...' : description)
    : null

  return (
    <Link 
      href={`/series/${id}`}
      style={{
        display: 'flex',
        background: '#1e293b',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        textDecoration: 'none',
      }}
    >
      {/* Cover image */}
      <div style={{ width: '7rem', flexShrink: 0, padding: '0.5rem' }}>
        <div style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          position: 'relative',
        }}>
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={series_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            SERIES
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div style={{ 
        flex: 1, 
        padding: '0.5rem 0.75rem 0.5rem 0.25rem', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between',
        minWidth: 0,
      }}>
        <div>
          <h3 style={{
            color: 'white',
            fontSize: '15px',
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {series_name}
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>
            {genre}
          </p>
          {shortDesc && (
            <p style={{ 
              color: '#cbd5e1', 
              fontSize: '11px', 
              margin: '4px 0 0',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {shortDesc}
            </p>
          )}
        </div>
        
        <div>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
            {episode_count} episode{episode_count !== 1 ? 's' : ''} • ~{avgDuration} min avg
          </span>
          
          {hasProgress && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ 
                height: '4px', 
                backgroundColor: '#334155', 
                borderRadius: '2px', 
                overflow: 'hidden',
              }}>
                <div style={{ 
                  height: '100%', 
                  width: `${progressPercent}%`, 
                  backgroundColor: progressPercent >= 100 ? '#22c55e' : '#f97316', 
                  borderRadius: '2px',
                  transition: 'width 0.3s',
                  minWidth: '4px',
                }} />
              </div>
              <p style={{ 
                color: progressPercent >= 100 ? '#22c55e' : '#f97316', 
                fontSize: '10px', 
                margin: '2px 0 0',
                fontWeight: 600,
              }}>
                {completed_episodes} of {episode_count} completed
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
