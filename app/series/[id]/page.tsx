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
  const [seriesInfo, setSeriesInfo] = useState<{
    name: string; genre: string; author: string; cover_url: string | null
  } | null>(null)

  useEffect(() => { if (seriesId) fetchSeriesData() }, [seriesId, user?.id])

  const fetchSeriesData = async () => {
    try {
      let { data: episodesData } = await supabase
        .from('stories')
        .select('id, title, description, duration_mins, cover_url, episode_number, series_name, genre, author')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })

      if (!episodesData || episodesData.length === 0) {
        const { data: storyData } = await supabase
          .from('stories')
          .select('id, title, description, duration_mins, cover_url, episode_number, series_name, genre, author')
          .eq('id', seriesId)
        episodesData = storyData
      }

      if (episodesData) {
        if (episodesData.length === 0) { router.replace('/library'); return }
        if (episodesData.length === 1) { router.replace(`/player/${episodesData[0].id}`); return }
        setEpisodes(episodesData)
        const firstEp = episodesData[0]
        const { data: seriesRow } = await supabase.from('series').select('cover_image, title').eq('id', seriesId).single()
        setSeriesInfo({
          name: seriesRow?.title || firstEp.series_name || firstEp.title,
          genre: firstEp.genre || '',
          author: firstEp.author || '',
          cover_url: seriesRow?.cover_image || firstEp.cover_url || null,
        })
      }

      if (user?.id && episodesData) {
        const ids = episodesData.map((ep: Episode) => ep.id)
        const { data: progressData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', user.id)
          .in('story_id', ids)
        if (progressData) {
          const progressMap: Record<string, UserProgress> = {}
          progressData.forEach((p: any) => {
            progressMap[p.story_id] = { story_id: p.story_id, progress_seconds: p.progress || 0, completed: p.completed || false }
          })
          setUserProgress(progressMap)
        }
      }
    } catch (err) {
      console.error('fetchSeriesData error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEpisodeTap = (ep: Episode) => {
    const progress = userProgress[ep.id]
    const resumeAt = (progress && !progress.completed && progress.progress_seconds > 15)
      ? Math.max(0, progress.progress_seconds - 15) : 0
    router.push(`/player/${ep.id}${resumeAt > 0 ? `?resume=${resumeAt}` : ''}`)
  }

  const handlePlayAll = () => {
    if (episodes.length === 0) return
    // Find smart start: last in-progress, or first unstarted, or ep1
    const inProgress = episodes.find(ep => {
      const p = userProgress[ep.id]
      return p && p.progress_seconds > 0 && !p.completed
    })
    const lastCompletedIdx = (() => {
      let idx = -1
      episodes.forEach((ep, i) => { if (userProgress[ep.id]?.completed) idx = i })
      return idx
    })()
    const firstUnstarted = episodes.find(ep => !userProgress[ep.id] || userProgress[ep.id].progress_seconds === 0)
    const startEp = inProgress
      || (lastCompletedIdx >= 0 && lastCompletedIdx < episodes.length - 1 ? episodes[lastCompletedIdx + 1] : undefined)
      || firstUnstarted
      || episodes[0]
    if (!startEp) return
    const startIdx = episodes.findIndex(ep => ep.id === startEp.id)
    const playlist = episodes.slice(startIdx).map(ep => ({ id: ep.id, episode_number: ep.episode_number }))
    localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_series_index', '0')
    const resumeAt = (() => {
      const p = userProgress[startEp.id]
      if (!p || p.progress_seconds === 0) return 0
      if (p.progress_seconds < 120) return 0
      return Math.max(0, p.progress_seconds - 15)
    })()
    router.push(`/player/${startEp.id}${resumeAt > 0 ? `?resume=${resumeAt}` : ''}`)
  }

  const totalMins = episodes.reduce((sum, ep) => sum + ep.duration_mins, 0)
  const totalHours = Math.floor(totalMins / 60)
  const totalRemMins = totalMins % 60
  const durationText = totalHours > 0 ? `${totalHours}h ${totalRemMins}m total` : `${totalRemMins}m total`

  if (loading) return <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#64748b', fontSize: '14px' }}>Loading...</div></div>
  if (!seriesInfo) return null

  return (
    <div style={{ background: '#020617', minHeight: '100vh', paddingBottom: '40px' }}>
      <StickyHeaderFull />

      {/* Hero */}
      <div style={{ padding: '16px 16px 0', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div style={{ width: 100, height: 100, borderRadius: 10, overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 20px rgba(255,255,255,0.15)' }}>
          <img src={seriesInfo.cover_url || '/images/default-cover.png'} alt={seriesInfo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <h1 style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 800, fontSize: 17, color: 'white', lineHeight: 1.2, marginBottom: 4 }}>{seriesInfo.name}</h1>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{seriesInfo.author}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{episodes.length} episodes · <span style={{ color: '#f97316', fontWeight: 700 }}>{durationText}</span></div>
        </div>
      </div>

      {/* Play All button */}
      {(() => {
        const allCompleted = episodes.length > 0 && episodes.every(ep => userProgress[ep.id]?.completed)
        const anyInProgress = episodes.some(ep => {
          const p = userProgress[ep.id]
          return p && p.progress_seconds > 0 && !p.completed
        })
        const btnLabel = allCompleted ? 'Play Again' : anyInProgress ? 'Continue Where You Left Off' : 'Play Series'
        const btnColor = allCompleted ? '#3b82f6' : anyInProgress ? '#22c55e' : '#f97316'
        const btnShadow = allCompleted ? '0 4px 12px rgba(59,130,246,0.35)' : anyInProgress ? '0 4px 12px rgba(34,197,94,0.35)' : '0 4px 12px rgba(249,115,22,0.35)'
        return (
          <div style={{ padding: '14px 16px 0' }}>
            <button
              onClick={handlePlayAll}
              style={{ width: '100%', padding: '14px', background: btnColor, color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: btnShadow }}
            >
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
              {btnLabel}
            </button>
          </div>
        )
      })()}

      {/* Episode list */}
      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Episodes</div>
        {episodes.map((ep, idx) => {
          const progress = userProgress[ep.id]
          const isCompleted = progress?.completed || false
          const isInProgress = progress && progress.progress_seconds > 0 && !isCompleted
          const progressPct = progress ? isCompleted ? 100 : Math.round((progress.progress_seconds / (ep.duration_mins * 60)) * 100) : 0

          // Determine action label
          let actionLabel = 'Play'
          let actionColor = '#f97316'
          if (isCompleted) { actionLabel = 'Play Again'; actionColor = '#3b82f6' }
          else if (isInProgress) { actionLabel = 'Continue'; actionColor = '#22c55e' }

          return (
            <div
              key={ep.id}
              onClick={() => handleEpisodeTap(ep)}
              style={{
                borderRadius: 12,
                border: `1px solid ${isInProgress ? 'rgba(34,197,94,0.2)' : isCompleted ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.06)'}`,
                display: 'flex',
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer',
                minHeight: 90,
                background: '#1e293b',
              }}
            >
              {/* Cover */}
              <div style={{ width: 70, height: 70, flexShrink: 0, margin: '10px 0 10px 10px', borderRadius: 6, overflow: 'hidden', boxShadow: '0 0 12px rgba(255,255,255,0.15)' }}>
                <img src={ep.cover_url || seriesInfo.cover_url || '/images/default-cover.png'} alt={ep.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              {/* Body */}
              <div style={{ flex: 1, padding: '10px 70px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: isInProgress ? '#22c55e' : isCompleted ? '#3b82f6' : '#64748b', fontWeight: 700, marginBottom: 2 }}>
                  Episode {ep.episode_number} · {ep.duration_mins} min
                  {isInProgress && <span style={{ marginLeft: 6 }}>· In progress</span>}
                  {isCompleted && <span style={{ marginLeft: 6 }}>· Completed</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 13, color: 'white', lineHeight: 1.2, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</div>
                {ep.description && (
                  <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ep.description}</p>
                )}
              </div>

              {/* Action pill — right side */}
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ background: actionColor, borderRadius: 20, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width="6" height="8" viewBox="0 0 12 14" fill={isCompleted ? 'white' : isInProgress ? '#042013' : 'white'}><path d="M1 1l10 6-10 6V1z"/></svg>
                  <span style={{ color: isInProgress ? '#042013' : 'white', fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{actionLabel}</span>
                </div>
              </div>

              {/* Progress bar */}
              {progressPct > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#334155' }}>
                  <div style={{ height: '100%', width: `${progressPct}%`, background: isCompleted ? '#22c55e' : '#f97316', transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
