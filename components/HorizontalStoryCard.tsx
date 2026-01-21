'use client'

import Link from 'next/link'

interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  credits?: number
  series_number?: number | null
  series_total?: number | null
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  cover_url,
  credits,
  series_number,
  series_total
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? getCredits(duration_mins)

  return (
    <Link 
      href={`/player/${id}`}
      className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
      style={{ display: 'flex' }}
    >
      <div style={{ width: '7rem', height: '7rem', flexShrink: 0, padding: '0.5rem' }}>
        <div 
          className="rounded-lg overflow-hidden cover-glow"
          style={{ width: '100%', height: '100%' }}
        >
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            className="object-cover"
            style={{ width: '100%', height: '100%' }}
          />
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
        <h3 className="text-sm font-bold text-white line-clamp-1">{title}</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{genre}</p>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>by {author}</p>
        <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600 }}>
          {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
          {series_number && series_total && (
            <span style={{ color: '#94a3b8', fontWeight: 400 }}> • Part {series_number}/{series_total}</span>
          )}
        </p>
      </div>
    </Link>
  )
}
