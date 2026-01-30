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
      padding: '2px 8px',
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
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? getCredits(duration_mins)
  const displayFlags = getDisplayFlags(flags)
  
  // Assign flags to rows (row 2, 3, 4)
  const flag1 = displayFlags[0] || null
  const flag2 = displayFlags[1] || null
  const flag3 = displayFlags[2] || null

  return (
    <Link 
      href={`/player/${id}`}
      className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
      style={{ display: 'flex' }}
    >
      {/* Cover image */}
      <div style={{ width: '5rem', height: '5rem', flexShrink: 0, padding: '0.5rem' }}>
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
      
      {/* Content */}
      <div style={{ 
        flex: 1, 
        paddingTop: '0.5rem', 
        paddingBottom: '0.5rem', 
        paddingRight: '0.75rem', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center',
        minWidth: 0,
      }}>
        {/* Row 1: Title (full width) */}
        <h3 
          className="text-sm font-bold text-white"
          style={{
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h3>
        
        {/* Row 2: Genre + Flag 1 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '2px',
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>
            {genre}
          </p>
          {flag1 && <FlagBadge flag={flag1} seriesNumber={series_number} />}
        </div>
        
        {/* Row 3: Author + Flag 2 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '2px',
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>
            by {author}
          </p>
          {flag2 && <FlagBadge flag={flag2} seriesNumber={series_number} />}
        </div>
        
        {/* Row 4: Duration/Credits + Flag 3 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '2px',
        }}>
          <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600, margin: 0 }}>
            {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
          </p>
          {flag3 && <FlagBadge flag={flag3} seriesNumber={series_number} />}
        </div>
      </div>
    </Link>
  )
}
