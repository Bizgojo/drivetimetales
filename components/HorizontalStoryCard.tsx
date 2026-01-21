// =============================================================================
// WL02_StoryCard.protected.tsx
// PROTECTED - DO NOT RECREATE
// COPY WITH: cat ~/DriveTimeFiles/WorkingCodeLibrary/00_SharedComponents/WL02_StoryCard.protected.tsx
// -----------------------------------------------------------------------------
// Updated: January 21, 2026
// Based on Home page card design
// Used by: Welcome, Library, Welcome-Library, Library-Playlist pages
//
// DESIGN:
// - Compact horizontal card
// - 60px cover with subtle glow on left
// - Title (white, bold), genre (dim), author (dim), duration (bright) on right
// - Optional FREE/NEW flag
// - Optional series indicator (Part X/Y)
// =============================================================================

import Link from 'next/link'

interface HorizontalStoryCardProps {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
  flag?: string | null
  credits?: number
  series_number?: number | null
  series_total?: number | null
  play_status?: string | null
}

export default function HorizontalStoryCard({
  id,
  title,
  author,
  genre,
  duration_mins,
  cover_url,
  flag = null,
  credits,
  series_number,
  series_total,
  play_status
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? Math.ceil(duration_mins / 15)

  return (
    <Link href={`/player/${id}`} style={{ textDecoration: 'none' }}>
      <div style={{ 
        cursor: 'pointer',
        backgroundColor: '#1e293b',
        padding: '0.625rem',
        borderRadius: '0.5rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center'
      }}>
        {/* Cover Image - 60px with subtle glow */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={cover_url || '/images/default-cover.png'}
            alt={title}
            style={{
              width: '60px',
              height: '60px',
              objectFit: 'cover',
              borderRadius: '0.375rem',
              boxShadow: '0 0 12px rgba(255, 255, 255, 0.25)'
            }}
          />
          {/* Progress bar for in-progress stories */}
          {(play_status === 'in_progress' || play_status === 'continue') && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderBottomLeftRadius: '0.375rem',
                borderBottomRightRadius: '0.375rem'
              }}
            >
              <div style={{ width: '50%', height: '100%', backgroundColor: '#f97316', borderBottomLeftRadius: '0.375rem' }} />
            </div>
          )}
        </div>

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title - white, bold */}
          <p style={{ 
            fontSize: '15px', 
            fontWeight: 600, 
            color: '#ffffff', 
            marginBottom: '0.125rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {title}
          </p>
          
          {/* Genre - dimmer */}
          <p style={{ 
            fontSize: '13px', 
            color: '#94a3b8', 
            marginBottom: '0.125rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>{genre}</span>
            {flag && (
              <span
                style={{
                  backgroundColor: flag === 'free' ? '#22c55e' : '#f97316',
                  color: 'white',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  textTransform: 'uppercase'
                }}
              >
                {flag}
              </span>
            )}
          </p>
          
          {/* Author - dimmer */}
          <p style={{ 
            fontSize: '13px', 
            color: '#94a3b8', 
            marginBottom: '0.125rem' 
          }}>
            by {author}
          </p>
          
          {/* Duration & Credits - brighter */}
          <p style={{ 
            fontSize: '13px', 
            color: '#e2e8f0',
            fontWeight: 500
          }}>
            {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
            {series_number && series_total && (
              <span style={{ color: '#94a3b8' }}> • Part {series_number}/{series_total}</span>
            )}
          </p>
        </div>
      </div>
    </Link>
  )
}
