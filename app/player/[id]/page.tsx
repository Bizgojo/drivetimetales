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

// Volume constants
const VOL_INTRO  = 0.025  // intro/outro music under Belle B (barely audible)
const VOL_STORY  = 0.035  // story background music (ducked under voices)
const VOL_SWELL  = 0.07   // brief swell between lines (never louder than this)

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const storyId = params.id as string

  // Audio refs — all real DOM elements
  const audioRef   = useRef<HTMLAudioElement>(null) // voice / dialogue
  const musicARef  = useRef<HTMLAudioElement>(null) // music track A
  const musicBRef  = useRef<HTMLAudioElement>(null) // music track B (crossfade target)
  const activeMusic = useRef<'A' | 'B'>('A')        // which track is currently playing

  // Web Audio API — real-time voice level detection for ducking
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const analyserRef    = useRef<AnalyserNode | null>(null)
  const voiceDataRef   = useRef<Float32Array | null>(null)
  const duckLoopRef    = useRef<number | null>(null)   // requestAnimationFrame id
  const isPlayingRef   = useRef(false)                  // ref copy for RAF loop

  const saveTimer   = useRef<NodeJS.Timeout | null>(null)
  const duckTimer   = useRef<NodeJS.Timeout | null>(null)
  const xfadeTimer  = useRef<NodeJS.Timeout | null>(null)
  const schedTimer  = useRef<NodeJS.Timeout | null>(null)
  const nextAudioRef = useRef<HTMLAudioElement | null>(null)
  const resumeRef   = useRef(0)
  const currentQueueType = useRef<'intro' | 'story' | 'outro'>('intro')

  const [story, setStory]   = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [hasProgress, setHasProgress] = useState(false)

  // ASC3 queue state
  const [queue, setQueue]                     = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex]           = useState(0)
  const [isASC3, setIsASC3]                   = useState(false)
  const [sectionLabel, setSectionLabel]       = useState('')
  const introMusicUrlRef  = useRef('')
  const bgMusicUrlRef     = useRef<string | null>(null)

  // Cumulative progress
  const segDursRef   = useRef<number[]>([])
  const completedRef = useRef(0)
  const [totalDur, setTotalDur]         = useState(0)
  const [cumTime, setCumTime]           = useState(0)

  // ── Music helpers ──────────────────────────────────────────────────────────

  const activeRef  = () => activeMusic.current === 'A' ? musicARef.current : musicBRef.current
  const inactiveRef = () => activeMusic.current === 'A' ? musicBRef.current : musicARef.current

  /** Set up Web Audio analyser on the voice element (call inside user gesture) */
  const setupWebAudio = () => {
    if (audioCtxRef.current || !audioRef.current) return
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const source  = ctx.createMediaElementSource(audioRef.current)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)
      analyser.connect(ctx.destination)
      audioCtxRef.current  = ctx
      analyserRef.current  = analyser
      voiceDataRef.current = new Float32Array(analyser.fftSize)
    } catch (e) { console.warn('Web Audio not available', e) }
  }

  /** Real-time duck loop — runs at ~60fps, adjusts music based on voice RMS */
  const startDuckLoop = () => {
    if (duckLoopRef.current) cancelAnimationFrame(duckLoopRef.current)
    const loop = () => {
      if (!isPlayingRef.current) return
      const el = activeRef()
      if (el && analyserRef.current && voiceDataRef.current) {
        analyserRef.current.getFloatTimeDomainData(voiceDataRef.current)
        const rms = Math.sqrt(
          voiceDataRef.current.reduce((s, v) => s + v * v, 0) / voiceDataRef.current.length
        )
        const voiceActive = rms > 0.008
        const target = voiceActive
          ? (currentQueueType.current === 'story' ? VOL_STORY : VOL_INTRO)
          : Math.min(VOL_SWELL, el.volume + 0.002) // gentle rise during silence
        // Smooth approach toward target
        el.volume = Math.max(0, Math.min(VOL_SWELL, el.volume + (target - el.volume) * 0.12))
      }
      duckLoopRef.current = requestAnimationFrame(loop)
    }
    duckLoopRef.current = requestAnimationFrame(loop)
  }

  const stopDuckLoop = () => {
    if (duckLoopRef.current) { cancelAnimationFrame(duckLoopRef.current); duckLoopRef.current = null }
  }

  /** Animate volume of a specific audio element */
  const animateVol = (el: HTMLAudioElement, target: number, ms: number, onDone?: () => void) => {
    const start = el.volume
    const steps = Math.max(10, Math.round(ms / 16))
    const stepMs = ms / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      el.volume = Math.max(0, Math.min(1, start + (target - start) * (step / steps)))
      if (step >= steps) { clearInterval(timer); onDone?.() }
    }, stepMs)
    return timer
  }

  /** Animate the active music track to a target volume, capped at VOL_SWELL */
  const setMusicVol = (target: number, ms = 200) => {
    const el = activeRef()
    if (!el) return
    if (duckTimer.current) clearInterval(duckTimer.current)
    const capped = Math.min(target, VOL_SWELL)
    duckTimer.current = animateVol(el, capped, ms)
  }

  /** Switch active music track — fade out old, fade in new over durationMs */
  const switchMusic = (newSrc: string, targetVol: number, durationMs = 3000) => {
    if (xfadeTimer.current) clearInterval(xfadeTimer.current)
    const outEl = activeRef()
    const inEl  = inactiveRef()
    if (!inEl) return

    inEl.src    = newSrc
    inEl.loop   = true
    inEl.volume = 0
    inEl.play().catch(() => {})

    const steps  = Math.max(20, Math.round(durationMs / 16))
    const stepMs = durationMs / steps
    const startVol = outEl?.volume ?? targetVol
    let step = 0

    xfadeTimer.current = setInterval(() => {
      step++
      const p = step / steps
      if (outEl) outEl.volume = Math.max(0, startVol * (1 - p))
      inEl.volume = Math.min(targetVol, targetVol * p)
      if (step >= steps) {
        clearInterval(xfadeTimer.current!)
        outEl?.pause()
        activeMusic.current = activeMusic.current === 'A' ? 'B' : 'A'
      }
    }, stepMs)
  }

  /** Schedule a music switch N seconds before the current audio ends */
  const scheduleMusicSwitch = (newSrc: string, targetVol: number, leadSec: number) => {
    if (schedTimer.current) clearTimeout(schedTimer.current)
    const audio = audioRef.current
    if (!audio?.duration || isNaN(audio.duration)) return
    const delay = Math.max(0, (audio.duration - audio.currentTime - leadSec) * 1000)
    schedTimer.current = setTimeout(() => switchMusic(newSrc, targetVol, leadSec * 1000), delay)
  }

  // ── Load story + queue ─────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('stories')
        .select('id, title, author, audio_url, cover_url, duration_mins, intro_audio_url, outro_audio_url, background_music_url')
        .eq('id', storyId).single()
      if (data) setStory(data)

      if (data?.intro_audio_url) {
        const INTRO_MUSIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
        introMusicUrlRef.current  = INTRO_MUSIC
        bgMusicUrlRef.current     = data.background_music_url || null

        const q: QueueItem[] = []
        if (data.intro_audio_url) q.push({ url: data.intro_audio_url, type: 'intro',  label: 'Intro' })
        if (data.audio_url)       q.push({ url: data.audio_url,       type: 'story',  label: 'Story' })
        if (data.outro_audio_url) q.push({ url: data.outro_audio_url, type: 'outro',  label: 'Outro' })
        setQueue(q)
        setIsASC3(true)
      }

      // Enhance with full segment list from playlist API
      try {
        const res = await fetch(`/api/asc3/story-playlist?storyId=${storyId}`)
        if (res.ok) {
          const pl = await res.json()
          if (pl.queue?.length > 1) {
            introMusicUrlRef.current = pl.introOutroMusicUrl || introMusicUrlRef.current
            bgMusicUrlRef.current    = pl.backgroundMusicUrl || bgMusicUrlRef.current
            setQueue(pl.queue)
            setIsASC3(true)
          }
        }
      } catch (_) {}

      if (user?.id) {
        const { data: lib } = await supabase.from('user_library')
          .select('progress, completed').eq('user_id', user.id).eq('story_id', storyId).single()
        if (lib?.progress > 0) {
          resumeRef.current = lib.completed ? 0 : Math.max(0, lib.progress - 3)
          setCurrentTime(resumeRef.current)
          setHasProgress(true)
        }
      }
      setLoading(false)
    }
    load()
  }, [storyId, user])

  // Init first segment once ready
  useEffect(() => {
    if (!isASC3 || !queue.length || loading || !audioRef.current) return
    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      audioRef.current.src = queue[0].url
      audioRef.current.load()
    }
    setSectionLabel(queue[0].label)
    currentQueueType.current = queue[0].type
    // Prime intro/outro music on track A
    const mA = musicARef.current
    if (mA && introMusicUrlRef.current) {
      mA.src    = introMusicUrlRef.current
      mA.loop   = true
      mA.volume = 0
    }
  }, [isASC3, queue, loading])

  // ── Queue advance ──────────────────────────────────────────────────────────

  const advanceQueue = () => {
    completedRef.current += segDursRef.current[queueIndex] || duration
    const nextIdx = queueIndex + 1
    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx)
      const next = queue[nextIdx]
      setSectionLabel(next.label)
      currentQueueType.current = next.type

      if (audioRef.current) {
        // Brief swell between lines
        setMusicVol(VOL_SWELL, 60)
        if (nextAudioRef.current?.src?.includes(next.url.split('/').pop() || '')) {
          audioRef.current.src = nextAudioRef.current.src
          nextAudioRef.current = null
        } else {
          audioRef.current.src = next.url
          audioRef.current.load()
        }
        audioRef.current.play().catch(() => {})
      }
    } else {
      // All done — fade out music and navigate
      setMusicVol(0, 2000)
      setIsPlaying(false)
      saveProgress(duration, true)
      setTimeout(() => router.push('/library'), 3000)
    }
  }

  // ── Play / Pause ───────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      activeRef()?.pause()
      saveProgress(currentTime)
      isPlayingRef.current = false
      setIsPlaying(false)
      stopDuckLoop()
    } else {
      setupWebAudio() // initialise Web Audio on first user gesture
      audioRef.current.play().then(() => {
        isPlayingRef.current = true
        setIsPlaying(true)
        const mA = musicARef.current
        if (mA && mA.src) {
          mA.play().catch(() => {})
          animateVol(mA, VOL_INTRO, 2000)
        }
        startDuckLoop()
      }).catch(() => {})
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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const handleNotForMe = async () => {
    audioRef.current?.pause(); activeRef()?.pause()
    if (user?.id) await supabase.from('user_library').upsert({
      user_id: user.id, story_id: storyId, not_for_me: true,
      progress: Math.floor(currentTime), last_played: new Date().toISOString()
    })
    router.push('/library')
  }

  const handleBack = () => {
    audioRef.current?.pause(); activeRef()?.pause()
    saveProgress(currentTime)
    router.push('/library')
  }

  const handleStartOver = () => {
    if (!isASC3 || !queue.length) { audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play(), setIsPlaying(true)); return }
    completedRef.current = 0; segDursRef.current = []
    setQueueIndex(0); setSectionLabel(queue[0].label); currentQueueType.current = 'intro'
    const mA = musicARef.current
    if (mA) { mA.volume = 0; mA.src = introMusicUrlRef.current; mA.loop = true }
    musicBRef.current && (musicBRef.current.pause(), musicBRef.current.src = '')
    activeMusic.current = 'A'
    if (audioRef.current) { audioRef.current.src = queue[0].url; audioRef.current.load() }
    setTimeout(() => { audioRef.current?.play().catch(() => {}); mA && (mA.play().catch(() => {}), animateVol(mA, VOL_INTRO, 2000)); setIsPlaying(true) }, 100)
    setCurrentTime(0); setCumTime(0)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const effectiveTotal   = totalDur > 0 ? totalDur : (story?.duration_mins || 0) * 60
  const effectiveCurrent = isASC3 ? cumTime : currentTime
  const timeRemaining    = Math.max(0, effectiveTotal - effectiveCurrent)
  const progressPct      = effectiveTotal > 0 ? Math.min(100, (effectiveCurrent / effectiveTotal) * 100) : 0

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

      {/* Hidden audio elements — all in DOM for iOS autoplay */}
      <audio ref={audioRef}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          setDuration(d)
          segDursRef.current[queueIndex] = d
          const tot = segDursRef.current.reduce((a, b) => a + (b || 0), 0)
          if (tot > 0) setTotalDur(tot)
          // Schedule crossfade 3s before intro ends → story music fades in
          if (currentQueueType.current === 'intro' && bgMusicUrlRef.current) {
            scheduleMusicSwitch(bgMusicUrlRef.current, VOL_STORY, 3)
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          setCurrentTime(t)
          setCumTime(completedRef.current + t)
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => saveProgress(t), 5000)
          // Preload next segment 3s ahead
          const rem = e.currentTarget.duration - t
          if (rem < 3 && rem > 0 && isASC3) {
            const ni = queueIndex + 1
            if (ni < queue.length && !nextAudioRef.current) {
              const pre = new Audio(queue[ni].url)
              pre.preload = 'auto'; pre.load()
              nextAudioRef.current = pre
            }
          }
        }}
        onPlay={() => {
          isPlayingRef.current = true
          setIsPlaying(true)
        }}
        onPause={() => { isPlayingRef.current = false; setIsPlaying(false) }}
        onEnded={() => {
          if (!isASC3) { setIsPlaying(false); saveProgress(duration, true); setTimeout(() => router.push('/library'), 1500); return }
          const ni = queueIndex + 1
          const isLastStory = currentQueueType.current === 'story' && ni < queue.length && queue[ni]?.type === 'outro'
          if (isLastStory) {
            // Hold 3s of music swell before outro
            setMusicVol(VOL_SWELL, 300)
            switchMusic(introMusicUrlRef.current, VOL_INTRO, 3000)
            setTimeout(() => advanceQueue(), 3000)
          } else {
            advanceQueue()
          }
        }}
        onCanPlay={() => {
          if (!isASC3 && audioRef.current && resumeRef.current > 0) audioRef.current.currentTime = resumeRef.current
          if (audioRef.current) setDuration(audioRef.current.duration)
        }}
        src={!isASC3 ? story.audio_url : undefined}
      />
      {/* Two music tracks in DOM — enables crossfade on iOS */}
      <audio ref={musicARef} loop style={{ display: 'none' }} />
      <audio ref={musicBRef} loop style={{ display: 'none' }} />

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
            <span>{formatTime(effectiveCurrent)}</span>
            <span>{formatTime(effectiveTotal)}</span>
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
