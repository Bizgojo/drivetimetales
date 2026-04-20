'use client'

import Link from 'next/link'

interface NewStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  description?: string | null
  progress_percent?: number
  avg_rating?: number | null
  review_count?: number
  is_completed?: boolean
  has_reviewed?: boolean
  not_for_me?: boolean
  series_name?: string | null
  series_total?: number | null
  series_number?: number | null
  episode_title?: string | null
  inPlaylist?: boolean
  onAddToPlaylist?: () => void
  onRemoveFromPlaylist?: () => void
  onRateClick?: () => void
}

export default function NewStoryCard({
  id, title, genre, author, duration_mins, cover_url, description,
  progress_percent, is_completed, has_reviewed,
  not_for_me, series_name, series_total, series_number, episode_title,
  avg_rating, review_count,
  inPlaylist, onAddToPlaylist, onRemoveFromPlaylist, onRateClick
}: NewStoryCardProps) {

  const isSeries = !!(series_name && series_total && series_total > 1)
  const isInProgress = !is_completed && progress_percent !== undefined && progress_percent > 0
  const showRatePrompt = is_completed && !has_reviewed && !not_for_me
  const showRated = is_completed && has_reviewed && avg_rating != null

  let playLabel = 'Play Now'
  if (is_completed) playLabel = 'Play Again'
  else if (isInProgress) playLabel = 'Continue'

  const displayTitle = (isSeries && episode_title) ? episode_title : title
  const progressPct = Math.min(progress_percent || 0, 100)
  const barColor = is_completed ? '#22c55e' : '#f97316'
  const isNew = !is_completed && !isInProgress

  const playPillBg = is_completed
    ? 'rgba(59,130,246,0.88)'
    : isInProgress
    ? 'rgba(34,197,94,0.88)'
    : 'rgba(249,115,22,0.88)'

  return (
    <div style={{ background: '#1e293b', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* Cover — 110px wide, full card height, no padding */}
        <Link href={`/player/${id}`} style={{ textDecoration: 'none', flexShrink: 0, width: '110px', display: 'block', position: 'relative', background: 'linear-gradient(160deg,#1a3a2a,#2d6a4f)' }}>
          {cover_url && (
            <img src={cover_url} alt={title} style={{ width: '110px', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', top: 0, left: 0 }} />
          )}
        </Link>

        {/* Content */}
        <div style={{ flex: 1, padding: '10px 11px 10px 10px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>

          {/* Row 1: type badge + status + duration */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ background: isSeries ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.12)', color: isSeries ? '#f97316' : 'white', fontSize: '8px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {isSeries ? `${series_total} EPISODES` : 'SINGLE'}
            </span>
            {isNew && <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: '8px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>NEW</span>}
            {is_completed && <span style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', fontSize: '8px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>PLAYED</span>}
            {isSeries && series_number && series_total && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px' }}>Ep {series_number} of {series_total}</span>
            )}
            <span style={{ color: 'white', fontSize: '11px', marginLeft: 'auto', whiteSpace: 'nowrap', fontWeight: 700 }}>{duration_mins} min</span>
          </div>

          {/* Row 2: title */}
          <div style={{ color: 'white', fontSize: '15px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{displayTitle}</div>

          {/* Row 3: author · genre green pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{author}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>·</span>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{genre}</span>
          </div>

          {/* Row 4: description — white, 2 lines max */}
          {description && (
            <div style={{ color: 'white', fontSize: '11px', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description}</div>
          )}

          {/* Row 5: rating row */}
          {showRatePrompt && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>Rate this story</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1,2,3,4,5].map(i => (
                  <span key={i} onClick={(e) => { e.preventDefault(); onRateClick?.() }} style={{ fontSize: '16px', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>★</span>
                ))}
              </div>
            </div>
          )}
          {showRated && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[1,2,3,4,5].map(i => (
                  <span key={i} style={{ fontSize: '13px', color: i <= Math.round(avg_rating!) ? '#f97316' : 'rgba(255,255,255,0.2)', lineHeight: 1 }}>★</span>
                ))}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{avg_rating!.toFixed(1)} avg{review_count ? ' · ' + review_count + ' ratings' : ''}</span>
            </div>
          )}

          {/* Row 6: action buttons — slim */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
            {!inPlaylist ? (
              <>
                <Link href={`/player/${id}`} style={{ flex: 1, background: (is_completed || isInProgress) ? 'rgba(255,255,255,0.08)' : '#f97316', color: 'white', border: (is_completed || isInProgress) ? '1px solid rgba(255,255,255,0.2)' : 'none', borderRadius: '7px', padding: '0', fontSize: '11px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '26px' }}>{playLabel}</Link>
                <button onClick={onAddToPlaylist} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '0', fontSize: '11px', fontWeight: 500, cursor: 'pointer', height: '26px' }}>Add to Playlist</button>
              </>
            ) : (
              <button onClick={onRemoveFromPlaylist} style={{ width: '100%', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', padding: '0', fontSize: '11px', fontWeight: 500, cursor: 'pointer', height: '26px' }}>✓ In Playlist · Remove</button>
            )}
          </div>

        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)' }}>
        {(isInProgress || is_completed) && (
          <div style={{ height: '100%', width: is_completed ? '100%' : progressPct + '%', background: barColor }} />
        )}
      </div>
    </div>
  )
}
