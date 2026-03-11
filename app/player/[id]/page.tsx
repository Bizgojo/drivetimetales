'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; author: string; audio_url: string
  cover_url: string | null; duration_mins: number
}

interface QueueItem {
  url: string; type: 'intro' | 'story' | 'outro'; label: string
}

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const storyId = params.id as string
  const audioRef = useRef<HTMLAudioElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const crossfadeTimer = useRef<NodeJS.Timeout | null>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const resumeRef = useRef(0)
  const currentQueueType = useRef<'intro' | 'story' | 'outro'>('intro')

  const [story, setStory] = useState<Story & { intro_audio_url?: string; outro_audio_url?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const segmentDurationsRef = useRef<number[]>([]) // duration of each segment as it loads
  const [totalDuration, setTotalDuration] = useState(0)
  const [cumulativeTime, setCumulativeTime] = useState(0)
  const completedSecsRef = useRef(0) // total seconds of completed segments
  const [hasProgress, setHasProgress] = useState(false)

  // ASC3 playlist state
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [introOutroMusicUrl, setIntroOutroMusicUrl] = useState('')
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState<string | null>(null)
  const [isASC3, setIsASC3] = useState(false)
  const [sectionLabel, setSectionLabel] = useState('')
  const musicVolume = 0.04

  // Load story + playlist
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('stories')
        .select('id, title, author, audio_url, cover_url, duration_mins, intro_audio_url, outro_audio_url')
        .eq('id', storyId).single()
      if (data) setStory(data)

      // Build initial queue from DB fields immediately (works without extra API call)
      if (data?.intro_audio_url || data?.outro_audio_url) {
        const INTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
        const initialQueue: QueueItem[] = []
        if (data.intro_audio_url) initialQueue.push({ url: data.intro_audio_url, type: 'intro', label: 'Intro' })
        if (data.audio_url) initialQueue.push({ url: data.audio_url, type: 'story', label: 'Story' })
        if (data.outro_audio_url) initialQueue.push({ url: data.outro_audio_url, type: 'outro', label: 'Outro' })
        setQueue(initialQueue)
        setIntroOutroMusicUrl(INTRO_MUSIC)
        setIsASC3(true)
      }

      // Enhance with full segment list + background music from playlist API
      try {
        const res = await fetch(`/api/asc3/story-playlist?storyId=${storyId}`)
        if (res.ok) {
          const playlist = await res.json()
          if (playlist.queue?.length > 1) {
            setQueue(playlist.queue)
            setIntroOutroMusicUrl(playlist.introOutroMusicUrl || '')
            setBackgroundMusicUrl(playlist.backgroundMusicUrl || null)
            setIsASC3(true)
          }
        }
      } catch (e) { /* playlist enhancement optional */ }

      if (user?.id) {
        const { data: lib } = await supabase.from('user_library')
          .select('progress, completed').eq('user_id', user.id).eq('story_id', storyId).single()
        if (lib && lib.progress > 0) {
          resumeRef.current = lib.completed ? 0 : Math.max(0, lib.progress - 3)
          setCurrentTime(resumeRef.current)
          setHasProgress(true)
        }
      }
      setLoading(false)
    }
    load()
  }, [storyId, user])

  // When queue loads AND component is fully rendered, initialize audio src
  useEffect(() => {
    if (!isASC3 || !queue.length || loading) return
    if (!audioRef.current) return
    // Only set src if not already set (avoid overwriting on playlist enhancement)
    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      audioRef.current.src = queue[0].url
      audioRef.current.load()
    }
    setSectionLabel(queue[0].label)
    applyMusic(queue[0].type)
  }, [isASC3, queue, loading])

  // Smooth crossfade between two music sources over durationMs
  const crossfadeTo = (newSrc: string, durationMs = 5000) => {
    if (!musicRef.current) return
    if (crossfadeTimer.current) clearInterval(crossfadeTimer.current)

    const outgoing = musicRef.current
    const startVol = outgoing.volume || musicVolume

    // Create a temporary audio element for the incoming track
    const incoming = new Audio(newSrc)
    incoming.loop = true
    incoming.volume = 0
    incoming.play().catch(() => {})

    const steps = 50
    const stepMs = durationMs / steps
    let step = 0

    crossfadeTimer.current = setInterval(() => {
      step++
      const progress = step / steps
      outgoing.volume = Math.max(0, startVol * (1 - progress))
      incoming.volume = Math.min(musicVolume, musicVolume * progress)

      if (step >= steps) {
        clearInterval(crossfadeTimer.current!)
        outgoing.pause()
        // Swap incoming into musicRef
        musicRef.current = incoming
        outgoing.src = ''
      }
    }, stepMs)
  }

  const applyMusic = (type: 'intro' | 'story' | 'outro') => {
    const newSrc = (type === 'story' && backgroundMusicUrl) ? backgroundMusicUrl : introOutroMusicUrl
    if (!newSrc || !musicRef.current) return
    currentQueueType.current = type
    // Only swap if src is different and not already playing the right track
    if (!musicRef.current.src?.includes(newSrc.split('/').pop() || '')) {
      musicRef.current.src = newSrc
      musicRef.current.loop = true
      musicRef.current.volume = musicVolume
      if (isPlaying) musicRef.current.play().catch(() => {})
    }
  }

  // Schedule a crossfade N seconds before the current audio ends
  const scheduleCrossfadeRef = useRef<NodeJS.Timeout | null>(null)
  const scheduleCrossfade = (newSrc: string, leadSec = 4) => {
    if (scheduleCrossfadeRef.current) clearTimeout(scheduleCrossfadeRef.current)
    const audio = audioRef.current
    if (!audio || !audio.duration || isNaN(audio.duration)) return
    const remaining = audio.duration - audio.currentTime
    const delay = Math.max(0, (remaining - leadSec) * 1000)
    scheduleCrossfadeRef.current = setTimeout(() => {
      crossfadeTo(newSrc, leadSec * 1000)
    }, delay)
  }

  const advanceQueue = () => {
    // Add completed segment to cumulative counter
    completedSecsRef.current += segmentDurationsRef.current[queueIndex] || duration
    const nextIndex = queueIndex + 1
    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex)
      const next = queue[nextIndex]
      setSectionLabel(next.label)
      const prevType = currentQueueType.current
      currentQueueType.current = next.type
      if (audioRef.current) {
        audioRef.current.src = next.url
        audioRef.current.load()
        setTimeout(() => {
          audioRef.current?.play().catch(() => {})
          if (isPlaying && musicRef.current?.paused) musicRef.current.play().catch(() => {})
        }, 100)
      }
    } else {
      // Story finished — fade out music then navigate
      if (musicRef.current) {
        const vol = musicRef.current.volume
        let step = 0
        const fadeOut = setInterval(() => {
          step++
          if (musicRef.current) musicRef.current.volume = Math.max(0, vol * (1 - step / 20))
          if (step >= 20) { clearInterval(fadeOut); musicRef.current?.pause() }
        }, 150)
      }
      setIsPlaying(false)
      saveProgress(duration, true)
      setTimeout(() => router.push('/library'), 3000)
    }
  }

  const saveProgress = async (time: number, completed = false) => {
    if (user?.id && storyId) {
      await supabase.from('user_library').upsert({
        user_id: user.id, story_id: storyId,
        progress: Math.floor(time), completed,
        last_played: new Date().toISOString()
      })
    }
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      musicRef.current?.pause()
      saveProgress(currentTime)
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true)
        if (musicRef.current && musicRef.current.src) {
          // Fade music in from 0 over 2 seconds
          musicRef.current.volume = 0
          musicRef.current.play().catch(() => {})
          let step = 0
          const fadeIn = setInterval(() => {
            step++
            if (musicRef.current) musicRef.current.volume = Math.min(musicVolume, musicVolume * (step / 20))
            if (step >= 20) clearInterval(fadeIn)
          }, 100)
        }
      }).catch(() => {})
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const newTime = ((e.clientX - rect.left) / rect.width) * duration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleNotForMe = async () => {
    audioRef.current?.pause()
    musicRef.current?.pause()
    if (user?.id) {
      await supabase.from('user_library').upsert({
        user_id: user.id, story_id: storyId, not_for_me: true,
        progress: Math.floor(currentTime), last_played: new Date().toISOString()
      })
    }
    router.push('/library')
  }

  const handleBack = () => {
    audioRef.current?.pause()
    musicRef.current?.pause()
    saveProgress(currentTime)
    router.push('/library')
  }

  const handleStartOver = () => {
    if (isASC3 && queue.length) {
      setQueueIndex(0)
      setSectionLabel(queue[0].label)
      applyMusic(queue[0].type)
      if (audioRef.current) {
        audioRef.current.src = queue[0].url
        audioRef.current.load()
        setTimeout(() => {
          audioRef.current?.play().catch(() => {})
          musicRef.current?.play().catch(() => {})
          setIsPlaying(true)
        }, 100)
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
    }
    setCurrentTime(0)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const effectiveTotalDuration = totalDuration > 0 ? totalDuration : (story?.duration_mins || 0) * 60
  const effectiveCurrent = isASC3 ? cumulativeTime : currentTime
  const timeRemaining = effectiveTotalDuration > 0 ? Math.max(0, effectiveTotalDuration - effectiveCurrent) : 0
  const progressPct = effectiveTotalDuration > 0 ? Math.min(100, (effectiveCurrent / effectiveTotalDuration) * 100) : 0

  if (loading) return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!story) return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <p>Story not found</p>
      <button onClick={() => router.back()} style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', marginTop: '12px' }}>Go Back</button>
    </div>
  )

  return (
    <div style={{ height: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Hidden audio elements */}
      <audio ref={audioRef}
        onLoadedMetadata={(e) => {
          const segDur = e.currentTarget.duration
          setDuration(segDur)
          // Track per-segment durations for total progress bar
          segmentDurationsRef.current[queueIndex] = segDur
          const total = segmentDurationsRef.current.reduce((a, b) => a + (b || 0), 0)
          if (total > 0) setTotalDuration(total)
          // Schedule crossfade 4s before intro ends → story music fades in before narrator starts
          if (currentQueueType.current === 'intro' && backgroundMusicUrl) {
            scheduleCrossfade(backgroundMusicUrl, 4)
          }
          // Schedule crossfade 4s before last story segment ends → outro music fades in
          if (currentQueueType.current === 'story') {
            const nextIdx = queueIndex + 1
            if (nextIdx < queue.length && queue[nextIdx]?.type === 'outro') {
              scheduleCrossfade(introOutroMusicUrl, 4)
            }
          }
        }}
        onTimeUpdate={(e) => {
          const cum = completedSecsRef.current + e.currentTarget.currentTime
          setCumulativeTime(cum)
          const t = e.currentTarget.currentTime
          setCurrentTime(t)
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => saveProgress(t), 5000)
        }}
        onEnded={() => isASC3 ? advanceQueue() : (setIsPlaying(false), saveProgress(duration, true), setTimeout(() => router.push('/library'), 1500))}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onCanPlay={() => {
          if (!isASC3 && audioRef.current && resumeRef.current > 0) {
            audioRef.current.currentTime = resumeRef.current
          }
          if (audioRef.current) setDuration(audioRef.current.duration)
        }}
        src={!isASC3 ? story.audio_url : undefined}
      />
      <audio ref={musicRef} loop style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ padding: '10px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
        <button onClick={handleBack} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <span style={{ fontWeight: 800, fontSize: '18px', color: 'white' }}>Endless <span style={{ color: '#f97316' }}>Tales</span></span>
        </div>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: 'white' }}>
          {user?.email?.[0]?.toUpperCase() || 'M'}
        </div>
      </div>

      {/* Cover image */}
      <div style={{ width: '100vw', aspectRatio: '1', flexShrink: 0, overflow: 'hidden' }}>
        {story.cover_url
          ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#475569,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>🎧</div>}
      </div>

      {/* Controls */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'white', textAlign: 'center', lineHeight: 1.2 }}>{story.title}</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0', textAlign: 'center' }}>
            by {story.author || 'Endless Tales'} · {formatTime(timeRemaining)} remaining
          </p>
          {isASC3 && sectionLabel && isPlaying && (
            <p style={{ color: '#f97316', fontSize: '11px', margin: '4px 0 0', textAlign: 'center', fontWeight: 600 }}>
              🎙️ {sectionLabel} · {queueIndex + 1}/{queue.length}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div onClick={handleSeek} style={{ height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden', cursor: 'pointer' }}>
            <div style={{ height: '100%', backgroundColor: '#f97316', width: `${progressPct}%`, transition: 'width 0.1s', borderRadius: '3px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handlePlayPause} style={{ flex: 2, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color: 'white', transition: 'background 0.2s' }}>
            {isPlaying ? '⏸ Pause' : hasProgress ? '▶ Continue' : '▶ Play'}
          </button>
          {hasProgress ? (
            <button onClick={handleStartOver} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#1e293b', color: '#94a3b8' }}>
              Start Over
            </button>
          ) : (
            <button onClick={handleNotForMe} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#1e293b', color: '#94a3b8' }}>
              Not for Me
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PlayerContent />
    </Suspense>
  )
}
