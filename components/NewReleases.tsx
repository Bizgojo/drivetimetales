'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  series_id: string | null; series_number: number | null; series_name: string | null
  avg_rating?: number | null; review_count?: number
}

export default function NewReleases({ excludeIds = [], onIdsLoaded }: { excludeIds?: string[]; onIdsLoaded?: (ids: string[]) => void }) {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [user?.id, excludeIds.join(',')])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('story_analytics')
      .select('id, title, genre, author, duration_mins, cover_url, avg_rating, review_count, series_id, series_number, series_name')
      .not('cover_url', 'is', null).eq('is_hidden', false)
      .order('published_on', { ascending: false }).limit(60)
    if (!data) { setLoading(false); onIdsLoaded?.([]); return }

    const ex = new Set(excludeIds)
    const seriesInProgress = new Map<string, number>()
    const playedSeriesIds = new Set<string>()

    if (user?.id) {
      const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me, last_played').eq('user_id', user.id)
      if (lib) {
        lib.forEach((e: any) => { if (e.progress > 0 || e.completed || e.not_for_me || e.last_played) ex.add(e.story_id) })
        const playedIds = new Set(lib.filter((e: any) => e.last_played).map((e: any) => e.story_id))
        data.forEach((s: any) => {
          if (s.series_id && playedIds.has(s.id)) {
            playedSeriesIds.add(s.series_id)
            const cur = seriesInProgress.get(s.series_id) || 0
            if ((s.series_number || 0) > cur) seriesInProgress.set(s.series_id, s.series_number || 0)
          }
        })
      }
      try {
        const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
        if (raw) { const pl = JSON.parse(raw); (pl.stories || pl).forEach((s: any) => { if (s.id) ex.add(s.id) }) }
      } catch {}
    }

    const result: Story[] = []

    // Pass 1: next episode for series user is already in
    for (const [seriesId, highestPlayed] of seriesInProgress.entries()) {
      if (result.length >= 2) break
      const nextEp = data.find((s: any) => s.series_id === seriesId && s.series_number === highestPlayed + 1 && !ex.has(s.id))
      if (nextEp) result.push(nextEp as Story)
    }

    // Pass 2: Episode 1 of new series user has not started
    const seenSeries = new Set<string>()
    for (const s of data) {
      if (result.length >= 2) break
      const sid = (s as any).series_id
      if (!sid) continue
      if (seenSeries.has(sid)) continue
      seenSeries.add(sid)
      if (playedSeriesIds.has(sid)) continue
      if ((s as any).series_number !== 1) continue
      if (ex.has(s.id)) continue
      result.push(s as Story)
    }

    // Pass 3: standalone stories
    for (const s of data) {
      if (result.length >= 2) break
      if (ex.has(s.id)) continue
      if ((s as any).series_id) continue
      if (result.find(r => r.id === s.id)) continue
      result.push(s as Story)
    }

    setStories(result)
    onIdsLoaded?.(result.map(s => s.id))
    setLoading(false)
  }

  if (loading) return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>NEW RELEASES</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {[1,2].map(i => <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}><div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1/1', marginBottom: '0.5rem' }} /></div>)}
      </div>
    </section>
  )
  if (!stories.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>NEW RELEASES</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map(s => (
          <Link key={s.id} href={'/player/' + s.id} className="bg-slate-800 rounded-xl hover:bg-slate-700 transition" style={{ display: 'block', padding: '0.5rem', textDecoration: 'none' }}>
            <div className="rounded-lg overflow-hidden cover-glow" style={{ position: 'relative' }}>
              <img src={s.cover_url || '/images/default-cover.png'} alt={s.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
              {s.series_name && s.series_number && (
                <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#f97316' }}>EP. {s.series_number}</div>
              )}
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">{s.series_name ? s.series_name : s.title}</h3>
              {s.series_name && <p style={{ color: '#f97316', fontSize: '0.65rem', fontWeight: 600 }}>{s.title}</p>}
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{s.genre}</p>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>by {s.author}</p>
              <p style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>{s.duration_mins} min</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
