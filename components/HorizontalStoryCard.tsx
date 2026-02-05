'use client'

import Link from 'next/link'

// Flag configuration with colors and priority
const FLAG_CONFIG: Record<string, { bg: string; text: string; priority: number }> = {
  'continue': { bg: '#3b82f6', text: 'white', priority: 1 },
  'reserved': { bg: '#eab308', text: 'black', priority: 2 },
  'owned': { bg: '#f97316', text: 'white', priority: 3 },
  'series': { bg: '#dc2626', text: 'white', priority: 4 },
  'trending': { bg: '#14b8a6', text: 'white', priority: 5 },
  'new': { bg: '#ea580c', text: 'white', priority: 6 },
  'free': { bg: '#22c55e', text: 'white', priority: 7 },
  'editors-pick': { bg: '#9333ea', text: 'white', priority: 8 },
  'listeners-pick': { bg: '#9333ea', text: 'white', priority: 9 },
}

// Flag labels (series label is dynamic)
const FLAG_LABELS: Record<string, string> = {
  'continue': 'Continue',
  'reserved': 'Reserved',
  'owned': 'Owned',
  'trending': 'Trending',
  'new': 'NEW',
  'free': 'FREE',
  'editors-pick': "Editor's Pick",
  'listeners-pick': "Listener's Pick",
}

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
  // New: array of flags (max 3 will be displayed)
  flags?: string[]
  // OLD: single flag for backward compatibility
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// Sort flags by priority and return top 3
function getDisplayFlags(flags: string[]): string[] {
  if (!flags || flags.length === 0) return []
  
  const sorted = [...flags].sort((a, b) => {
    const priorityA = FLAG_CONFIG[a]?.priority ?? 99
    const priorityB = FLAG_CONFIG[b]?.priority ?? 99
    return priorityA - priorityB
  })
  
  return sorted.slice(0, 3)
}

// Flag badge component
function FlagBadge({ flag, seriesNumber }: { flag: string; seriesNumber?: number | null }) {
  const config = FLAG_CONFIG[flag]
  if (!config) return null
  
  // Dynamic label for series flag
  const label = flag === 'series' 
    ? `Series #${seriesNumber || '?'}` 
    : FLAG_LABELS[flag] || flag
  
  return (
    <span style={{
      background: config.bg,
      color: config.text,
      padding: '2px 7px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
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
  flags = [],
  flag, // OLD prop for backward compatibility
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? getCredits(duration_mins)
  
  // Handle backward compatibility: if old flag prop is passed, convert to array
  let finalFlags = flags
  if ((!flags || flags.length === 0) && flag) {
    const flagMap: Record<string, string> = {
      'free': 'free',
      'editors-pick': 'editors-pick',
      'readers-choice': 'listeners-pick',
      'trending': 'trending',
    }
    const mappedFlag = flagMap[flag]
    if (mappedFlag) {
      finalFlags = [mappedFlag]
    }
  }
  
  const displayFlags = getDisplayFlags(finalFlags)

  return (
    <Link 
      href={`/player/${id}`}
      style={{
        display: 'flex',
        background: '#1e293b',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.06)',
        textDecoration: 'none',
      }}
    >
      {/* Cover image - 7rem square with shadow */}
      <div style={{ width: '7rem', flexShrink: 0, padding: '0.5rem' }}>
        <div 
          className="cover-glow"
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
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
        {/* Top: Title + meta */}
        <div>
          <h3 style={{
            color: 'white',
            fontSize: '15px',
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {title}
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
            {genre} • by {author}
          </p>
        </div>
        
        {/* Bottom: Duration/credits + flags */}
        <div>
          <div style={{ marginTop: '6px' }}>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
              {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
            </span>
          </div>
          {displayFlags.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
              {displayFlags.map(f => (
                <FlagBadge key={f} flag={f} seriesNumber={series_number} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
