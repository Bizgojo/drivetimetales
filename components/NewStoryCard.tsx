'use client'

import Link from 'next/link'
import { useState } from 'react'

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
  progress_percent, is_completed, has_reviewed, not_for_me,
  series_name, series_total, series_number, episode_title,
  avg_rating, review_count,
  inPlaylist, onAddToPlaylist, onRemoveFromPlaylist, onRateClick
}: NewStoryCardProps) {

  const [rateState, setRateState] = useState<'prompt'|'stars'|'done'|'skip'>('prompt')

  const isSeries = !!(series_name && series_total && series_total > 1)
  const isInProgress = !is_completed && progress_percent !== undefined && progress_percent > 0
  const isNew = !is_completed && !isInProgress
  const showRatePrompt = is_completed && !has_reviewed && !not_for_me && rateState === 'prompt'
  const showStarTap   = is_completed && !has_reviewed && !not_for_me && rateState === 'stars'
  const showRated     = is_completed && (has_reviewed || rateState === 'done')
  const showPlayBtns  = !showRatePrompt && !showStarTap

  let playLabel = 'Play Now'
  if (is_completed) playLabel = 'Play Again'
  else if (isInProgress) playLabel = 'Continue'

  const displayTitle = (isSeries && episode_title) ? episode_title : title
  const progressPct  = Math.min(progress_percent || 0, 100)
  const barColor     = is_completed ? '#22c55e' : '#f97316'
  const playBtnBg    = isInProgress ? '#22c55e' : is_completed ? 'rgba(255,255,255,0.08)' : '#f97316'
  const playBtnBorder = (isInProgress || is_completed) ? '1px solid rgba(255,255,255,0.2)' : 'none'

  // single shared button style — 18px tall, no padding fighting height
  const B: React.CSSProperties = {
    height: '18px',
    lineHeight: '18px',
    padding: '0 8px',
    borderRadius: '5px',
    fontSize: '9px',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.06)', height: '152px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

      <div style={{ display: 'flex', padding: '8px 9px 8px 8px', gap: '8px', flex: 1, overflow: 'hidden' }}>

        {/* Cover — 94px, rounded, contained inside padding */}
        <Link href={`/player/${id}`} style={{ textDecoration: 'none', flexShrink: 0, width: '94px', borderRadius: '7px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(160deg,#1a3a2a,#2d6a4f)', display: isSeries ? 'flex' : 'block', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: isSeries ? '8px' : '0' }}>
          {isSeries ? (
            <>
              <span style={{ background: 'rgba(249,115,22,0.9)', color: 'white', fontSize: '7px', fontWeight: 800, padding: '2px 5px', borderRadius: '3px' }}>SERIES</span>
              <div style={{ width: '24px', height: '24px', background: 'rgba(249,115,22,0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="8" height="8" viewBox="0 0 12 12"><polygon points="4,2 10,6 4,10" fill="white"/></svg>
              </div>
              <span style={{ color: 'white', fontSize: '7px' }}>Ep {series_number}/{series_total}</span>
            </>
          ) : cover_url ? (
            <img src={cover_url} alt={title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : null}
        </Link>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Badges + duration */}
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0, marginBottom: '3px' }}>
            <span style={{ background: isSeries ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.12)', color: isSeries ? '#f97316' : 'white', fontSize: '7px', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
              {isSeries ? `${series_total} EPS` : 'SINGLE'}
            </span>
            {isNew      && <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: '7px', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>NEW</span>}
            {is_completed && <span style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', fontSize: '7px', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>PLAYED</span>}
            <span style={{ color: 'white', fontSize: '11px', marginLeft: 'auto', fontWeight: 700 }}>{duration_mins} min</span>
          </div>

          {/* Title */}
          <div style={{ color: 'white', fontSize: '13px', fontWeight: 700, lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, marginBottom: '3px' }}>{displayTitle}</div>

          {/* Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, marginBottom: '3px', overflow: 'hidden' }}>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '8px', padding: '1px 5px', borderRadius: '8px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{author}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '8px' }}>·</span>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '8px', padding: '1px 5px', borderRadius: '8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{genre}</span>
          </div>

          {/* Description */}
          {description && (
            <div style={{ color: 'white', fontSize: '10px', lineHeight: '1.35', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flexShrink: 0, marginBottom: '3px' }}>{description}</div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Stars */}
          {showRated && avg_rating != null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '3px', flexShrink: 0 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: '10px', color: i <= Math.round(avg_rating) ? '#f97316' : 'rgba(255,255,255,0.2)', lineHeight: 1 }}>★</span>)}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginLeft: '2px' }}>{avg_rating.toFixed(1)} avg{review_count ? ' · ' + review_count : ''}</span>
            </div>
          ) : !showRatePrompt && !showStarTap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '3px', flexShrink: 0 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.12)', lineHeight: 1 }}>★</span>)}
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9px', marginLeft: '2px' }}>
                {avg_rating && avg_rating > 0 ? `${avg_rating.toFixed(1)} avg${review_count ? ' · ' + review_count : ''}` : 'No ratings yet'}
              </span>
            </div>
          )}

          {/* Rate This Story */}
          {showRatePrompt && (
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              <button onClick={() => setRateState('stars')} style={{ ...B, flex: 1, background: '#dc2626', color: 'white', justifyContent: 'space-between', padding: '0 7px' }}>
                <span style={{ fontSize: '11px' }}>😊</span>
                <span style={{ fontSize: '9px' }}>Rate This Story</span>
                <span style={{ fontSize: '11px' }}>😞</span>
              </button>
              <button onClick={() => setRateState('skip')} style={{ ...B, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 500 }}>Not Now</button>
            </div>
          )}

          {/* Star tap */}
          {showStarTap && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px' }}>Tap to rate</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1,2,3,4,5].map(i => (
                  <span key={i} onClick={() => { onRateClick?.(); setRateState('done') }} style={{ fontSize: '17px', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>★</span>
                ))}
              </div>
            </div>
          )}

          {/* Play / Playlist buttons */}
          {showPlayBtns && (
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              {!inPlaylist ? (
                <>
                  <Link href={`/player/${id}`} style={{ ...B, flex: 1, background: playBtnBg, color: 'white', border: playBtnBorder }}>{playLabel}</Link>
                  <button onClick={onAddToPlaylist} style={{ ...B, flex: 1, background: '#3b82f6', color: 'white' }}>Add to Playlist</button>
                </>
              ) : (
                <button onClick={onRemoveFromPlaylist} style={{ ...B, width: '100%', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 500 }}>✓ In Playlist · Remove</button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}>
        {(isInProgress || is_completed) && (
          <div style={{ height: '100%', width: is_completed ? '100%' : progressPct + '%', background: barColor }} />
        )}
      </div>
    </div>
  )
}
