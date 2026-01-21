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
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

const FLAG_STYLES: Record<string, { bg: string, text: string }> = {
  'free': { bg: '#22c55e', text: 'white' },
  'editors-pick': { bg: '#a855f7', text: 'white' },
  'readers-choice': { bg: '#3b82f6', text: 'white' },
  'trending': { bg: '#ec4899', text: 'white' },
}

const FLAG_LABELS: Record<string, string> = {
  'free': 'Free',
  'editors-pick': "Editor's Pick",
  'readers-choice': "Reader's Choice",
  'trending': 'Trending',
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
  series_total,
  flag
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
          {flag && FLAG_STYLES[flag] && (
            <span style={{ 
              marginLeft: '0.5rem',
              backgroundColor: FLAG_STYLES[flag].bg,
              color: FLAG_STYLES[flag].text,
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              {FLAG_LABELS[flag]}
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}
