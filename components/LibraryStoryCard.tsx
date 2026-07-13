'use client'

/*
================================================================================
LibraryStoryCard — THE canonical story card (WALK-BUG-0713 #7, Marc 2026-07-13)
================================================================================
Extracted VERBATIM from app/library/page.tsx's local StoryCard so every surface
that shows a story card renders THIS component — mirror images everywhere, one
implementation. Library keeps its exact look; RecommendedForYou (and future
card surfaces) map their data into these props.

Visual canon (do not fork):
- type pill: purple "Series · N eps" / blue "Single Story" (+ optional red flag)
- duration: "Xhr-Ymin total · Avg. Zmin" for series, plain minutes for singles
- author/genre in green, amber stars + (count)
- description capped at 70 chars
- buttons: orange Play now/Play series, green Continue, light-orange Play Again,
  blue "+ Queue"/"✓ Remove", amber "View Episodes" (series), red Rate prompt
================================================================================
*/

export function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hrLabel = h === 1 ? 'hr' : 'hrs'
  return m === 0 ? `${h}${hrLabel}` : `${h}${hrLabel}-${m}min`
}

export type CanonCardStory = {
  id: string
  title: string
  duration_mins?: number | null
}

export type CanonCardItem = {
  key: string
  type: 'single' | 'series'
  story?: CanonCardStory | null
  seriesId?: string
  seriesName?: string
  episodeCount?: number
  avgDuration?: number
  totalDuration?: number
  cover?: string | null
  author?: string | null
  genre?: string | null
  description?: string | null
  flag?: string | null
  avgRating?: number | null
  reviewCount?: number | null
  seriesInProgress?: boolean
}

export type CanonCardState = {
  inPlaylist: boolean
  progress: number
  completed: boolean
  isNotForMe: boolean
  reviewed: boolean
}

export default function LibraryStoryCard({
  item,
  state,
  onPlay,
  onCoverClick,
  onTogglePlaylist,
  onRate,
}: {
  item: CanonCardItem
  state: CanonCardState
  onPlay: () => void
  onCoverClick: () => void
  onTogglePlaylist: () => void
  onRate: () => void
}) {
  const isSeries = item.type === 'series'
  const duration = isSeries
    ? `${formatMinutes(item.totalDuration || 0)} total · Avg. ${formatMinutes(item.avgDuration || 0)}`
    : formatMinutes(item.story?.duration_mins || 0)
  const ratingValue = Math.round(item.avgRating || 0)
  const stars = '★'.repeat(ratingValue) + '☆'.repeat(5 - ratingValue)
  const description = item.description || ''
  const truncatedDescription =
    description.length > 70 ? description.slice(0, 67) + '…' : description
  const showProgress = !isSeries && state.progress > 0 && !state.completed
  const inProgress = isSeries ? !!item.seriesInProgress : showProgress
  const showRate = state.completed && !state.reviewed
  const showPlayAgain = !isSeries && state.completed && state.reviewed

  return (
    <div
      style={{
        background: '#2b313d',
        borderRadius: '12px',
        padding: '10px',
        marginBottom: '10px',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        {/* Cover */}
        <div
          onClick={onCoverClick}
          style={{
            width: '108px',
            minHeight: '126px',
            borderRadius: '8px',
            backgroundColor: '#1e1b4b',
            backgroundImage: item.cover ? `url(${item.cover})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 0 12px rgba(255,255,255,0.2)',
            alignSelf: 'stretch',
            cursor: 'pointer',
          }}
        />
        {/* Copy column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {/* Row 1: type pill + special pill + duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                background: isSeries ? '#a855f7' : '#2563eb',
                color: 'white',
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '8px',
                fontWeight: 500,
              }}
            >
              {isSeries ? `Series · ${item.episodeCount} eps` : 'Single Story'}
            </span>
            {item.flag && (
              <span
                style={{
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '8px',
                  fontWeight: 500,
                }}
              >
                {item.flag}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: 'white', fontSize: '11px', fontWeight: 500 }}>{duration}</span>
          </div>

          {/* Row 2: title */}
          <div
            onClick={isSeries ? onCoverClick : undefined}
            style={{ color: 'white', fontSize: '14px', fontWeight: 700, lineHeight: 1.2, cursor: isSeries ? 'pointer' : 'default' }}
          >
            {isSeries ? item.seriesName : item.story?.title}
            {state.isNotForMe && (
              <span style={{ color: '#ef4444', marginLeft: '6px', fontSize: '15px' }}>👎</span>
            )}
          </div>

          {/* Row 3: author/genre/stars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
            <span style={{ color: '#4ade80', fontWeight: 500 }}>{item.author || 'Unknown'}</span>
            {item.genre && <span style={{ color: '#4ade80' }}>· {item.genre}</span>}
            <div style={{ flex: 1 }} />
            {(item.avgRating || 0) > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', color: '#f59e0b', fontSize: '13px' }}>
                {stars}
                {(item.reviewCount || 0) > 0 && (
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>({item.reviewCount})</span>
                )}
              </span>
            )}
          </div>

          {/* Row 4-5: description (cap 70 chars) */}
          {truncatedDescription && (
            <div style={{ color: 'white', fontSize: '11px', lineHeight: 1.4 }}>
              {truncatedDescription}
            </div>
          )}

          {/* Row 6: buttons */}
          <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={onPlay}
              style={{
                flex: 1,
                background: showPlayAgain ? '#fb923c' : inProgress ? '#16a34a' : '#f97316',
                color: 'white',
                border: 'none',
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '11px',
                lineHeight: 1,
                minHeight: '32px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {showPlayAgain ? '▶ Play Again' : inProgress ? '▶ Continue' : isSeries ? '▶ Play series' : '▶ Play now'}
            </button>
            {showRate ? (
              <button
                type="button"
                onClick={onRate}
                style={{
                  flex: 1,
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  lineHeight: 1,
                  minHeight: '32px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '14px' }}>☺</span>
                <span>Rate this {isSeries ? 'series' : 'story'}</span>
                <span style={{ fontSize: '14px' }}>☹</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onTogglePlaylist}
                  style={{
                    flex: 1,
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    lineHeight: 1,
                    minHeight: '32px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {state.inPlaylist ? '✓ Remove' : '+ Queue'}
                </button>
                {isSeries && (
                  <button
                    type="button"
                    onClick={onCoverClick}
                    style={{
                      flex: 1,
                      background: '#eab308',
                      color: '#000',
                      border: '1px solid rgba(234,179,8,0.9)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      lineHeight: 1,
                      minHeight: '32px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    View Episodes
                  </button>
                )}
              </>
            )}
          </div>

          {/* Row 7: progress bar */}
          <div
            style={{
              height: '3px',
              background: state.completed ? '#16a34a' : 'rgba(148,163,184,0.15)',
              borderRadius: '2px',
              marginTop: '2px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {showProgress && item.story?.duration_mins && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${Math.min(
                    100,
                    (state.progress / (item.story.duration_mins * 60)) * 100
                  )}%`,
                  background: '#f97316',
                  borderRadius: '2px',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
