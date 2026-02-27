'use client'

import Link from 'next/link'

// Flag configuration with colors and priority
const FLAG_CONFIG: Record<string, { bg: string; text: string; priority: number }> = {
  'continue':       { bg: '#22c55e', text: 'black',  priority: 1 },
  'reserved':       { bg: '#eab308', text: 'black',  priority: 2 },
  'owned':          { bg: '#f97316', text: 'white',  priority: 3 },
  'series':         { bg: '#f59e0b', text: 'black',  priority: 4 },
  'trending':       { bg: '#14b8a6', text: 'white',  priority: 5 },
  'new':            { bg: '#3b82f6', text: 'white',  priority: 6 },
  'free':           { bg: '#9333ea', text: 'white',  priority: 7 },
  'editors-pick':   { bg: '#9333ea', text: 'white',  priority: 8 },
  'listeners-pick': { bg: '#9333ea', text: 'white',  priority: 9 },
}

const FLAG_LABELS: Record<string, string> = {
  'continue':       'Continue',
  'reserved':       'Reserved',
  'owned':          'Owned',
  'trending':       'Trending',
  'new':            'NEW',
  'free':           'FREE',
  'editors-pick':   "Editor's Pick",
  'listeners-pick': "Listener's Pick",
}

interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  description?: string | null
  credits?: number
  series_number?: number | null
  series_total?: number | null
  flags?: string[]
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
  progress_percent?: number
}

function getDisplayFlags(flags: string[]): string[] {
  if (!flags || flags.length === 0) return []
  return [...flags]
    .sort((a, b) => (FLAG_CONFIG[a]?.priority ?? 99) - (FLAG_CONFIG[b]?.priority ?? 99))
    .slice(0, 3)
}

function FlagBadge({ flag, seriesNumber }: { flag: string; seriesNumber?: number | null }) {
  const config = FLAG_CONFIG[flag]
  if (!config) return null
  const label = flag === 'series'
    ? (seriesNumber ? `Series #${seriesNumber}` : 'Series')
    : FLAG_LABELS[flag] || flag

  return (
    <span style={{
      background: config.bg,
      color: config.text,
      padding: '2px 7px',
      borderRadius: '3px',
      fontSize: '9px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      lineHeight: 1,
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
  description,
  credits,
  series_number,
  series_total,
  flags = [],
  flag,
  progress_percent,
}: HorizontalStoryCardProps) {

  // Backward compatibility: convert old single flag to array
  let finalFlags = flags
  if ((!flags || flags.length === 0) && flag) {
    const flagMap: Record<string, string> = {
      'free': 'free',
      'editors-pick': 'editors-pick',
      'readers-choice': 'listeners-pick',
      'trending': 'trending',
    }
    const mappedFlag = flagMap[flag]
    if (mappedFlag) finalFlags = [mappedFlag]
  }

  const displayFlags = getDisplayFlags(finalFlags)

  const durationLabel = duration_mins
    ? `${duration_mins} min`
    : series_total
    ? `~${series_total} min avg`
    : null

  return (
    <Link
      href={`/player/${id}`}
      style={{
        display: 'flex',
        background: '#1e293b',
        borderRadius: '14px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.06)',
        textDecoration: 'none',
        alignItems: 'stretch',
        padding: 0,
        minHeight: '150px',
      }}
    >
      {/* Cover image — 130px with white glow, 14px card-colour border on 3 sides */}
      <div style={{
        flexShrink: 0,
        border: '10px solid #1e293b',
        borderRight: 'none',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          width: '182px',
          height: '182px',
          borderRadius: '6px',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)',
        }}>
          <img
            src={cover_url || '/images/default-cover.png'}
            alt={title}
            style={{
              width: '182px',
              height: '182px',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      </div>

      {/* Text panel */}
      <div style={{
        flex: 1,
        padding: '10px 12px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
      }}>

        {/* Row 1 — Flags (always present, empty if none) */}
        <div style={{
          display: 'flex',
          gap: '5px',
          flexWrap: 'wrap',
          minHeight: '18px',
          alignItems: 'center',
        }}>
          {displayFlags.map(f => (
            <FlagBadge key={f} flag={f} seriesNumber={series_number} />
          ))}
        </div>

        {/* Row 2 — Title, condensed, 2-line max */}
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
          {title}
        </h3>

        {/* Row 3 — Two-line meta: author / genre + duration */}
        <div style={{ fontSize: '11px', lineHeight: 1.3 }}>
          {/* Line 1: Author */}
          <div style={{
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {author}
          </div>
          {/* Line 2: Genre left, Duration right */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {genre}
            </span>
            {durationLabel && (
              <span style={{
                color: 'white',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                marginLeft: '6px',
              }}>
                {durationLabel}
              </span>
            )}
          </div>
        </div>

        {/* Row 4 — Description, 3-line max */}
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

      </div>

      {/* Progress bar */}
      {progress_percent !== undefined && progress_percent > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '4px',
          backgroundColor: '#334155',
          borderRadius: '0 0 14px 14px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(progress_percent, 100)}%`,
            backgroundColor: progress_percent >= 100 ? '#22c55e' : '#f97316',
            borderRadius: '0 0 14px 14px',
            transition: 'width 0.3s',
          }} />
        </div>
      )}
    </Link>
  )
}
