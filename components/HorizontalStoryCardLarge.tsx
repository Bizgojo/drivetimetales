'use client'

import Link from 'next/link'

const FLAG_CONFIG: Record<string, { bg: string; text: string; priority: number }> = {
  'not-for-me':     { bg: '#ef4444', text: 'white',  priority: 0 },
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
  'continue': 'Continue', 'reserved': 'Reserved', 'owned': 'Owned',
  'trending': 'Trending', 'new': 'NEW', 'free': 'FREE',
  'editors-pick': "Editor's Pick", 'listeners-pick': "Listener's Pick",
  'not-for-me': '👎 Not For Me',
}

// Play pill colors: Play=orange, Continue=green, Play Again=blue
const PLAY_PILL_COLORS: Record<string, string> = {
  'Play':       'rgba(249,115,22,0.88)',
  'Continue':   'rgba(34,197,94,0.88)',
  'Play Again': 'rgba(59,130,246,0.88)',
}

interface HorizontalStoryCardProps {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  description?: string | null; credits?: number
  series_number?: number | null; series_total?: number | null
  flags?: string[]; flag?: string | null
  progress_percent?: number
  avg_rating?: number | null; review_count?: number
  is_completed?: boolean; has_reviewed?: boolean
  not_for_me?: boolean
  onReviewClick?: (e: React.MouseEvent) => void
}

function getDisplayFlags(flags: string[]): string[] {
  if (!flags || flags.length === 0) return []
  return [...flags].sort((a, b) => (FLAG_CONFIG[a]?.priority ?? 99) - (FLAG_CONFIG[b]?.priority ?? 99)).slice(0, 3)
}

function FlagBadge({ flag, seriesNumber }: { flag: string; seriesNumber?: number | null }) {
  const config = FLAG_CONFIG[flag]
  if (!config) return null
  const label = flag === 'series' ? (seriesNumber ? `Series #${seriesNumber}` : 'Series') : FLAG_LABELS[flag] || flag
  return <span style={{ background: config.bg, color: config.text, padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1 }}>{label}</span>
}

function StarDisplay({ rating, count }: { rating: number; count?: number }) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i
    const half = !filled && rating >= i - 0.5
    stars.push(<span key={i} style={{ color: filled || half ? '#f59e0b' : '#334155', fontSize: '11px', lineHeight: 1 }}>{half ? '½' : filled ? '★' : '☆'}</span>)
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>{stars}{count !== undefined && count > 0 && <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '4px' }}>({count})</span>}</span>
}

function PlayPill({ label }: { label: string }) {
  const bg = PLAY_PILL_COLORS[label] || 'rgba(249,115,22,0.88)'
  const textColor = label === 'Continue' ? '#042013' : 'white'
  return (
    <div style={{ position: 'absolute', bottom: '7px', right: '7px', background: bg, borderRadius: '20px', padding: '4px 9px 4px 7px', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
      <svg width="7" height="9" viewBox="0 0 12 14" fill={textColor}><path d="M1 1l10 6-10 6V1z"/></svg>
      <span style={{ color: textColor, fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

export default function HorizontalStoryCard({ id, title, genre, author, duration_mins, cover_url, description, credits, series_number, series_total, flags = [], flag, progress_percent, avg_rating, review_count, is_completed, has_reviewed, not_for_me, onReviewClick }: HorizontalStoryCardProps) {

  let finalFlags = flags
  if ((!flags || flags.length === 0) && flag) {
    const flagMap: Record<string, string> = { 'free': 'free', 'editors-pick': 'editors-pick', 'readers-choice': 'listeners-pick', 'trending': 'trending' }
    const mappedFlag = flagMap[flag]
    if (mappedFlag) finalFlags = [mappedFlag]
  }
  if (not_for_me) finalFlags = ['not-for-me']
  // Remove 'continue' flag — play pill on cover already communicates this
  finalFlags = finalFlags.filter(f => f !== 'continue')

  const displayFlags = getDisplayFlags(finalFlags)
  const durationLabel = duration_mins ? `${duration_mins} min` : series_total ? `~${series_total} min avg` : null
  const showReviewPrompt = is_completed && !has_reviewed && !not_for_me

  let playLabel = 'Play'
  if (is_completed) playLabel = 'Play Again'
  else if (progress_percent !== undefined && progress_percent > 0) playLabel = 'Continue'

  return (
    <Link href={`/player/${id}?autoplay=1&playNow=1`} style={{ display: 'flex', background: '#1e293b', borderRadius: '14px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.06)', textDecoration: 'none', alignItems: 'stretch', padding: 0, minHeight: '150px' }}>
      <div style={{ flexShrink: 0, border: '10px solid #1e293b', borderRight: 'none', display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '130px', height: '130px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 15px rgba(255,255,255,0.4)', position: 'relative' }}>
          <img src={cover_url || '/images/default-cover.png'} alt={title} style={{ width: '130px', height: '130px', objectFit: 'cover', display: 'block' }} />
          <PlayPill label={playLabel} />
        </div>
      </div>
      <div style={{ flex: 1, padding: '10px 12px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', minHeight: '18px', alignItems: 'center' }}>
          {displayFlags.map(f => <FlagBadge key={f} flag={f} seriesNumber={series_number} />)}
        </div>
        <h3 style={{ color: 'white', fontSize: '15px', fontWeight: 700, margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</h3>
        <div style={{ fontSize: '11px', lineHeight: 1.3 }}>
          <div style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{author}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>{genre}</span>
            {durationLabel && <span style={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '6px' }}>{durationLabel}</span>}
          </div>
        </div>
        {!showReviewPrompt && description && (
          <p style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.35, margin: 0, display: '-webkit-box', WebkitLineClamp: avg_rating ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</p>
        )}
        {showReviewPrompt && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReviewClick?.(e) }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
            <span style={{ fontSize: '13px' }}>⭐</span>
            <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: 700 }}>Rate this story</span>
            <span style={{ color: '#22c55e', fontSize: '11px', marginLeft: 'auto' }}>›</span>
          </button>
        )}
        {avg_rating != null && avg_rating > 0 && (
          <div style={{ marginTop: '2px' }}><StarDisplay rating={avg_rating} count={review_count} /></div>
        )}
      </div>
      {progress_percent !== undefined && progress_percent > 0 && progress_percent < 100 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#334155', borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(progress_percent, 100)}%`, backgroundColor: '#f97316', borderRadius: '0 0 14px 14px', transition: 'width 0.3s' }} />
        </div>
      )}
    </Link>
  )
}
