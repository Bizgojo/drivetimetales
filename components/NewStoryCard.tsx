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
  is_series_container?: boolean
  inPlaylist?: boolean
  onAddToPlaylist?: () => void
  onRemoveFromPlaylist?: () => void
  onRateClick?: () => void
}

export default function NewStoryCard({
  id, title, genre, author, duration_mins, cover_url, description,
  progress_percent, is_completed, has_reviewed, not_for_me,
  series_name, series_total, series_number, episode_title,
  is_series_container,
  avg_rating, review_count,
  inPlaylist, onAddToPlaylist, onRemoveFromPlaylist, onRateClick
}: NewStoryCardProps) {

  const [rateState, setRateState] = useState<'prompt'|'stars'|'done'|'skip'>('prompt')

  const isSeries = !!is_series_container
  const storyHref = isSeries ? `/series/${id}` : `/player/${id}?autoplay=1&playNow=1`
  const isInProgress = !is_completed && progress_percent !== undefined && progress_percent > 0
  const showRatePrompt = is_completed && !has_reviewed && !not_for_me && rateState === 'prompt'
  const showStarTap   = is_completed && !has_reviewed && !not_for_me && rateState === 'stars'
  const showPlayBtns  = !showRatePrompt && !showStarTap

  let playLabel = isSeries ? 'Play Series' : 'Play Now'
  if (is_completed) playLabel = isSeries ? 'Play Again' : 'Play Again'
  else if (isInProgress) playLabel = isSeries ? 'Continue Series' : 'Continue'

  const displayTitle = (isSeries && episode_title) ? episode_title : title
  const progressPct  = Math.min(progress_percent || 0, 100)
  const barColor     = is_completed ? '#22c55e' : '#f97316'
  const playBtnBg    = isInProgress ? '#22c55e' : is_completed ? 'rgba(255,255,255,0.08)' : '#f97316'
  const playBtnBorder = (isInProgress || is_completed) ? '1px solid rgba(255,255,255,0.2)' : 'none'
  const ratingLabel = avg_rating && avg_rating > 0 ? `★ ${avg_rating.toFixed(1)}` : '☆ New'
  const statusLabel = is_completed ? 'PLAYED' : isInProgress ? 'IN PROGRESS' : 'NEW'

  // single shared button style, fixed to keep card rows aligned
  const B: React.CSSProperties = {
    height: '24px',
    lineHeight: '24px',
    padding: '0 9px',
    borderRadius: '6px',
    fontSize: '10px',
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
    <div style={{ background: '#1b2433', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.09)', height: '156px', display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '0 10px 24px rgba(0,0,0,0.14)' }}>

      <div style={{ display: 'flex', padding: '8px 9px 7px 8px', gap: '9px', flex: 1, overflow: 'hidden' }}>

        {/* Cover — fixed width with a graded light edge for separation */}
        <Link href={storyHref} style={{ textDecoration: 'none', flexShrink: 0, width: '96px', height: '100%', borderRadius: '8px', padding: '1px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, rgba(255,255,255,0.62), rgba(255,255,255,0.16) 48%, rgba(255,255,255,0.04))', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '7px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(160deg,#1a3a2a,#2d6a4f)', display: isSeries && !cover_url ? 'flex' : 'block', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: isSeries && !cover_url ? '8px' : '0', boxSizing: 'border-box' }}>
            {cover_url ? (
              <>
                <img src={cover_url} alt={title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {isSeries && (
                  <span style={{ position: 'absolute', top: '6px', left: '6px', background: 'rgba(249,115,22,0.92)', color: 'white', fontSize: '7px', fontWeight: 800, padding: '2px 5px', borderRadius: '3px' }}>SERIES</span>
                )}
              </>
            ) : isSeries ? (
              <>
                <span style={{ background: 'rgba(249,115,22,0.9)', color: 'white', fontSize: '7px', fontWeight: 800, padding: '2px 5px', borderRadius: '3px' }}>SERIES</span>
                <div style={{ width: '24px', height: '24px', background: 'rgba(249,115,22,0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="8" height="8" viewBox="0 0 12 12"><polygon points="4,2 10,6 4,10" fill="white"/></svg>
                </div>
                <span style={{ color: 'white', fontSize: '7px' }}>Series</span>
              </>
            ) : null}
          </div>
        </Link>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateRows: '18px 20px 18px 36px 1fr 24px', gap: '3px', overflow: 'hidden' }}>

          <Link href={storyHref} style={{ display: 'contents', textDecoration: 'none', color: 'inherit' }}>
            {/* Row 1: type/status/duration */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span style={{ background: isSeries ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.12)', color: isSeries ? '#f97316' : 'white', fontSize: '7px', lineHeight: '14px', padding: '0 5px', borderRadius: '3px', fontWeight: 800, flexShrink: 0 }}>
                {isSeries ? (series_total ? `${series_total} EPS` : 'SERIES') : 'SINGLE'}
              </span>
              <span style={{ background: is_completed ? 'rgba(34,197,94,0.16)' : isInProgress ? 'rgba(34,197,94,0.16)' : '#1e3a5f', color: is_completed || isInProgress ? '#22c55e' : '#60a5fa', fontSize: '7px', lineHeight: '14px', padding: '0 5px', borderRadius: '3px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{statusLabel}</span>
              <span style={{ color: 'white', fontSize: '11px', marginLeft: 'auto', fontWeight: 800, flexShrink: 0 }}>{duration_mins} min</span>
            </div>

            {/* Row 2: title */}
            <div style={{ color: 'white', fontSize: '14px', fontWeight: 800, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayTitle}</div>

            {/* Row 3: author / genre / rating */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.55)', fontSize: '10px', lineHeight: '18px' }}>
              <span style={{ color: '#22c55e', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{author}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{genre}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>·</span>
              <span style={{ color: avg_rating && avg_rating > 0 ? '#f97316' : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{ratingLabel}{review_count ? ` · ${review_count}` : ''}</span>
            </div>

            {/* Rows 4-5: description */}
            <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '10px', lineHeight: '18px', height: '36px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {description || ''}
            </div>
          </Link>

          <div />

          {/* Row 6: fixed action row */}
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {showRatePrompt && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: '6px' }}>
                <button onClick={() => setRateState('stars')} style={{ ...B, background: '#dc2626', color: 'white', justifyContent: 'space-between', padding: '0 8px' }}>
                  <span style={{ fontSize: '11px' }}>😊</span>
                  <span style={{ fontSize: '10px' }}>Rate Story</span>
                  <span style={{ fontSize: '11px' }}>😞</span>
                </button>
                <button onClick={() => setRateState('skip')} style={{ ...B, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600 }}>Not Now</button>
              </div>
            )}

            {showStarTap && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '24px' }}>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>Tap to rate</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {[1,2,3,4,5].map(i => (
                    <span key={i} onClick={() => { onRateClick?.(); setRateState('done') }} style={{ fontSize: '17px', cursor: 'pointer', color: 'rgba(255,255,255,0.24)', lineHeight: 1 }}>★</span>
                  ))}
                </div>
              </div>
            )}

            {showPlayBtns && (
              <div style={{ display: 'grid', gridTemplateColumns: inPlaylist ? '1fr' : '1fr 1fr', gap: '6px' }}>
                {!inPlaylist ? (
                  <>
                    <Link href={storyHref} style={{ ...B, background: playBtnBg, color: 'white', border: playBtnBorder }}>{playLabel}</Link>
                    <button onClick={onAddToPlaylist} style={{ ...B, background: '#3b82f6', color: 'white' }}>Playlist</button>
                  </>
                ) : (
                  <button onClick={onRemoveFromPlaylist} style={{ ...B, width: '100%', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>✓ In Playlist · Remove</button>
                )}
              </div>
            )}
          </div>

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
