'use client'

import Link from 'next/link'

interface SeriesEpisodeCardProps {
  id: string
  episode_number: number
  title: string
  description?: string | null
  duration_mins: number
  cover_url: string | null
  progress_percent?: number
  is_completed?: boolean
}

export default function SeriesEpisodeCard({
  id,
  episode_number,
  title,
  description,
  duration_mins,
  cover_url,
  progress_percent = 0,
  is_completed = false
}: SeriesEpisodeCardProps) {
  
  const shortDescription = description 
    ? description.split(' ').slice(0, 15).join(' ') + (description.split(' ').length > 15 ? '...' : '')
    : null

  return (
    <Link 
      href={`/player/${id}`}
      className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
      style={{ display: 'flex' }}
    >
      <div style={{ width: '7rem', height: '7rem', flexShrink: 0, padding: '0.5rem' }}>
        <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            className="object-cover"
            style={{ width: '100%', height: '100%' }}
          />
          <div style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            backgroundColor: is_completed ? '#22c55e' : '#f97316',
            color: is_completed ? 'white' : 'black',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700
          }}>
            {is_completed ? '✓' : episode_number}
          </div>
          
          {progress_percent > 0 && !is_completed && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '4px',
              backgroundColor: 'rgba(0,0,0,0.5)'
            }}>
              <div style={{
                height: '100%',
                width: `${progress_percent}%`,
                backgroundColor: '#f97316'
              }} />
            </div>
          )}
        </div>
      </div>
      
      <div style={{ 
        flex: 1, 
        paddingTop: '0.5rem', 
        paddingBottom: '0.5rem', 
        paddingRight: '0.75rem', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center' 
      }}>
        <h3 className="text-sm font-bold text-white line-clamp-1">
          Ep {episode_number}: {title}
        </h3>
        {shortDescription && (
          <p style={{ color: '#e2e8f0', fontSize: '0.7rem', lineHeight: 1.3, marginTop: '2px' }} className="line-clamp-2">
            {shortDescription}
          </p>
        )}
        <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>
          {duration_mins} min
        </p>
      </div>
    </Link>
  )
}
