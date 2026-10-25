'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNowPlaying } from '@/components/player/PersistentPlayer'

interface ContinueCard {
  story_id: string; title: string; author: string; genre: string
  cover_url: string | null; duration_mins: number; progress: number
  last_played: string; series_name: string | null; series_id: string | null; episode_number: number | null
  description: string | null
}

function DismissModal({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '320px', width: '100%', textAlign: 'center' }}>
        <p style={{ color: 'white', fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Remove from Continue Listening?</p>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>{label} will stay in your Library with your progress saved.</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#dc2626', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Remove</button>
        </div>
      </div>
    </div>
  )
}

// WALK-BUG-0713 #5 (Marc, 2026-07-13): when the ContinueSampleHero is already
// showing a story, this list must NOT repeat it — same title stacked twice on
// /home. Keep unfinished stories available below the active mini-player;
// exclude the hero and the active story by ID, without altering saved rows.
export default function ContinueListening({ onIdsLoaded, excludeStoryId = null }: { onIdsLoaded?: (ids: string[]) => void; excludeStoryId?: string | null } = {}) {
  const { user } = useAuth()
  const router = useRouter()
  const [cards, setCards] = useState<ContinueCard[]>([])
  const nowPlaying = useNowPlaying()
  const [loading, setLoading] = useState(true)
  const [showDismiss, setShowDismiss] = useState<ContinueCard | null>(null)

  useEffect(() => {
    if (!user) { setLoading(false); onIdsLoaded?.([]); return }
    load()
  }, [user, excludeStoryId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('user_library')
      .select('story_id, progress, last_played, completed, hide_from_home, stories(title, author, genre, cover_url, duration_mins, series_id, series_name, episode_number, description)')
      .eq('user_id', user!.id)
      .eq('completed', false)
      .eq('hide_from_home', false)
      .not('last_played', 'is', null)
      .order('last_played', { ascending: false })
      .limit(50)
    const rows = (data || []).filter(r => r.stories && r.story_id !== excludeStoryId)
    const nextCards = rows.map(row => {
      const story = row.stories as any
      return { ...story, story_id: row.story_id, progress: row.progress, last_played: row.last_played } as ContinueCard
    })
    setCards(nextCards)
    onIdsLoaded?.(nextCards.map(card => card.story_id))
    setLoading(false)
  }

  async function dismiss() {
    if (!showDismiss || !user) return
    await supabase.from('user_library').update({ hide_from_home: true }).eq('user_id', user.id).eq('story_id', showDismiss.story_id)
    const remaining = cards.filter(card => card.story_id !== showDismiss.story_id)
    setCards(remaining); setShowDismiss(null); onIdsLoaded?.(remaining.map(card => card.story_id))
  }

  if (loading) return null
  return <>{cards.filter(card => card.story_id !== nowPlaying?.storyId).map(card => {
  const displayTitle = card.series_name || card.title
  const resumeAt = Math.max(0, card.progress)
  const description = card.description || ''
  const truncatedDescription = description.length > 90 ? description.slice(0, 87) + '…' : description

  return (
    <section key={card.story_id} style={{ padding: '1.5rem 1rem 0' }}>
      <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Continue {displayTitle}</h2>
      <div style={{ background: '#1e293b', borderRadius: '13px', border: '1px solid rgba(148,163,184,0.06)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: 96, flexShrink: 0, alignSelf: 'stretch' }}>
          <img src={card.cover_url || '/images/default-cover.png'} alt={displayTitle} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, padding: '10px 36px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', minWidth: 0 }}>
          {truncatedDescription && (
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.4 }}>{truncatedDescription}</div>
          )}
          <button
            onClick={() => router.push('/player/' + card.story_id + '?autoplay=1&playNow=1&resume=' + resumeAt)}
            style={{ background: '#4ade80', color: '#000', border: 'none', borderRadius: '8px', padding: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
          >
            Continue
          </button>
        </div>
        <button onClick={() => setShowDismiss(card)} style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
      </div>
      {showDismiss?.story_id === card.story_id && <DismissModal label={displayTitle} onConfirm={dismiss} onCancel={() => setShowDismiss(null)} />}
    </section>
  )
  })}</>
}
