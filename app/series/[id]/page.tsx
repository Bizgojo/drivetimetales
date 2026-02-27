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
  const [ownedEpisodes, setOwnedEpisodes] = useState<Set<string>>(new Set())
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set())
  const [userCredits, setUserCredits] = useState(9999)
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
  const [showRestartModal, setShowRestartModal] = useState<string | null>(null)
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

  // Sync credits from auth context as fallback
  useEffect(() => {
    if (user?.credits !== undefined && user.credits > 0 && userCredits === 0) {
      setUserCredits(user.credits)
    }
  }, [user?.credits])

  const fetchSeriesData = async () => {
    try {
      // Get user credits
      if (user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single()
        if (userData) setUserCredits(9999) // Credits disabled - unlimited plan
      }

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
            const owned = new Set<string>()
            progressData.forEach(p => {
              progress[p.story_id] = {
                story_id: p.story_id,
                progress_seconds: p.progress || 0,
                completed: p.completed || false
              }
              // If it's in user_library, the user already owns it
              owned.add(p.story_id)
            })
            setUserProgress(progress)
            setOwnedEpisodes(owned)
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

  // Calculate unfinished episodes stats
  const unfinishedEpisodes = episodes.filter(ep => !userProgress[ep.id]?.completed)
  const unfinishedCount = unfinishedEpisodes.length
  // Only count credits for episodes NOT already owned
  const unfinishedCredits = unfinishedEpisodes.reduce((sum, ep) => 
    sum + (ownedEpisodes.has(ep.id) ? 0 : ep.credits), 0)
  const unfinishedMins = unfinishedEpisodes.reduce((sum, ep) => sum + ep.duration_mins, 0)
  const unfinishedHours = Math.floor(unfinishedMins / 60)
  const unfinishedRemMins = unfinishedMins % 60
  const unfinishedTimeText = unfinishedHours > 0 
    ? `${unfinishedHours}h ${unfinishedRemMins}m` 
    : `${unfinishedRemMins}m`

  // Calculate selected episodes stats
  const selectedArray = episodes.filter(ep => selectedEpisodes.has(ep.id))
  // Only charge for episodes not already owned
  const selectedCredits = selectedArray.reduce((sum, ep) => 
    sum + (ownedEpisodes.has(ep.id) ? 0 : ep.credits), 0)

  const selectAllUnfinished = () => {
    if (userCredits < unfinishedCredits) {
      setShowInsufficientCredits(true)
      return
    }
    const unfinishedIds = new Set(unfinishedEpisodes.map(ep => ep.id))
    setSelectedEpisodes(unfinishedIds)
  }

  const goToPlayer = (startFromBeginning?: boolean) => {
    // If no episodes manually selected, auto-select all unfinished
    let episodesToPlay = episodes.filter(ep => selectedEpisodes.has(ep.id))
    if (episodesToPlay.length === 0) {
      episodesToPlay = unfinishedEpisodes.length > 0 ? unfinishedEpisodes : episodes
    }
    
    // Only charge for episodes NOT already owned
    const totalCredits = episodesToPlay.reduce((sum, ep) => 
      sum + (ownedEpisodes.has(ep.id) ? 0 : ep.credits), 0)
    
    // Check credits
    if (userCredits < totalCredits) {
      setShowInsufficientCredits(true)
      return
    }
    
    const playlist = episodesToPlay.map(ep => {
      const progress = userProgress[ep.id]
      // Resume 5 seconds before where they stopped (minimum 0)
      const resumePosition = (!startFromBeginning && progress && !progress.completed && progress.progress_seconds > 5) 
        ? Math.max(0, progress.progress_seconds - 5) 
        : 0
      return {
        id: ep.id,
        title: ep.title,
        episode_number: ep.episode_number,
        series_name: seriesInfo?.name,
        resume_seconds: resumePosition
      }
    })
    localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_series_index', '0')
    router.push('/player/series')
  }

  // Play a single episode directly (tap the play icon)
  const playSingleEpisode = (ep: Episode, startFromBeginning?: boolean) => {
    const creditsNeeded = ownedEpisodes.has(ep.id) ? 0 : ep.credits
    if (userCredits < creditsNeeded) {
      setShowInsufficientCredits(true)
      return
    }
    const progress = userProgress[ep.id]
    const resumePosition = (!startFromBeginning && progress && !progress.completed && progress.progress_seconds > 5)
      ? Math.max(0, progress.progress_seconds - 5)
      : 0
    const playlist = [{
      id: ep.id,
      title: ep.title,
      episode_number: ep.episode_number,
      series_name: seriesInfo?.name,
      resume_seconds: resumePosition
    }]
    localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_series_index', '0')
    router.push('/player/series')
  }

  const saveSeries = () => {
    // Save series info to localStorage for home page to display
    const seriesSave = {
      series_id: seriesId,
      series_name: seriesInfo?.name || '',
      cover_url: seriesInfo?.cover_url || null,
      genre: seriesInfo?.genre || '',
      author: seriesInfo?.author || '',
      total_episodes: episodes.length,
      total_duration_mins: episodes.reduce((sum, ep) => sum + ep.duration_mins, 0),
      saved_at: new Date().toISOString(),
      episodes: episodes.map(ep => ({
        id: ep.id,
        title: ep.title,
        episode_number: ep.episode_number,
      }))
    }
    localStorage.setItem('dtt_saved_series', JSON.stringify(seriesSave))
    router.push('/home')
  }

  const totalEpisodes = episodes.length
  const totalDuration = episodes.reduce((sum, ep) => sum + (ep.duration_mins || 0), 0)
  const hours = Math.floor(totalDuration / 60)
  const mins = totalDuration % 60
  const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  const shortDescription = seriesInfo?.description 
    ? seriesInfo.description.split(' ').slice(0, 30).join(' ') + (seriesInfo.description.split(' ').length > 30 ? '...' : '')
    : ''

  // Check if anything is selected (for sticky button)
  const hasSelection = selectedEpisodes.size > 0

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
    <div className="min-h-screen bg-slate-950 text-white" style={{ paddingBottom: '80px' }}>
      <StickyHeaderFull />
      
      <div className="sticky top-[60px] z-40 bg-slate-900 border-b border-slate-700">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-white mb-2">{seriesInfo.name}</h1>
          <p className="text-white text-sm leading-relaxed mb-3">{shortDescription}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <span className="text-white text-sm">{totalEpisodes} episode{totalEpisodes !== 1 ? 's' : ''}</span>
            <span className="text-white text-sm">•</span>
            <span className="text-white text-sm">{durationText} total</span>
            <span className="text-white text-sm">•</span>
            <span className="text-orange-400 text-sm">{seriesInfo.genre}</span>
          </div>
          
          {/* Play from Beginning + Continue buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
            {/* Play from Beginning - always shown */}
            <button
              onClick={() => goToPlayer(true)}
              style={{
                flex: 1,
                padding: '14px 12px',
                backgroundColor: '#f97316',
                color: 'black',
                fontWeight: 700,
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ▶ Play from Beginning
            </button>

            {/* Continue - only shown if user has progress */}
            {(() => {
              const lastEp = episodes.find(ep => 
                userProgress[ep.id] && !userProgress[ep.id].completed && userProgress[ep.id].progress_seconds > 0
              )
              const allCompleted = episodes.length > 0 && episodes.every(ep => userProgress[ep.id]?.completed)

              if (allCompleted) {
                return (
                  <button
                    onClick={() => goToPlayer(true)}
                    style={{
                      flex: 1,
                      padding: '14px 12px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      fontWeight: 700,
                      borderRadius: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    🔄 Play Again
                  </button>
                )
              }

              if (lastEp) {
                const resumeSeconds = Math.max(0, userProgress[lastEp.id].progress_seconds - 3)
                return (
                  <button
                    onClick={() => {
                      const playlist = [{
                        id: lastEp.id,
                        title: lastEp.title,
                        episode_number: lastEp.episode_number,
                        series_name: seriesInfo?.name,
                        resume_seconds: resumeSeconds
                      }]
                      localStorage.setItem('dtt_series_playlist', JSON.stringify(playlist))
                      localStorage.setItem('dtt_series_index', '0')
                      router.push('/player/series')
                    }}
                    style={{
                      flex: 1,
                      padding: '14px 12px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      fontWeight: 700,
                      borderRadius: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    ▶ Continue
                  </button>
                )
              }

              return null
            })()}
          </div>
          
          {/* Instruction text */}
          <p className="text-white text-sm text-center font-bold">
            Or select episodes individually
          </p>
        </div>
      </div>

      <div className="px-4 py-4">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {episodes.map((ep) => {
            const progress = userProgress[ep.id]
            const progressPercent = progress ? progress.completed ? 100 : Math.round((progress.progress_seconds / (ep.duration_mins * 60)) * 100) : 0
            const isSelected = selectedEpisodes.has(ep.id)
            const isOwned = ownedEpisodes.has(ep.id)
            const hasProgress = progress && progress.progress_seconds > 0 && !progress.completed
            const epDescription = ep.description ? ep.description.split(' ').slice(0, 15).join(' ') + (ep.description.split(' ').length > 15 ? '...' : '') : ''

            return (
              <div 
                key={ep.id} 
                onClick={() => toggleEpisodeSelection(ep.id)}
                style={{
                  backgroundColor: isSelected ? '#1e3a2f' : '#1e293b',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #22c55e' : '2px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex' }}>
                  <div style={{ width: '100px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ width: '100px', height: '100px', position: 'relative' }}>
                      <img src={ep.cover_url || seriesInfo.cover_url || '/images/default-cover.png'} alt={ep.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      
                      {/* Selection indicator */}
                      {isSelected && (
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          backgroundColor: '#22c55e',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="text-white text-xs font-medium" style={{ marginBottom: '4px' }}>
                      Episode {ep.episode_number}
                      {isOwned && <span style={{ color: '#22c55e', marginLeft: '8px' }}>✓ Owned</span>}
                    </div>
                    <h3 className="text-white font-bold text-sm" style={{ marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title}</h3>
                    {epDescription && <p className="text-white text-xs" style={{ marginBottom: '8px', opacity: 0.8 }}>{epDescription}</p>}
                    <div className="text-white text-xs font-semibold">
                      {ep.duration_mins} min • {isOwned ? '✓ Owned' : `${ep.credits} credit${ep.credits !== 1 ? 's' : ''}`}
                      {hasProgress && (
                        <span style={{ color: '#f97316', marginLeft: '8px' }}>
                          {Math.round(progress.progress_seconds / 60)}m listened
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress bar at bottom of card */}
                <div style={{ height: '6px', backgroundColor: '#475569', borderRadius: '0 0 10px 10px' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${Math.max(progressPercent, 0)}%`, 
                    backgroundColor: progress?.completed ? '#22c55e' : '#f97316', 
                    borderRadius: progressPercent > 95 ? '0 0 10px 10px' : '0 0 0 10px',
                    transition: 'width 0.3s',
                    minWidth: progressPercent > 0 ? '8px' : '0'
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sticky Bottom - Play Series / Save Series */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#020617',
        padding: '16px',
        borderTop: '1px solid #334155',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => goToPlayer()}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#22c55e',
              color: 'white',
              fontWeight: 700,
              fontSize: '16px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            ▶ Play{hasSelection ? ` (${selectedEpisodes.size})` : ' Series'}
          </button>
          <button
            onClick={saveSeries}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontWeight: 700,
              fontSize: '16px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            💾 Save Series
          </button>
        </div>
      </div>

      {/* Resume / Restart Modal */}
      {showRestartModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '320px',
            width: '100%',
            textAlign: 'center'
          }}>
            {(() => {
              const ep = episodes.find(e => e.id === showRestartModal)
              const progress = userProgress[showRestartModal]
              if (!ep || !progress) return null
              const mins = Math.round(progress.progress_seconds / 60)
              return (
                <>
                  <p className="text-white text-lg font-semibold" style={{ marginBottom: '8px' }}>
                    Episode {ep.episode_number}: {ep.title}
                  </p>
                  <p className="text-white" style={{ marginBottom: '24px', opacity: 0.8 }}>
                    You listened {mins} min of {ep.duration_mins} min
                  </p>
                </>
              )
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => {
                  const ep = episodes.find(e => e.id === showRestartModal)
                  if (ep) {
                    setShowRestartModal(null)
                    playSingleEpisode(ep, false)
                  }
                }}
                style={{
                  padding: '14px 24px',
                  borderRadius: '25px',
                  backgroundColor: '#f97316',
                  color: 'black',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ▶ Resume Where I Left Off
              </button>
              <button
                onClick={() => {
                  const ep = episodes.find(e => e.id === showRestartModal)
                  if (ep) {
                    setShowRestartModal(null)
                    playSingleEpisode(ep, true)
                  }
                }}
                style={{
                  padding: '14px 24px',
                  borderRadius: '25px',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                🔄 Start from Beginning
              </button>
              <button
                onClick={() => setShowRestartModal(null)}
                style={{
                  padding: '14px 24px',
                  borderRadius: '25px',
                  backgroundColor: '#334155',
                  color: 'white',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Credits Modal */}
      {showInsufficientCredits && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '320px',
            width: '100%',
            textAlign: 'center'
          }}>
            <p className="text-white text-lg font-semibold" style={{ marginBottom: '16px' }}>
              Sorry, you have insufficient credits
            </p>
            <p className="text-white" style={{ marginBottom: '24px', opacity: 0.8 }}>
              You need {hasSelection ? selectedCredits : unfinishedCredits} credits but only have {userCredits}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => router.push('/buy-credits')}
                style={{
                  padding: '14px 24px',
                  borderRadius: '25px',
                  backgroundColor: '#f97316',
                  color: 'black',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Get More Credits
              </button>
              <button
                onClick={() => setShowInsufficientCredits(false)}
                style={{
                  padding: '14px 24px',
                  borderRadius: '25px',
                  backgroundColor: '#334155',
                  color: 'white',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
