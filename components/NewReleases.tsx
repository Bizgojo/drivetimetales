'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null; published_on: string
  avg_rating?: number | null; review_count?: number
}


function StarDisplay({ rating, count }: { rating: number; count?: number }) {
  return <span style={{ display: 'inline-flex', gap: '1px' }}>
    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= rating ? '#f59e0b' : '#334155', fontSize: '10px' }}>{i <= rating ? '★' : '☆'}</span>)}
    {count ? <span style={{ color: '#64748b', fontSize: '9px', marginLeft: '3px' }}>({count})</span> : null}
  </span>
}

export default function NewReleases({ excludeIds = [], onIdsLoaded }: { excludeIds?: string[], onIdsLoaded?: (ids: string[]) => void }) {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      // Fetch recent stories including series info
      const { data } = await supabase.from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url, published_on, avg_rating, review_count, series_id, episode_number')
        .not('cover_url', 'is', null).eq('is_hidden', false).gte('duration_mins', 10).order('published_on', { ascending: false }).limit(40)
      if (!data) { setLoading(false); return }

      let ex = new Set(excludeIds)
      let userLib: any[] = []
      let seriesInProgress = new Map<string, number>() // series_id -> highest completed episode_number

      if (user?.id) {
        const { data: lib } = await supabase.from('user_library')
          .select('story_id, progress, completed, not_for_me, last_played')
          .eq('user_id', user.id)
        userLib = lib || []

        // Build exclude set — any story user has interacted with
        userLib.forEach((e: any) => {
          if (e.progress > 0 || e.completed || e.not_for_me || e.last_played) ex.add(e.story_id)
        })

        // Find which series the user has started/completed episodes in
        // and what the highest episode number they've reached is
        const playedIds = new Set(userLib.filter((e: any) => e.last_played).map((e: any) => e.story_id))
        const playedStories = data.filter((s: any) => playedIds.has(s.id) && s.series_id)
        playedStories.forEach((s: any) => {
          const cur = seriesInProgress.get(s.series_id) || 0
          if ((s.episode_number || 0) > cur) seriesInProgress.set(s.series_id, s.episode_number || 0)
        })

        // Exclude stories in active playlist
        try {
          const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
          if (raw) {
            const pl = JSON.parse(raw)
            ;(pl.stories || pl).forEach((s: any) => { if (s.id) ex.add(s.id) })
          }
        } catch {}
      }

      const result: any[] = []

      for (const s of data) {
        if (result.length >= 2) break
        if (ex.has(s.id)) continue

        const seriesId = (s as any).series_id
        const epNum = (s as any).episode_number

        if (seriesId) {
          // Series episode rules:
          // 1. User must have started this series (has a played episode)
          // 2. This must be the next episode (highest played + 1)
          const highestPlayed = seriesInProgress.get(seriesId)
          if (!highestPlayed) continue // user hasn't started this series — skip
          if (epNum !== highestPlayed + 1) continue // not the next episode — skip
        }

        result.push(s)
      }

      setStories(result)
      if (onIdsLoaded) onIdsLoaded(result.map((s: any) => s.id))
      setLoading(false)
    }
    fetch()
  }, [user?.id, excludeIds.join(',')])

  if (loading) return <section style={{ padding: '1.5rem 1rem 1rem' }}><h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>{[1,2].map(i => <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}><div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1/1', marginBottom: '0.5rem' }} /></div>)}</div></section>
  if (!stories.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map(s => (
          <Link key={s.id} href={`/player/${s.id}`} className="bg-slate-800 rounded-xl hover:bg-slate-700 transition" style={{ display: 'block', padding: '0.5rem', textDecoration: 'none' }}>
            <div className="rounded-lg overflow-hidden cover-glow">
              <img src={s.cover_url || '/images/default-cover.png'} alt={s.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">{s.title}</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{s.genre}</p>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>by {s.author}</p>
              <p style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>{s.duration_mins} min</p>
              {s.avg_rating != null && s.avg_rating > 0 && <StarDisplay rating={Math.round(s.avg_rating)} count={s.review_count} />}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
