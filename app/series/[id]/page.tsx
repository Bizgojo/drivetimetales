'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import SeriesEpisodeCard from '@/components/SeriesEpisodeCard'

interface Series {
  id: string
  title: string
  description: string
  author: string
  genre: string
  cover_url?: string
}

interface Episode {
  id: string
  title: string
  description?: string
  duration_mins: number
  credits: number
  cover_url?: string
  episode_number: number
  series_id: string
}

export default function SeriesDetailPage() {
  const params = useParams()
  const router = useRouter()
  const seriesId = params.id as string
  const { user } = useAuth()
  
  const [series, setSeries] = useState<Series | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [userProgress, setUserProgress] = useState<Record<string, { percent: number, completed: boolean }>>({})

  useEffect(() => {
    if (seriesId) fetchSeriesData()
  }, [seriesId])

  const fetchSeriesData = async () => {
    try {
      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title, description, author, genre, cover_url')
        .eq('id', seriesId)
        .single()
      setSeries(seriesData)

      const { data: episodesData } = await supabase
        .from('stories')
        .select('id, title, description, duration_mins, credits, cover_url, episode_number, series_id')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })
      setEpisodes(episodesData || [])

      if (user?.id && episodesData) {
        const { data: progressData } = await supabase
          .from('user_stories')
          .select('story_id, progress_seconds, completed')
          .eq('user_id', user.id)
          .in('story_id', episodesData.map(e => e.id))
        
        if (progressData) {
          const progress: Record<string, { percent: number, completed: boolean }> = {}
          progressData.forEach(p => {
            const episode = episodesData.find(e => e.id === p.story_id)
            if (episode) {
              const percent = p.completed ? 100 : Math.round((p.progress_seconds / (episode.duration_mins * 60)) * 100)
              progress[p.story_id] = { percent, completed: p.completed }
            }
          })
          setUserProgress(progress)
        }
      }
    } catch (error) {
      console.error('Error fetching series:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalEpisodes = episodes.length
  const totalDuration = episodes.reduce((sum, ep) => sum + (ep.duration_mins || 0), 0)
  const hours = Math.floor(totalDuration / 60)
  const mins = totalDuration % 60
  const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

  const shortDescription = series?.description 
    ? series.description.split(' ').slice(0, 30).join(' ') + (series.description.split(' ').length > 30 ? '...' : '')
    : ''

  const completedCount = Object.values(userProgress).filter(p => p.completed).length
  const nextEpisode = episodes.find(ep => !userProgress[ep.id]?.completed)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-5xl mb-4">😢</div>
            <h2 className="text-white text-xl mb-2">Series Not Found</h2>
            <Link href="/library" className="text-orange-400 hover:underline">← Back to Library</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <StickyHeaderFull />
      
      <div className="sticky top-[60px] z-40 bg-slate-900 border-b border-slate-700">
        <div className="px-4 py-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
              {series.cover_url ? (
                <img src={series.cover_url} alt={series.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-violet-900 flex items-center justify-center">
                  <span className="text-2xl">📺</span>
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-violet-600 text-white text-xs rounded font-semibold">SERIES</span>
              </div>
              <h1 className="text-lg font-bold text-white truncate">{series.title}</h1>
              <p className="text-slate-400 text-sm">{series.genre} • by {series.author}</p>
              <p className="text-slate-300 text-xs mt-1">{totalEpisodes} episodes • {durationText}</p>
            </div>
          </div>
          
          {shortDescription && (
            <p className="text-slate-300 text-sm mt-3 leading-relaxed">{shortDescription}</p>
          )}
          
          <div className="mt-3 flex items-center gap-3">
            {completedCount > 0 && (
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(completedCount / totalEpisodes) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-400">{completedCount}/{totalEpisodes}</span>
              </div>
            )}
            {nextEpisode && (
              <button
                onClick={() => router.push(`/player/${nextEpisode.id}`)}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                ▶ {completedCount > 0 ? 'Continue' : 'Start'} Ep {nextEpisode.episode_number}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <h2 className="text-white font-bold text-lg mb-3">Episodes</h2>
        <div className="space-y-3">
          {episodes.map((ep) => {
            const progress = userProgress[ep.id]
            return (
              <SeriesEpisodeCard
                key={ep.id}
                id={ep.id}
                episode_number={ep.episode_number}
                title={ep.title}
                description={ep.description}
                duration_mins={ep.duration_mins}
                credits={ep.credits || 1}
                cover_url={ep.cover_url || series.cover_url || null}
                progress_percent={progress?.percent || 0}
                is_completed={progress?.completed || false}
              />
            )
          })}
        </div>

        {episodes.length === 0 && (
          <div className="text-center py-12 bg-slate-800 rounded-xl">
            <span className="text-4xl block mb-3">📺</span>
            <p className="text-slate-400">No episodes available yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
