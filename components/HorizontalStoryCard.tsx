/*
================================================================================
WL02_StoryCard.protected.tsx (HorizontalStoryCard)
PROTECTED - DO NOT RECREATE - COPY WITH: cat ~/DriveTimeFiles/WorkingCodeLibrary/00_SharedComponents/WL02_StoryCard.protected.tsx
Created: January 20, 2026
PURPOSE:
Compact horizontal story card for library pages with:
- 70px cover on left with white glow
- All white text on dark background
- Title (bold), Genre, Author, Duration • Credits
- FREE flag flush right
- Star rating below
================================================================================
*/
'use client'

import { useMemo } from 'react'

interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  credits: number
  cover_url: string | null
  series_number?: number | null
  series_total?: number | null
  play_status?: string
  flag?: string | null
}

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  credits,
  cover_url,
  series_number,
  series_total,
  play_status,
  flag
}: HorizontalStoryCardProps) {
  
  const { rating, reviewCount } = useMemo(() => {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i)
      hash = hash & hash
    }
    const r = 4.0 + (Math.abs(hash % 100) / 100)
    const reviews = 20 + Math.abs(hash % 80)
    return { rating: Math.round(r * 10) / 10, reviewCount: reviews }
  }, [id])

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalf = rating % 1 >= 0.3
    const stars = []
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<span key={i} style={{ color: '#fbbf24' }}>★</span>)
      } else if (i === fullStars && hasHalf) {
        stars.push(<span key={i} style={{ color: '#fbbf24' }}>★</span>)
      } else {
        stars.push(<span key={i} style={{ color: '#475569' }}>★</span>)
      }
    }
    return stars
  }

  const showFreeFlag = flag === 'free' || flag === undefined

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '8px',
      padding: '0.5rem',
      display: 'flex',
      gap: '0.6rem',
      alignItems: 'center'
    }}>
      {/* Cover - 70px with white glow */}
      <div style={{
        width: '70px',
        height: '70px',
        borderRadius: '6px',
        overflow: 'hidden',
        flexShrink: 0,
        backgroundColor: '#334155',
        boxShadow: '0 0 12px rgba(255, 255, 255, 0.3)'
      }}>
        {cover_url ? (
          <img src={cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>
        )}
      </div>

      {/* Content - compact, all white text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div style={{ color: 'white', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
          {title}
          {series_number && series_total && <span style={{ color: '#3b82f6', fontSize: '11px', marginLeft: '4px' }}>[{series_number}/{series_total}]</span>}
        </div>

        {/* Genre */}
        <div style={{ color: 'white', fontSize: '12px', lineHeight: 1.3 }}>{genre}</div>

        {/* Author */}
        <div style={{ color: 'white', fontSize: '12px', lineHeight: 1.3 }}>by {author}</div>

        {/* Duration + Credits + FREE flush right */}
        <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1.3 }}>
          <span style={{ color: 'white', fontSize: '12px' }}>{duration_mins} min • {credits} {credits === 1 ? 'credit' : 'credits'}</span>
          {showFreeFlag && (
            <span style={{ backgroundColor: '#22c55e', color: 'white', fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', marginLeft: 'auto' }}>FREE</span>
          )}
        </div>

        {/* Star Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
          <span style={{ color: 'white', fontSize: '10px' }}>{rating}/5</span>
          <span style={{ fontSize: '10px', letterSpacing: '-1px' }}>{renderStars(rating)}</span>
          <span style={{ color: 'white', fontSize: '10px' }}>{reviewCount}</span>
        </div>
      </div>
    </div>
  )
}
