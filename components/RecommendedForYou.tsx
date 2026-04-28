'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'
import { buildSeriesPlaybackTarget } from '@/lib/seriesPlayback'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  series_id: string | null; series_name: string | null; series_number?: number | null
  description?: string | null
  avg_rating?: number | null; review_count?: number
}
interface SeriesGroup {
  id: string; series_name: string; genre: string; author: string | null; episode_count: number
  total_duration_mins: number; cover_url: string | null; description: string | null
  avg_episode_duration: number
  episodes: Array<{ id: string; episode_number: number }>
  play_episode_id?: string | null
  resume_seconds?: number
  is_in_progress?: boolean
}
type DisplayItem = { type: 'single'; story: Story } | { type: 'series'; group: SeriesGroup }
type LibraryRow = { story_id: string; progress: number | null; completed: boolean | null; not_for_me?: boolean | null; last_played?: string | null }

export default function RecommendedForYou({ excludeIds = [] }: { excludeIds?: string[] }) {
  const router = useRouter()
  const { user } = useAuth()
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [user?.id, excludeIds.join(',')])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('story_analytics')
      .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, description, avg_rating, review_count')
      .not('cover_url', 'is', null).eq('is_hidden', false).limit(100)
    if (!data || !data.length) { setLoading(false); return }

    const storyRows = data as Story[]
    const seriesIds = Array.from(new Set(storyRows.map((story) => story.series_id).filter(Boolean))) as string[]
    if (seriesIds.length > 0) {
      const { data: episodeRows, error: episodeError } = await supabase
        .from('stories')
        .select('id,episode_number')
        .in('series_id', seriesIds)

      if (episodeError) {
        console.warn('[RecommendedForYou] series episode_number lookup failed:', episodeError.message)
      } else {
        const episodeNumberById = new Map((episodeRows || []).map((row: any) => [row.id, row.episode_number || null]))
        storyRows.forEach((story) => {
          if (!story.series_number && episodeNumberById.get(story.id)) {
            story.series_number = episodeNumberById.get(story.id)
          }
        })
      }
    }

    const ex = new Set(excludeIds)
    let userLibraryRows: LibraryRow[] = []
    let topGenres: string[] = []
    let prefersSeries = false
    let avgDuration = 20

    if (user?.id) {
      const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me, last_played').eq('user_id', user.id)
      if (lib) {
        userLibraryRows = lib as LibraryRow[]
        userLibraryRows.forEach((e) => { if (e.progress > 0 || e.completed || e.not_for_me || e.last_played) ex.add(e.story_id) })
        const playedIds = new Set(lib.filter((e: any) => e.last_played || e.progress > 0).map((e: any) => e.story_id))
        const played = storyRows.filter((s: any) => playedIds.has(s.id))
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

    const seriesMap = new Map<string, SeriesGroup>()
    const singles: Story[] = []

    storyRows.forEach((story: any) => {
      if (story.series_id) {
        if (seriesMap.has(story.series_id)) {
          const g = seriesMap.get(story.series_id)!
          g.episode_count++; g.total_duration_mins += story.duration_mins || 0
          g.avg_episode_duration = Math.round(g.total_duration_mins / g.episode_count)
        } else {
          seriesMap.set(story.series_id, {
            id: story.series_id,
            series_name: story.series_name || story.title,
            genre: story.genre,
            author: story.author || null,
            episode_count: 1,
            total_duration_mins: story.duration_mins || 0,
            cover_url: story.cover_url,
            description: story.description || null,
            avg_episode_duration: story.duration_mins || 0,
            episodes: [],
          })
        }
      } else {
        if (!ex.has(story.id)) singles.push(story)
      }
    })

    const seriesList = Array.from(seriesMap.values()).filter(g => storyRows.filter((story) => story.series_id === g.id).length > 1)
    seriesList.forEach((group) => {
      const fullSeriesRows = storyRows
        .filter((story) => story.series_id === group.id)
        .slice()
        .sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
      const episodes = fullSeriesRows
        .map((story, index) => ({ id: story.id, episode_number: story.series_number || index + 1 }))
      group.episode_count = fullSeriesRows.length
      group.total_duration_mins = fullSeriesRows.reduce((sum, story) => sum + (story.duration_mins || 0), 0)
      group.avg_episode_duration = group.episode_count > 0 ? Math.round(group.total_duration_mins / group.episode_count) : 0
      group.cover_url = fullSeriesRows[0]?.cover_url || group.cover_url
      group.description = fullSeriesRows[0]?.description || group.description
      const target = buildSeriesPlaybackTarget(
        episodes,
        userLibraryRows.filter((row) => episodes.some((episode) => episode.id === row.story_id))
      )
      group.episodes = target.playlist
      group.play_episode_id = target.episodeId
      group.resume_seconds = target.resumeSeconds
      group.is_in_progress = target.isInProgress
    })

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
            return <SeriesCard key={'series-' + item.group.id} id={item.group.id} series_name={item.group.series_name} genre={item.group.genre} author={item.group.author} episode_count={item.group.episode_count} total_duration_mins={item.group.total_duration_mins} cover_url={item.group.cover_url} description={item.group.description} episodes={item.group.episodes} play_episode_id={item.group.play_episode_id} resume_seconds={item.group.resume_seconds} is_in_progress={item.group.is_in_progress} />
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
