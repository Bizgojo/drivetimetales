'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

interface SingleStoryCard {
  type: 'single'
  story_id: string
  title: string
  author: string
  genre: string
  cover_url: string | null
  duration_mins: number
  progress: number        // seconds
  last_played: string
}

interface SeriesCard {
  type: 'series'
  story_id: string        // current episode id
  series_id: string
  series_name: string
  title: string           // episode title
  author: string
  genre: string
  cover_url: string | null
  duration_mins: number
  progress: number        // seconds into episode
  episode_number: number
  total_episodes: number
  total_remaining_mins: number  // total mins left across all remaining episodes
  last_played: string
}

interface PlaylistCard {
  type: 'playlist'
  playlist_id: string
  total_stories: number
  completed_stories: number
  remaining_mins: number
  next_stories: string[]  // titles of remaining stories to play
  last_played: string
}

type ContinueCard = SingleStoryCard | SeriesCard | PlaylistCard

// =============================================================================
// HELPERS
// =============================================================================

function minsRemaining(durationMins: number, progressSeconds: number): number {
  return Math.max(0, Math.round(durationMins - progressSeconds / 60))
}

function progressPercent(durationMins: number, progressSeconds: number): number {
  return Math.min(100, Math.round((progressSeconds / (durationMins * 60)) * 100))
}

// =============================================================================
// DISMISS CONFIRM MODAL
// =============================================================================

function DismissModal({
  label,
  onConfirm,
  onCancel,
}: {
  label: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem',
          maxWidth: '320px', width: '100%', textAlign: 'center',
        }}
      >
        <p style={{ color: 'white', fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
          Remove from Continue Listening?
        </p>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>
          {label} will stay in your Library with your progress saved.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #334155',
            background: 'transparent', color: '#94a3b8', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
            background: '#dc2626', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          }}>Remove</button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// CARD: SINGLE STORY
// =============================================================================

