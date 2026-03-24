'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  series_id: string | null; series_name: string | null
  series_number: number | null; created_at: string
  avg_rating?: number | null; review_count?: number
}
interface SeriesGroup {
  id: string; series_name: string; genre: string; episode_count: number
  total_duration_mins: number; cover_url: string | null
  description: string | null; earliest_created_at: string
}
type DisplayItem = { type: 'single'; story: Story; sortDate: string } | { type: 'series'; group: SeriesGroup; sortDate: string }

export default function RecommendedForYou({ excludeIds = [] }: { excludeIds?: string[] }) {
  const router = useRouter()
  const { user } = useAuth()
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, created_at, avg_rating, review_count')
        .not('cover_url', 'is', null)
        .limit(100)
      if (!data || !data.length) { setLoading(false); return }
      let ex = new Set(excludeIds)
      if (user?.id) {
        const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me').eq('user_id', user.id)
        if (lib) lib.forEach((e: any) => { if (e.progress > 0 || e.completed || e.not_for_me) ex.add(e.story_id) })
      }
      const filtered = data.filter((s: Story) => !ex.has(s.id))
      const { data: seriesRows } = await supabase.from('series').select('title, cover_image, description')
      const sl: Record<string, any> = {}
      if (seriesRows) seriesRows.forEach((s: any) => { sl[s.title] = s })
      const seriesMap = new Map<string, SeriesGroup>()
      const singles: Story[] = []
      filtered.forEach((story: Story) => {
        if (story.series_name) {
          const ex = seriesMap.get(story.series_name)
          if (ex) { ex.episode_count++; ex.total_duration_mins += story.duration_mins || 0; if (story.created_at < ex.earliest_created_at) ex.earliest_created_at = story.created_at }
          else { const si = sl[story.series_name]; seriesMap.set(story.series_name, { id: story.series_id || story.id, series_name: story.series_name, genre: story.genre, episode_count: 1, total_duration_mins: story.duration_mins || 0, cover_url: si?.cover_image || story.cover_url, description: si?.description || null, earliest_created_at: story.created_at }) }
        } else { singles.push(story) }
      })
      const items: DisplayItem[] = []
      // RULE: Only show series with more than 1 episode
      seriesMap.forEach(g => { if (g.episode_count > 1) items.push({ type: 'series', group: g, sortDate: g.earliest_created_at }) })
      singles.forEach(s => items.push({ type: 'single', story: s, sortDate: s.created_at }))
      items.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))
      setDisplayItems(items.slice(0, 5))
      setLoading(false)
    }
    fetch()
  }, [user?.id, excludeIds.join(',')])

  if (loading) return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ RECOMMENDED FOR YOU</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[1,2,3].map(i => <div key={i} className="bg-slate-800 rounded-xl animate-pulse" style={{ height: '150px' }} />)}
      </div>
    </section>
  )
  if (!displayItems.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ RECOMMENDED FOR YOU</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {displayItems.map(item => {
          if (item.type === 'series') {
            return <SeriesCard key={`series-${item.group.series_name}`} id={item.group.id} series_name={item.group.series_name} genre={item.group.genre} episode_count={item.group.episode_count} total_duration_mins={item.group.total_duration_mins} cover_url={item.group.cover_url} description={item.group.description} />
          }
          return (
            <div key={item.story.id} onClick={() => router.push(`/player/${item.story.id}`)} style={{ cursor: 'pointer' }}>
              <HorizontalStoryCard id={item.story.id} title={item.story.title} genre={item.story.genre} author={item.story.author || 'Endless Tales'} duration_mins={item.story.duration_mins} cover_url={item.story.cover_url} avg_rating={item.story.avg_rating} review_count={item.story.review_count} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
