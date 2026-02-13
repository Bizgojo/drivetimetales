'use client'

import Link from 'next/link'

interface SeriesCardProps {
  id: string
  series_name: string
  genre: string
  author: string
  episode_count: number
  total_duration_mins: number
  cover_url: string | null
}

export default function SeriesCard({
  id,
  series_name,
  genre,
  author,
  episode_count,
  total_duration_mins,
  cover_url
}: SeriesCardProps) {
  
  const hours = Math.floor(total_duration_mins / 60)
  const mins = total_duration_mins % 60
  const durationText = hours > 0 ? `${hours}h ${mins}m total` : `${mins}m total`

  return (
    <Link 
      href={`/series/${id}`}
      className="rounded-xl overflow-hidden hover:bg-slate-700 transition block" style={{ background: "#1e293b", border: "1px solid rgba(255, 255, 255, 0.18)" }}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ width: '7rem', height: '7rem', flexShrink: 0, padding: '0.5rem' }}>
          <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%', position: 'relative' }}>
            <img 
              src={cover_url || '/images/default-cover.png'} 
              alt={series_name}
              className="object-cover"
              style={{ width: '100%', height: '100%' }}
            />
            <div style={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              backgroundColor: '#7c3aed',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              Series
            </div>
          </div>
        </div>
        
        <div style={{ 
          flex: 1, 
          paddingTop: '0.5rem', 
          paddingBottom: '0.5rem', 
          paddingRight: '0.75rem', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between' 
        }}>
          <h3 className="text-sm font-bold text-white line-clamp-1">{series_name}</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{genre}</p>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>by {author}</p>
          <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600 }}>
            {episode_count} episode{episode_count !== 1 ? 's' : ''} • {durationText}
          </p>
        </div>
      </div>
    </Link>
  )
}
