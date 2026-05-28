'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface ContinueCard {
  story_id: string; title: string; author: string; genre: string
  cover_url: string | null; duration_mins: number; progress: number
  last_played: string; series_name: string | null; series_id: string | null; episode_number: number | null
}

function pct(d: number, p: number) { return Math.min(100, Math.round((p / (d * 60)) * 100)) }
function minsLeft(d: number, p: number) { return Math.max(0, Math.round(d - p / 60)) }

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

export default function ContinueListening({ onIdsLoaded }: { onIdsLoaded?: (ids: string[]) => void } = {}) {
  const { user } = useAuth()
  const router = useRouter()
  const [card, setCard] = useState<ContinueCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDismiss, setShowDismiss] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); onIdsLoaded?.([]); return }
    load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('user_library')
      .select('story_id, progress, last_played, completed, hide_from_home, stories(title, author, genre, cover_url, duration_mins, series_id, series_name, episode_number)')
      .eq('user_id', user!.id)
      .eq('completed', false)
      .eq('hide_from_home', false)
      .gt('progress', 60)
      .order('last_played', { ascending: false })
      .limit(1)
      .single()
    if (data && data.stories) {
      const s = data.stories as any
      setCard({ story_id: data.story_id, title: s.title, author: s.author, genre: s.genre, cover_url: s.cover_url, duration_mins: s.duration_mins, progress: data.progress, last_played: data.last_played, series_name: s.series_name || null, series_id: s.series_id || null, episode_number: s.episode_number || null })
      onIdsLoaded?.([data.story_id])
    } else {
      setCard(null)
      onIdsLoaded?.([])
    }
    setLoading(false)
  }

  async function dismiss() {
    if (!card || !user) return
    await supabase.from('user_library').update({ hide_from_home: true }).eq('user_id', user.id).eq('story_id', card.story_id)
    setCard(null); setShowDismiss(false); onIdsLoaded?.([])
  }

  if (loading || !card) return null
  const displayTitle = card.series_name || card.title
  const subtitle = card.series_name ? ('Ep. ' + (card.episode_number || 1) + ': ' + card.title) : (card.author + ' - ' + card.genre)
  const resumeAt = Math.max(0, card.progress)

  return (
    <section style={{ padding: '1.5rem 1rem 0' }}>
      <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>Continue Listening</h2>
      <div onClick={() => router.push('/player/' + card.story_id + '?autoplay=1&playNow=1&resume=' + resumeAt)} style={{ background: '#1e293b', borderRadius: '13px', border: '1px solid rgba(148,163,184,0.06)', display: 'flex', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
        <div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, overflow: 'hidden', boxShadow: '0 0 10px rgba(255,255,255,0.18)' }}>
          <img src={card.cover_url || '/images/default-cover.png'} alt={displayTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, padding: '9px 28px 9px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'white', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayTitle}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
            {card.series_id && card.series_name && (
              <Link
                href={`/series/${card.series_id}`}
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: '#f97316', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.02em' }}
              >
                All episodes →
              </Link>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#ffffff', marginBottom: 4 }}><strong>{minsLeft(card.duration_mins, card.progress)} min</strong> Remaining</div>
            <div style={{ height: 3, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct(card.duration_mins, card.progress) + '%', background: '#f97316', borderRadius: 2 }} />
            </div>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); setShowDismiss(true) }} style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, background: 'rgba(100,116,139,0.4)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '50%', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
      </div>
      {showDismiss && <DismissModal label={displayTitle} onConfirm={dismiss} onCancel={() => setShowDismiss(false)} />}
    </section>
  )
}
