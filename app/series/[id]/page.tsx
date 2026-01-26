'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface Episode {
  id: string
  title: string
  description?: string
  duration_mins: number
  credits: number
  cover_url?: string
  episode_number: number
  series_name: string
  genre: string
  author: string
}

interface UserProgress {
  story_id: string
  progress_seconds: number
  completed: boolean
}

export default function SeriesDetailPage() {
  const params = useParams()
  const router = useRouter()
  const seriesId = params.id as string
  const { user } = useAuth()
  
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({})
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set())
  const [seriesInfo, setSeriesInfo] = useState<{
    name: string
    description: string
    genre: string
    author: string
    cover_url: string | null
  } | null>(null)

  useEffect(() => {
    if (seriesId) fetchSeriesData()
  }, [seriesId])

  const fetchSeriesData = async () => {
    try {
      let { data: episodesData } = await supabase
        .from('stories')
        .select('id, title, description, duration_mins, credits, cover_url, episode_number, series_name, genre, author')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })

      if (!episodesData || episodesData.length === 0) {
        const { data: storyData } = await supabase
          .from('stories')
          .select('series_name')
          .eq('id', seriesId)
          .single()
        
        if (storyData?.series_name) {
          const { data: seriesEpisodes } = await supabase
            .from('stories')
            .select('id, title, description, duration_mins, credits, cover_url, episode_number, series_name, genre, author')
            .eq('series_name', storyData.series_name)
            .order('episode_number', { ascending: true })
          episodesData = seriesEpisodes
        }
      }

      if (episodesData && episodesData.length > 0) {
        const sorted = episodesData.sort((a, b) => {
          if (a.episode_number === null) return 1
          if (b.episode_number === null) return -1
          return (a.episode_number || 0) - (b.episode_number || 0)
        })
        
        const withNumbers = sorted.map((ep, idx) => ({
          ...ep,
          episode_number: ep.episode_number || idx + 1,
          credits: ep.credits || Math.max(1, Math.floor((ep.duration_mins || 15) / 15))
        }))
        
        setEpisodes(withNumbers)
        
        const first = withNumbers[0]
        setSeriesInfo({
          name: first.series_name || first.title,
          description: first.description || `A ${first.genre || 'drama'} series from Drive Time Tales.`,
          genre: first.genre || 'Drama',
          author: first.author || 'Drive Time Tales',
          cover_url: first.cover_url || null
        })

        if (user?.id) {
          const { data: progressData } = await supabase
            .from('user_library')
            .select('story_id, progress, completed')
            .eq('user_id', user.id)
            .in('story_id', withNumbers.map(e => e.id))
          
          if (progressData) {
            const progress: Record<string, UserProgress> = {}
            progressData.forEach(p => {
              progress[p.story_id] = {
                story_id: p.story_id,
                progress_seconds: p.progress || 0,
                completed: p.completed || false
              }
            })
            setUserProgress(progress)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching series:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleEpisodeSelection = (episodeId: string) => {
    const newSelected = new Set(selectedEpisodes)
    if (newSelected.has(episodeId)) {
      newSelected.delete(episodeId)
    } else {
      newSelected.add(episodeId)
    }
    setSelectedEpisodes(newSelected)
  }

  const playAllUnfinished = () => {
    const unfinished = episodes.filter(ep => !userProgress[ep.id]?.completed)
    if (unfinished.length > 0) {
      const playlist = unfinished.map(ep => ({
        id: ep.id,
        title: ep.title,
        episode_number: ep.episode_number,
        series_name: seriesInfo?.name
      }))
      localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
      router.push(`/player/${unfinished[0].id}?series=true`)
    }
  }

  const playSelected = () => {
    if (selectedEpisodes.size === 0) return
    const selected = episodes.filter(ep => selectedEpisodes.has(ep.id))
    const playlist = selected.map(ep => ({
      id: ep.id,
      title: ep.title,
      episode_number: ep.episode_number,
      series_name: seriesInfo?.name
    }))
    localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
    router.push(`/player/${selected[0].id}?series=true`)
  }

  const totalEpisodes = episodes.length
  const totalDuration = episodes.reduce((sum, ep) => sum + (ep.duration_mins || 0), 0)
  const hours = Math.floor(totalDuration / 60)
  const mins = totalDuration % 60
  const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  const unfinishedCount = episodes.filter(ep => !userProgress[ep.id]?.completed).length
  const shortDescription = seriesInfo?.description 
    ? seriesInfo.description.split(' ').slice(0, 30).join(' ') + (seriesInfo.description.split(' ').length > 30 ? '...' : '')
    : ''

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

  if (!seriesInfo || episodes.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-5xl mb-4">😢</div>
            <h2 className="text-white text-xl mb-2">Series Not Found</h2>
            <button onClick={() => router.push('/library')} className="text-orange-400 hover:underline">← Back to Library</button>
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
          <h1 className="text-xl font-bold text-white mb-2">{seriesInfo.name}</h1>
          <p className="text-slate-300 text-sm leading-relaxed mb-3">{shortDescription}</p>
          <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
            <span>{totalEpisodes} episode{totalEpisodes !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{durationText} total</span>
            <span>•</span>
            <span className="text-orange-400">{seriesInfo.genre}</span>
          </div>
          <div className="flex gap-2">
            {unfinishedCount > 0 && (
              <button onClick={playAllUnfinished} className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg text-sm transition-colors">
                ▶ Play All Unfinished ({unfinishedCount})
              </button>
            )}
            {selectedEpisodes.size > 0 && (
              <button onClick={playSelected} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg text-sm transition-colors">
                Play Selected ({selectedEpisodes.size})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="space-y-3">
          {episodes.map((ep) => {
            const progress = userProgress[ep.id]
            const progressPercent = progress ? progress.completed ? 100 : Math.round((progress.progress_seconds / (ep.duration_mins * 60)) * 100) : 0
            const isSelected = selectedEpisodes.has(ep.id)
            const epDescription = ep.description ? ep.description.split(' ').slice(0, 15).join(' ') + (ep.description.split(' ').length > 15 ? '...' : '') : ''

            return (
              <div key={ep.id} className={`bg-slate-800 rounded-xl overflow-hidden transition-all ${isSelected ? 'ring-2 ring-orange-500' : ''}`}>
                <div style={{ display: 'flex' }}>
                  <div onClick={() => router.push(`/player/${ep.id}`)} className="cursor-pointer" style={{ width: '100px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ width: '100px', height: '100px', position: 'relative' }}>
                      <img src={ep.cover_url || seriesInfo.cover_url || '/images/default-cover.png'} alt={ep.title} className="object-cover" style={{ width: '100%', height: '100%' }} />
                      <div style={{ position: 'absolute', top: '6px', left: '6px', backgroundColor: progress?.completed ? '#22c55e' : '#f97316', color: progress?.completed ? 'white' : 'black', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                        {progress?.completed ? '✓' : ep.episode_number}
                      </div>
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#1e293b' }}>
                      <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: progress?.completed ? '#22c55e' : '#f97316', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  
                  <div onClick={() => router.push(`/player/${ep.id}`)} className="flex-1 p-3 cursor-pointer" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="text-white text-xs font-medium mb-1">Episode {ep.episode_number}</div>
                    <h3 className="text-white font-bold text-sm mb-1 line-clamp-1">{ep.title}</h3>
                    {epDescription && <p className="text-slate-300 text-xs mb-2 line-clamp-2">{epDescription}</p>}
                    <div className="text-white text-xs font-semibold">{ep.duration_mins} min • {ep.credits} credit{ep.credits !== 1 ? 's' : ''}</div>
                  </div>
                  
                  <div className="flex items-end p-3" onClick={(e) => { e.stopPropagation(); toggleEpisodeSelection(ep.id) }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: isSelected ? '2px solid #f97316' : '2px solid #475569', backgroundColor: isSelected ? '#f97316' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                      {isSelected && <span style={{ color: 'black', fontSize: '14px', fontWeight: 'bold' }}>✓</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
