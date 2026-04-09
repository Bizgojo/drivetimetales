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
  avg_rating?: number | null; review_count?: number
}
interface SeriesGroup {
  id: string; series_name: string; genre: string; author: string | null; episode_count: number
  total_duration_mins: number; cover_url: string | null; description: string | null
  avg_episode_duration: number
}
type DisplayItem = { type: 'single'; story: Story } | { type: 'series'; group: SeriesGroup }

export default function RecommendedForYou({ excludeIds = [] }: { excludeIds?: string[] }) {
  const router = useRouter()
  const { user } = useAuth()
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [user?.id, excludeIds.join(',')])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('story_analytics')
      .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, avg_rating, review_count')
      .not('cover_url', 'is', null).eq('is_hidden', false).limit(100)
    if (!data || !data.length) { setLoading(false); return }

    const ex = new Set(excludeIds)
    let topGenres: string[] = []
    let prefersSeries = false
    let avgDuration = 20

    if (user?.id) {
      const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me, last_played').eq('user_id', user.id)
      if (lib) {
        lib.forEach((e: any) => { if (e.progress > 0 || e.completed || e.not_for_me || e.last_played) ex.add(e.story_id) })
        const playedIds = new Set(lib.filter((e: any) => e.last_played || e.progress > 0).map((e: any) => e.story_id))
        const played = data.filter((s: any) => playedIds.has(s.id))
        if (played.length > 0) {
          const gc: Record<string, number> = {}
          let sc = 0, snc = 0, td = 0
          played.forEach((s: any) => {
            if (s.genre) gc[s.genre] = (gc[s.genre] || 0) + 1
            if (s.series_id) sc++; else snc++
            td += s.duration_mins || 0
          })
          topGenres = Object.entries(gc).sort((a, b) => b[1] - a[1]).map(([g]) => g)
          prefersSeries = sc >= snc
          avgDuration = Math.round(td / played.length)
        }
      }
    }

    const filtered = data.filter((s: any) => !ex.has(s.id))
    const seriesMap = new Map<string, SeriesGroup>()
    const singles: Story[] = []

    filtered.forEach((story: any) => {
      if (story.series_id) {
        if (seriesMap.has(story.series_id)) {
          const g = seriesMap.get(story.series_id)!
          g.episode_count++; g.total_duration_mins += story.duration_mins || 0
          g.avg_episode_duration = Math.round(g.total_duration_mins / g.episode_count)
        } else {
          seriesMap.set(story.series_id, { id: story.series_id, series_name: story.series_name || story.title, genre: story.genre, author: story.author || null, episode_count: 1, total_duration_mins: story.duration_mins || 0, cover_url: story.cover_url, description: null, avg_episode_duration: story.duration_mins || 0 })
        }
      } else {
        singles.push(story)
      }
    })

    const seriesList = Array.from(seriesMap.values()).filter(g => g.episode_count > 1)

    function scoreStory(s: Story): number {
      let score = 0
      const gr = topGenres.indexOf(s.genre)
      if (gr === 0) score += 30; else if (gr === 1) score += 20; else if (gr >= 2) score += 10
      const dd = Math.abs((s.duration_mins || 0) - avgDuration)
      if (dd <= 5) score += 15; else if (dd <= 10) score += 8
      return score
    }

    function scoreSeries(g: SeriesGroup): number {
      let score = 0
      const gr = topGenres.indexOf(g.genre)
      if (gr === 0) score += 30; else if (gr === 1) score += 20; else if (gr >= 2) score += 10
      if (prefersSeries) score += 20
      const dd = Math.abs(g.avg_episode_duration - avgDuration)
      if (dd <= 5) score += 15; else if (dd <= 10) score += 8
      return score
    }

    const all = [
      ...singles.map(s => ({ type: 'single' as const, story: s, score: scoreStory(s) })),
      ...seriesList.map(g => ({ type: 'series' as const, group: g, score: scoreSeries(g) }))
    ].sort((a, b) => b.score - a.score)

    setDisplayItems(all.slice(0, 5).map(item => item.type === 'series' ? { type: 'series', group: item.group } : { type: 'single', story: item.story }))
    setLoading(false)
  }

  if (loading) return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>RECOMMENDED FOR YOU</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[1,2,3].map(i => <div key={i} className="bg-slate-800 rounded-xl animate-pulse" style={{ height: '80px' }} />)}
      </div>
    </section>
  )
  if (!displayItems.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>RECOMMENDED FOR YOU</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {displayItems.map(item => {
          if (item.type === 'series') {
            return <SeriesCard key={'series-' + item.group.id} id={item.group.id} series_name={item.group.series_name} genre={item.group.genre} author={item.group.author} episode_count={item.group.episode_count} total_duration_mins={item.group.total_duration_mins} cover_url={item.group.cover_url} description={item.group.description} />
          }
          return (
            <div key={item.story.id} onClick={() => router.push('/player/' + item.story.id)} style={{ cursor: 'pointer' }}>
              <HorizontalStoryCard id={item.story.id} title={item.story.title} genre={item.story.genre} author={item.story.author || 'Endless Tales'} duration_mins={item.story.duration_mins} cover_url={item.story.cover_url} avg_rating={item.story.avg_rating} review_count={item.story.review_count} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
