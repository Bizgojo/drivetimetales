'use client'
import React, { useState, useEffect, useMemo } from 'react'
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

type SelectionMode = 'all' | 'continue' | 'pick'

export default function SeriesDetailPage() {
  const params = useParams()
  const router = useRouter()
  const seriesId = params.id as string
  const { user } = useAuth()

  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({})
  const [ownedEpisodes, setOwnedEpisodes] = useState<Set<string>>(new Set())
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('all')
  const [seriesInfo, setSeriesInfo] = useState<{
    name: string
    description: string
    genre: string
    author: string
    cover_url: string | null
  } | null>(null)

  useEffect(() => {
    if (seriesId) fetchSeriesData()
  }, [seriesId, user?.id])

  // Auto-apply selection when mode changes
  useEffect(() => {
    if (episodes.length === 0) return
    if (selectionMode === 'all') {
      setSelectedEpisodes(new Set(episodes.map(ep => ep.id)))
    } else if (selectionMode === 'continue') {
      applyContineFromMode()
    } else {
      // Pick mode — clear selection, user picks manually
      setSelectedEpisodes(new Set())
    }
  }, [selectionMode, episodes])

  const applyContineFromMode = () => {
    // Priority 1: last in-progress episode (started but not finished)
    const lastInProgress = [...episodes].reverse().find(ep =>
      userProgress[ep.id] && !userProgress[ep.id].completed && userProgress[ep.id].progress_seconds > 0
    )
    // Priority 2: first episode after the last completed one
    let firstAfterCompleted: Episode | undefined
    for (let i = episodes.length - 1; i >= 0; i--) {
      if (userProgress[episodes[i].id]?.completed) {
        firstAfterCompleted = episodes[i + 1]
        break
      }
    }
    // Priority 3: first unstarted episode
    const firstUnplayed = episodes.find(ep => !userProgress[ep.id] || userProgress[ep.id].progress_seconds === 0)
    const startEp = lastInProgress || firstAfterCompleted || firstUnplayed || episodes[0]
    if (!startEp) return
    // Select from that episode forward
    const startIdx = episodes.findIndex(ep => ep.id === startEp.id)
    const toSelect = episodes.slice(startIdx).map(ep => ep.id)
    setSelectedEpisodes(new Set(toSelect))
  }

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
          .select('id, title, description, duration_mins, credits, cover_url, episode_number, series_name, genre, author')
          .eq('id', seriesId)
        episodesData = storyData
      }

      if (episodesData) {
        setEpisodes(episodesData)
        // Auto-select all on load
        setSelectedEpisodes(new Set(episodesData.map((ep: Episode) => ep.id)))

        const firstEp = episodesData[0]
        if (firstEp) {
          // Try to get the series cover from the series table
          const { data: seriesRow } = await supabase
            .from('series')
            .select('cover_image, title')
            .eq('id', seriesId)
            .single()
          setSeriesInfo({
            name: seriesRow?.title || firstEp.series_name || firstEp.title,
            description: firstEp.description || '',
            genre: firstEp.genre || '',
            author: firstEp.author || '',
            cover_url: seriesRow?.cover_image || firstEp.cover_url || null,
          })
        }
      }

      if (user?.id) {
        const ids = (episodesData || []).map((ep: Episode) => ep.id)
        const { data: progressData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', user.id)
          .in('story_id', ids)

        if (progressData) {
          const progressMap: Record<string, UserProgress> = {}
          const owned = new Set<string>()
          progressData.forEach((p: any) => {
            progressMap[p.story_id] = {
              story_id: p.story_id,
              progress_seconds: p.progress || 0,
              completed: p.completed || false,
            }
            owned.add(p.story_id)
          })
          setUserProgress(progressMap)
          setOwnedEpisodes(owned)
        }
      }
    } catch (err) {
      console.error('fetchSeriesData error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleEpisodeSelection = (id: string) => {
    if (selectionMode !== 'pick') return // Only toggle in pick mode
    setSelectedEpisodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Stats
  const selectedArray = useMemo(() => episodes.filter(ep => selectedEpisodes.has(ep.id)), [episodes, selectedEpisodes])
  const selectedMins = useMemo(() => selectedArray.reduce((sum, ep) => sum + ep.duration_mins, 0), [selectedArray])
  const totalEpisodes = episodes.length
  const totalMins = episodes.reduce((sum, ep) => sum + ep.duration_mins, 0)
  const totalHours = Math.floor(totalMins / 60)
  const totalRemMins = totalMins % 60
  const durationText = totalHours > 0 ? `${totalHours}h ${totalRemMins}m` : `${totalRemMins}m`

  const saveSeries = async () => {
    if (!user?.id) return
    const toSave = selectedArray.length > 0 ? selectedArray : episodes
    const upserts = toSave.map(ep => ({
      user_id: user.id,
      story_id: ep.id,
      progress: 0,
      completed: false,
      hide_from_home: false,
      last_played: new Date().toISOString(),
    }))
    await supabase.from('user_library').upsert(upserts)
    router.push('/home')
  }

  const goToPlayer = () => {
    const toPlay = selectedArray.length > 0 ? selectedArray : episodes
    // Start with the first selected episode, resuming if in-progress
    const firstEp = toPlay[0]
    if (!firstEp) return
    const progress = userProgress[firstEp.id]
    const resumeAt = (progress && !progress.completed && progress.progress_seconds > 5)
      ? Math.max(0, progress.progress_seconds - 3) : 0
    // Store the full playlist for auto-advance (future use)
    const playlist = toPlay.map(ep => ({ id: ep.id, episode_number: ep.episode_number }))
    localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_series_index', '0')
    // Route to existing player with resume position
    router.push(`/player/${firstEp.id}?resume=${resumeAt}`)
  }

  if (loading) return <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#64748b', fontSize: '14px' }}>Loading...</div></div>
  if (!seriesInfo) return null

  const selModes: { key: SelectionMode; label: string }[] = [
    { key: 'all', label: 'Select All' },
    { key: 'continue', label: 'Continue' },
    { key: 'pick', label: 'Pick Episodes' },
  ]

  return (
    <div style={{ background: '#020617', minHeight: '100vh', paddingBottom: '100px' }}>
      <StickyHeaderFull />

      {/* Hero — cover + title + meta, no description */}
      <div style={{ padding: '16px 16px 0', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div style={{ width: 120, height: 120, borderRadius: 10, overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 20px rgba(255,255,255,0.15)' }}>
          <img src={seriesInfo.cover_url || '/images/default-cover.png'} alt={seriesInfo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 800, fontSize: 17, color: 'white', lineHeight: 1.2, marginBottom: 4 }}>{seriesInfo.name}</h1>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
            {totalEpisodes} episodes · <span style={{ color: '#f97316', fontWeight: 700 }}>{durationText} total</span>
          </div>

        </div>
      </div>

      {/* Segmented control */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Episode Selection</div>
        <div style={{ display: 'flex', background: '#0f172a', borderRadius: 10, padding: 3, border: '1px solid #1e293b', gap: 2 }}>
          {selModes.map(m => (
            <button
              key={m.key}
              onClick={() => setSelectionMode(m.key)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8,
                fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: selectionMode === m.key ? '#f97316' : 'transparent',
                color: selectionMode === m.key ? 'white' : '#94a3b8',
                boxShadow: selectionMode === m.key ? '0 2px 8px rgba(249,115,22,0.4)' : 'none',
                transition: 'all 0.15s',
              }}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {/* Selection summary */}
      {selectedEpisodes.size > 0 && (
        <div style={{ margin: '10px 16px 0', background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(249,115,22,0.2)' }}>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>
            <strong style={{ color: '#f97316' }}>{selectedEpisodes.size} episode{selectedEpisodes.size !== 1 ? 's' : ''}</strong> selected · {selectedMins} min
          </span>
          {selectionMode === 'pick' && (
            <button onClick={() => setSelectedEpisodes(new Set())} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
          )}
        </div>
      )}

      {/* Episode list */}
      <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {episodes.map(ep => {
          const progress = userProgress[ep.id]
          const isCompleted = progress?.completed || false
          const isInProgress = progress && progress.progress_seconds > 0 && !isCompleted
          const isSelected = selectedEpisodes.has(ep.id)
          const progressPct = progress ? isCompleted ? 100 : Math.round((progress.progress_seconds / (ep.duration_mins * 60)) * 100) : 0
          const isDisabled = selectionMode === 'continue' && isCompleted

          return (
            <div
              key={ep.id}
              onClick={() => toggleEpisodeSelection(ep.id)}
              style={{
                borderRadius: 12,
                border: `1px solid ${isSelected ? (isInProgress ? '#22c55e' : '#f97316') : 'rgba(148,163,184,0.06)'}`,
                display: 'flex',
                overflow: 'hidden',
                position: 'relative',
                cursor: selectionMode === 'pick' ? 'pointer' : 'default',
                minHeight: 100,
                opacity: isDisabled ? 0.4 : 1,
                background: isSelected && isInProgress ? 'rgba(34,197,94,0.05)' : isSelected ? 'rgba(249,115,22,0.04)' : '#1e293b',
              }}
            >
              {/* Cover */}
              <div style={{ width: 80, height: 80, flexShrink: 0, margin: '10px 0 10px 10px', borderRadius: 6, overflow: 'hidden', boxShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                <img src={ep.cover_url || seriesInfo.cover_url || '/images/default-cover.png'} alt={ep.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              {/* Body */}
              <div style={{ flex: 1, padding: '10px 28px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: isInProgress ? '#22c55e' : '#64748b', fontWeight: 700, marginBottom: 2 }}>
                  Episode {ep.episode_number} · {ep.duration_mins} min
                  {isInProgress && <span style={{ marginLeft: 6 }}>· In progress</span>}
                  {isCompleted && <span style={{ color: '#22c55e', marginLeft: 6 }}>· Completed</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 13, color: 'white', lineHeight: 1.2, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</div>
                {ep.description && (
                  <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ep.description}</p>
                )}
              </div>

              {/* Checkmark — top right */}
              <div style={{
                position: 'absolute', top: 8, right: 8,
                width: 20, height: 20, borderRadius: '50%',
                background: isSelected ? (isInProgress ? '#22c55e' : '#f97316') : 'transparent',
                border: `2px solid ${isSelected ? (isInProgress ? '#22c55e' : '#f97316') : '#334155'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {isSelected && (
                  <svg width="10" height="8" viewBox="0 0 12 9" fill="none">
                    <path d="M1 4l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )}
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

      {/* Sticky bottom */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, #020617 80%, transparent)', padding: '12px 16px 16px', display: 'flex', gap: 10 }}>
        <button
          onClick={saveSeries}
          style={{ flex: 1, padding: '14px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          💾 Save for Later
        </button>
        <button
          onClick={goToPlayer}
          style={{ flex: 1, padding: '14px 10px', background: selectionMode === 'continue' ? '#22c55e' : '#f97316', color: selectionMode === 'continue' ? '#042013' : 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          ▶ {selectionMode === 'continue' ? 'Continue' : 'Play Now'}
        </button>
      </div>
    </div>
  )
}
