'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  series_id: string | null; series_number: number | null; series_name: string | null
  published_on?: string | null
  avg_rating?: number | null; review_count?: number
}

function episodeNumber(story: Story) {
  return Number(story.series_number || 0)
}

function newestTime(stories: Story[]) {
  return Math.max(...stories.map(story => Date.parse(story.published_on || '') || 0), 0)
}

function completeSeriesLaunchRows(rows: Story[]) {
  const groups = new Map<string, Story[]>()
  rows.forEach((story) => {
    if (!story.series_id) return
    groups.set(story.series_id, [...(groups.get(story.series_id) || []), story])
  })

    return Array.from(groups.values())
    .filter((episodes) => {
      const episodeNumbers = new Set(episodes.map(episodeNumber).filter(Boolean))
      if (episodeNumbers.size <= 1) return false
      const highestEpisode = Math.max(...episodeNumbers)
      return episodeNumbers.size === highestEpisode && episodeNumbers.has(1)
    })
    .map((episodes) => episodes.slice().sort((a, b) => episodeNumber(a) - episodeNumber(b))[0])
    .sort((a, b) => newestTime(rows.filter(story => story.series_id === b.series_id)) - newestTime(rows.filter(story => story.series_id === a.series_id)))
}

function isLaunchInventory(story: Story) {
  return !/\b(test|sample|draft)\b/i.test(`${story.title} ${story.series_name || ''}`)
}

export default function NewReleases({ excludeIds = [], onIdsLoaded }: { excludeIds?: string[]; onIdsLoaded?: (ids: string[]) => void }) {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [user?.id, excludeIds.join(',')])

  async function load() {
    setLoading(true)
    const { data: publicRows } = await supabase
      .from('stories')
      .select('id')
      .eq('status', 'published')
      .eq('is_hidden', false)

    const publicIds = (publicRows || []).map((row) => row.id)
    if (publicIds.length === 0) {
      setStories([])
      setLoading(false)
      onIdsLoaded?.([])
      return
    }

    const { data } = await supabase.from('story_analytics')
      .select('id, title, genre, author, duration_mins, cover_url, avg_rating, review_count, series_id, series_number, series_name, published_on')
      .not('cover_url', 'is', null).eq('is_hidden', false)
      .in('id', publicIds)
      .order('published_on', { ascending: false }).limit(60)
    if (!data) { setLoading(false); onIdsLoaded?.([]); return }

    const ex = new Set(excludeIds)
    const playedSeriesIds = new Set<string>()

    if (user?.id) {
      const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me, last_played').eq('user_id', user.id)
      if (lib) {
        lib.forEach((e: any) => { if (e.progress > 0 || e.completed || e.not_for_me || e.last_played) ex.add(e.story_id) })
        const playedIds = new Set(lib.filter((e: any) => e.last_played).map((e: any) => e.story_id))
        data.forEach((s: any) => {
          if (s.series_id && playedIds.has(s.id)) {
            playedSeriesIds.add(s.series_id)
          }
        })
      }
      try {
        const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
        if (raw) {
          const pl = JSON.parse(raw)
          const playlistItems = pl.items || pl.stories || pl
          ;(Array.isArray(playlistItems) ? playlistItems : []).forEach((s: any) => {
            if (s.type === 'series' && Array.isArray(s.episodes)) {
              s.episodes.forEach((episode: any) => { if (episode?.id) ex.add(episode.id) })
            } else if (s.id) ex.add(s.id)
          })
        }
      } catch {}
    }

    const storyRows = (data as Story[]).filter(isLaunchInventory)
    const excludedSeriesIds = new Set(storyRows.filter(story => story.series_id && ex.has(story.id)).map(story => story.series_id as string))
    const completeSeriesRows = completeSeriesLaunchRows(storyRows)
    const result = [
      ...completeSeriesRows.filter((s) => {
        const sid = s.series_id
        return sid && !playedSeriesIds.has(sid) && !excludedSeriesIds.has(sid) && !ex.has(s.id)
      }),
      ...storyRows.filter((s) => !s.series_id && !ex.has(s.id)),
    ].sort((a, b) => (Date.parse(b.published_on || '') || 0) - (Date.parse(a.published_on || '') || 0)).slice(0, 2)

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
          <Link key={s.id} href={'/player/' + s.id + '?autoplay=1&playNow=1'} className="bg-slate-800 rounded-xl hover:bg-slate-700 transition" style={{ display: 'block', padding: '0.5rem', textDecoration: 'none' }}>
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