function SingleStoryCardUI({
  card,
  onDismiss,
}: {
  card: SingleStoryCard
  onDismiss: () => void
}) {
  const router = useRouter()
  const resumeAt = Math.max(0, card.progress - 5)
  const pct = progressPercent(card.duration_mins, card.progress)
  const minsLeft = minsRemaining(card.duration_mins, card.progress)
  const notStarted = card.progress === 0

  return (
    <div
      onClick={() => router.push(`/player/${card.story_id}?resume=${resumeAt}`)}
      style={{
        background: '#1e293b', borderRadius: '13px',
        border: '1px solid rgba(148,163,184,0.06)',
        display: 'flex', overflow: 'hidden', position: 'relative', cursor: 'pointer',
      }}
    >
      {/* Cover */}
      <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, overflow: 'hidden', boxShadow: '0 0 10px rgba(255,255,255,0.18)' }}>
        <img src={card.cover_url || '/images/default-cover.png'} alt={card.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '9px 28px 9px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'white', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</div>
          <div style={{ fontSize: 11, color: '#ffffff', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.author} · {card.genre}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#ffffff', marginBottom: 4 }}><strong style={{ color: '#ffffff' }}>{minsLeft} min</strong> left</div>
          <div style={{ height: 3, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#f97316', borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24,
          background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}
      >×</button>
    </div>
  )
}

// =============================================================================
// CARD: SERIES EPISODE
// =============================================================================

function SeriesCardUI({
  card,
  onDismiss,
}: {
  card: SeriesCard
  onDismiss: () => void
}) {
  const router = useRouter()
  const resumeAt = Math.max(0, card.progress - 5)
  const pct = progressPercent(card.duration_mins, card.progress)
  const minsLeft = minsRemaining(card.duration_mins, card.progress)

  return (
    <div
      onClick={() => router.push(`/player/${card.story_id}?resume=${resumeAt}`)}
      style={{
        background: '#1e293b', borderRadius: '13px',
        border: '1px solid rgba(148,163,184,0.06)',
        display: 'flex', overflow: 'hidden', position: 'relative', cursor: 'pointer',
      }}
    >
      {/* Cover */}
      <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, overflow: 'hidden', boxShadow: '0 0 10px rgba(255,255,255,0.18)' }}>
        <img src={card.cover_url || '/images/default-cover.png'} alt={card.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '9px 28px 9px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'white', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.series_name}</div>
          <div style={{ fontSize: 11, color: '#ffffff', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.author}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#ffffff', marginBottom: 4 }}>
            {(() => {
              const fullEpsAfter = card.total_episodes - card.episode_number
              const isPartial = card.progress > 0
              const epCount = isPartial ? `${fullEpsAfter}+` : `${fullEpsAfter + 1}`
              const hrs = Math.floor(card.total_remaining_mins / 60)
              const mins = card.total_remaining_mins % 60
              const timeStr = hrs > 0 ? `${hrs}hr ${mins}min` : `${mins}min`
              return <><strong style={{ color: '#ffffff' }}>{epCount} Episodes, {timeStr} Remaining</strong></>
            })()}
          </div>
          <div style={{ height: 3, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#f97316', borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24,
          background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}
      >×</button>
    </div>
  )
}

// =============================================================================
// CARD: PLAYLIST
// =============================================================================

function PlaylistCardUI({
  card,
  onDismiss,
}: {
  card: PlaylistCard
  onDismiss: () => void
}) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push('/player/playlist')}
      style={{
        background: '#1e293b', borderRadius: '13px',
        border: '1px solid rgba(148,163,184,0.06)',
        display: 'flex', overflow: 'hidden', position: 'relative', cursor: 'pointer',
        alignItems: 'flex-start',
      }}
    >
      {/* Playlist cover icon */}
      <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, overflow: 'hidden', boxShadow: '0 0 10px rgba(255,255,255,0.18)' }}>
        <img src="/images/playlist_icon.png" alt="Playlist" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '9px 28px 9px 9px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'white', lineHeight: 1.2, marginBottom: 4 }}>
          {card.total_stories} Stories · {card.remaining_mins} min remaining
        </div>
        <div style={{ overflow: 'hidden' }}>
          {card.next_stories.map((title, i) => (
            <div
              key={i}
              style={{
                fontSize: 11, lineHeight: 1.6,
                color: '#ffffff',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip',
              }}
            >
              {i === 0 ? '▶ ' : '· '}{title}
            </div>
          ))}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24,
          background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}
      >×</button>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ContinueListening() {
  const { user } = useAuth()
  const [singleCard, setSingleCard] = useState<SingleStoryCard | null>(null)
  const [seriesCard, setSeriesCard] = useState<SeriesCard | null>(null)
  const [playlistCard, setPlaylistCard] = useState<PlaylistCard | null>(null)
  const [loading, setLoading] = useState(true)

  // Dismiss state — tracks which cards are hidden from home (not deleted)
  const [hiddenSingle, setHiddenSingle] = useState<string | null>(null)   // story_id
  const [hiddenSeries, setHiddenSeries] = useState<string | null>(null)   // story_id
  const [dismissModal, setDismissModal] = useState<'single' | 'series' | 'playlist' | null>(null)

  useEffect(() => {
    if (!user) return
    fetchCards()
  }, [user, hiddenSingle, hiddenSeries])

  const fetchCards = async () => {
    setLoading(true)

    // --- Single story: most recent in-progress, not a series episode ---
    const { data: singles } = await supabase
      .from('user_library')
      .select(`
        story_id, progress, last_played, completed,
        stories(title, author, genre, cover_url, duration_mins, series_id)
      `)
      .eq('user_id', user!.id)
      .eq('completed', false)
      .eq('hide_from_home', false)
      .order('last_played', { ascending: false })
      .limit(20)

    const validSingles = (singles || []).filter(r => {
      if (!r.stories || r.completed || r.story_id === hiddenSingle) return false
      // Keep only non-series stories
      return !(r.stories as any).series_id
    })
    if (validSingles.length > 0) {
      const r = validSingles[0]
      const s = r.stories as any
      setSingleCard({
        type: 'single',
        story_id: r.story_id,
        title: s.title,
        author: s.author,
        genre: s.genre,
        cover_url: s.cover_url,
        duration_mins: s.duration_mins,
        progress: r.progress,
        last_played: r.last_played,
      })
    } else {
      setSingleCard(null)
    }

    // --- Series episode: most recent in-progress series episode ---
    // NOTE: .not() on a related table column (stories.series_id) is not supported
    // by PostgREST — filter in JS instead.
    const { data: seriesRows } = await supabase
      .from('user_library')
      .select(`
        story_id, progress, last_played, completed,
        stories(title, author, genre, cover_url, duration_mins, series_id, episode_number,
          series(title, total_episodes))
      `)
      .eq('user_id', user!.id)
      .eq('completed', false)
      .eq('hide_from_home', false)
      .order('last_played', { ascending: false })
      .limit(20)

    const validSeries = (seriesRows || []).filter(r => {
      if (r.completed || r.story_id === hiddenSeries) return false
      if (!r.stories) return false
      // Keep only series episodes (have a series_id)
      return !!(r.stories as any).series_id
    })
    const firstValidSeries = validSeries[0] ?? null
    if (firstValidSeries) {
      const r = firstValidSeries
      const s = r.stories as any
      const currentEp = s.episode_number || 1

      // Fetch durations of remaining episodes only (current ep onwards)
      let totalRemainingMins = minsRemaining(s.duration_mins, r.progress)  // time left on current ep
      if (s.series_id) {
        const { data: futureEps } = await supabase
          .from('stories')
          .select('duration_mins')
          .eq('series_id', s.series_id)
          .gt('episode_number', currentEp)  // episodes AFTER current
        for (const ep of (futureEps || [])) {
          totalRemainingMins += ep.duration_mins || 0
        }
      }
      if (totalRemainingMins === 0) totalRemainingMins = minsRemaining(s.duration_mins, r.progress)

      setSeriesCard({
        type: 'series',
        story_id: r.story_id,
        series_id: s.series_id,
        series_name: s.series?.title || s.title,
        title: s.title,
        author: s.author,
        genre: s.genre,
        cover_url: s.cover_url,
        duration_mins: s.duration_mins,
        progress: r.progress,
        episode_number: currentEp,
        total_episodes: s.series?.total_episodes || 1,
        total_remaining_mins: totalRemainingMins,
        last_played: r.last_played,
      })
    } else {
      setSeriesCard(null)
    }

    // --- Playlist: read from localStorage ---
    const raw = localStorage.getItem('dtt_active_playlist')
    if (raw) {
      try {
        const pl = JSON.parse(raw)
        setPlaylistCard({
          type: 'playlist',
          playlist_id: pl.id || 'active',
          total_stories: pl.stories?.length || 0,
          completed_stories: pl.completed || 0,
          remaining_mins: pl.remaining_mins || 0,
          next_stories: (pl.stories || [])
            .slice(pl.completed || 0)
            .map((s: any) => s.title),
          last_played: pl.last_played || '',
        })
      } catch {
        setPlaylistCard(null)
      }
    } else {
      setPlaylistCard(null)
    }

    setLoading(false)
  }

  // Dismiss handlers — set hide_from_home flag in DB, replace with next most recent
  const dismissSingle = async () => {
    if (!singleCard || !user) return
    await supabase
      .from('user_library')
      .update({ hide_from_home: true })
      .eq('user_id', user.id)
      .eq('story_id', singleCard.story_id)
    setHiddenSingle(singleCard.story_id)
    setDismissModal(null)
  }

  const dismissSeries = async () => {
    if (!seriesCard || !user) return
    await supabase
      .from('user_library')
      .update({ hide_from_home: true })
      .eq('user_id', user.id)
      .eq('story_id', seriesCard.story_id)
    setHiddenSeries(seriesCard.story_id)
    setDismissModal(null)
  }

  const dismissPlaylist = () => {
    localStorage.removeItem('dtt_active_playlist'); localStorage.removeItem('dtt_playlist'); localStorage.removeItem('dtt_playlist_index'); localStorage.removeItem('dtt_playlist_progress')
    setPlaylistCard(null)
    setDismissModal(null)
  }

  if (loading) return null
  if (!singleCard && !seriesCard && !playlistCard) return null

  return (
    <section style={{ padding: '1.5rem 1rem 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {singleCard && (
          <div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Your Saved Story</h2>
            <SingleStoryCardUI
              card={singleCard}
              onDismiss={() => setDismissModal('single')}
            />
          </div>
        )}
        {seriesCard && (
          <div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Your Saved Series</h2>
            <SeriesCardUI
              card={seriesCard}
              onDismiss={() => setDismissModal('series')}
            />
          </div>
        )}
        {playlistCard && (
          <div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Your Saved Playlist</h2>
            <PlaylistCardUI
              card={playlistCard}
              onDismiss={() => setDismissModal('playlist')}
            />
          </div>
        )}
      </div>

      {/* Dismiss modals */}
      {dismissModal === 'single' && singleCard && (
        <DismissModal
          label={singleCard.title}
          onConfirm={dismissSingle}
          onCancel={() => setDismissModal(null)}
        />
      )}
      {dismissModal === 'series' && seriesCard && (
        <DismissModal
          label={seriesCard.series_name}
          onConfirm={dismissSeries}
          onCancel={() => setDismissModal(null)}
        />
      )}
      {dismissModal === 'playlist' && (
        <DismissModal
          label="Your Playlist"
          onConfirm={dismissPlaylist}
          onCancel={() => setDismissModal(null)}
        />
      )}
    </section>
  )
}
