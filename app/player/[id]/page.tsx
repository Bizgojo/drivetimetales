'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; author: string; audio_url: string
  cover_url: string | null; duration_mins: number
}
interface QueueItem { url: string; type: 'intro' | 'story' | 'outro'; label: string }

// ── Volume levels ─────────────────────────────────────────────────────────────
const VOL_INTRO_VOICE = 0.018  // music under Belle B (announcer) — very subtle
const VOL_STORY_DUCK  = 0.025  // music under story voices — barely audible
const VOL_BETWEEN     = 0.055  // brief swell between lines
const VOL_FADE_MS     = 400    // ms to duck/raise

function PlayerContent() {
  const params  = useParams()
  const router  = useRouter()
  const { user } = useAuth()
  const storyId = params.id as string

  // Voice + two music DOM elements
  const audioRef  = useRef<HTMLAudioElement>(null)
  const musicARef = useRef<HTMLAudioElement>(null)
  const musicBRef = useRef<HTMLAudioElement>(null)
  const activeMusic = useRef<'A' | 'B'>('A')

  const xfadeTimer  = useRef<NodeJS.Timeout | null>(null)
  const volTimer    = useRef<NodeJS.Timeout | null>(null)
  const schedTimer  = useRef<NodeJS.Timeout | null>(null)
  const saveTimer   = useRef<NodeJS.Timeout | null>(null)
  const nextSegRef  = useRef<HTMLAudioElement | null>(null)
  const resumeRef   = useRef(0)
  const currentType = useRef<'intro' | 'story' | 'outro'>('intro')

  const [story, setStory]       = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [hasProgress, setHasProgress] = useState(false)

  const [queue, setQueue]             = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex]   = useState(0)
  const [isASC3, setIsASC3]           = useState(false)
  const [sectionLabel, setSectionLabel] = useState('')
  const introMusicRef = useRef('')
  const bgMusicRef    = useRef<string | null>(null)

  const segDursRef   = useRef<number[]>([])
  const completedRef = useRef(0)
  const [totalDur, setTotalDur] = useState(0)
  const [cumTime, setCumTime]   = useState(0)

  // ── Helpers ────────────────────────────────────────────────────────────────

  const activeEl  = () => activeMusic.current === 'A' ? musicARef.current : musicBRef.current
  const inactiveEl = () => activeMusic.current === 'A' ? musicBRef.current : musicARef.current

  /** Smoothly animate an audio element's volume */
  const animVol = (el: HTMLAudioElement, target: number, ms: number, done?: () => void) => {
    const start = el.volume; const steps = Math.max(8, ms / 20); const stepMs = ms / steps; let s = 0
    const t = setInterval(() => {
      s++; el.volume = Math.max(0, Math.min(1, start + (target - start) * s / steps))
      if (s >= steps) { clearInterval(t); done?.() }
    }, stepMs)
    return t
  }

  /** Fade active music to target vol */
  const fadeTo = (target: number, ms = VOL_FADE_MS) => {
    const el = activeEl(); if (!el) return
    if (volTimer.current) clearInterval(volTimer.current)
    volTimer.current = animVol(el, target, ms)
  }

  /** Cross-fade to a new music source using inactive track */
  const crossFade = (newSrc: string, targetVol: number, durationMs = 3000) => {
    if (xfadeTimer.current) clearInterval(xfadeTimer.current)
    const outEl = activeEl(); const inEl = inactiveEl(); if (!inEl) return
    inEl.src = newSrc; inEl.loop = true; inEl.volume = 0
    inEl.play().catch(() => {})
    const steps = Math.max(20, durationMs / 20); const stepMs = durationMs / steps
    const startVol = outEl?.volume ?? targetVol; let s = 0
    xfadeTimer.current = setInterval(() => {
      s++; const p = s / steps
      if (outEl) outEl.volume = Math.max(0, startVol * (1 - p))
      inEl.volume = Math.min(targetVol, targetVol * p)
      if (s >= steps) {
        clearInterval(xfadeTimer.current!); outEl?.pause()
        activeMusic.current = activeMusic.current === 'A' ? 'B' : 'A'
      }
    }, stepMs)
  }

  /** Schedule a music crossfade leadSec seconds before current audio ends */
  const scheduleSwitch = (newSrc: string, targetVol: number, leadSec: number) => {
    if (schedTimer.current) clearTimeout(schedTimer.current)
    const a = audioRef.current; if (!a?.duration || isNaN(a.duration)) return
    const delay = Math.max(0, (a.duration - a.currentTime - leadSec) * 1000)
    schedTimer.current = setTimeout(() => crossFade(newSrc, targetVol, leadSec * 1000), delay)
  }

  // ── Load story ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('stories')
        .select('id,title,author,audio_url,cover_url,duration_mins,intro_audio_url,outro_audio_url,background_music_url')
        .eq('id', storyId).single()
      if (data) setStory(data)
      if (data?.intro_audio_url) {
        const IM = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
        introMusicRef.current = IM
        bgMusicRef.current = (data as any).background_music_url || null
        const q: QueueItem[] = []
        if (data.intro_audio_url) q.push({ url: data.intro_audio_url, type: 'intro',  label: 'Intro'  })
        if (data.audio_url)       q.push({ url: data.audio_url,       type: 'story',  label: 'Story'  })
        if (data.outro_audio_url) q.push({ url: data.outro_audio_url, type: 'outro',  label: 'Outro'  })
        setQueue(q); setIsASC3(true)
      }
      try {
        const res = await fetch(`/api/asc3/story-playlist?storyId=${storyId}`)
        if (res.ok) {
          const pl = await res.json()
          if (pl.queue?.length > 1) {
            introMusicRef.current = pl.introOutroMusicUrl || introMusicRef.current
            bgMusicRef.current    = pl.backgroundMusicUrl || bgMusicRef.current
            setQueue(pl.queue); setIsASC3(true)
          }
        }
      } catch (_) {}
      if (user?.id) {
        const { data: lib } = await supabase.from('user_library')
          .select('progress,completed').eq('user_id', user.id).eq('story_id', storyId).single()
        if (lib?.progress > 0) { resumeRef.current = lib.completed ? 0 : Math.max(0, lib.progress - 3); setHasProgress(true) }
      }
      setLoading(false)
    }
    load()
  }, [storyId, user])

  // Init first segment
  useEffect(() => {
    if (!isASC3 || !queue.length || loading || !audioRef.current) return
    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      audioRef.current.src = queue[0].url; audioRef.current.load()
    }
    setSectionLabel(queue[0].label); currentType.current = 'intro'
    const mA = musicARef.current
    if (mA && introMusicRef.current) { mA.src = introMusicRef.current; mA.loop = true; mA.volume = 0 }
  }, [isASC3, queue, loading])

  // ── Queue advance ──────────────────────────────────────────────────────────

  const advanceQueue = () => {
    completedRef.current += segDursRef.current[queueIndex] || duration
    const ni = queueIndex + 1
    if (ni < queue.length) {
      setQueueIndex(ni)
      const next = queue[ni]; setSectionLabel(next.label); currentType.current = next.type
      if (audioRef.current) {
        // Brief swell between lines, then segment starts and ducks
        fadeTo(VOL_BETWEEN, 80)
        setTimeout(() => fadeTo(next.type === 'story' ? VOL_STORY_DUCK : VOL_INTRO_VOICE, VOL_FADE_MS), 80)
        if (nextSegRef.current?.src?.includes(next.url.split('/').pop() || '')) {
          audioRef.current.src = nextSegRef.current.src; nextSegRef.current = null
        } else { audioRef.current.src = next.url; audioRef.current.load() }
        audioRef.current.play().catch(() => {})
      }
    } else {
      fadeTo(0, 3000); setIsPlaying(false); saveProgress(duration, true)
      setTimeout(() => router.push('/library'), 3000)
    }
  }

  // ── Play / Pause ───────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause(); activeEl()?.pause()
      saveProgress(currentTime); setIsPlaying(false)
    } else {
      // Unlock both music elements inside user gesture (required by iOS)
      const mB = musicBRef.current
      if (mB && !mB.src) {
        mB.volume = 0
        mB.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
        mB.play().catch(() => {}); setTimeout(() => { mB.pause(); mB.src = '' }, 50)
      }
      audioRef.current.play().then(() => {
        setIsPlaying(true)
        const mA = musicARef.current
        if (mA?.src) { mA.play().catch(() => {}); animVol(mA, VOL_INTRO_VOICE, 2000) }
      }).catch(() => {})
    }
  }

  const saveProgress = async (t: number, done = false) => {
    if (user?.id && storyId) await supabase.from('user_library').upsert({
      user_id: user.id, story_id: storyId, progress: Math.floor(t), completed: done,
      last_played: new Date().toISOString()
    })
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.getBoundingClientRect().width) * duration
  }

  const handleNotForMe = async () => {
    audioRef.current?.pause(); activeEl()?.pause()
    if (user?.id) await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, not_for_me: true, progress: Math.floor(currentTime), last_played: new Date().toISOString() })
    router.push('/library')
  }
  const handleBack = () => { audioRef.current?.pause(); activeEl()?.pause(); saveProgress(currentTime); router.push('/library') }
  const handleStartOver = () => {
    completedRef.current = 0; segDursRef.current = []
    setQueueIndex(0); setSectionLabel(queue[0]?.label || ''); currentType.current = 'intro'
    const mA = musicARef.current; const mB = musicBRef.current
    if (mA) { mA.src = introMusicRef.current; mA.loop = true; mA.volume = 0 }
    if (mB) { mB.pause(); mB.src = '' }
    activeMusic.current = 'A'
    if (audioRef.current) { audioRef.current.src = queue[0]?.url || ''; audioRef.current.load() }
    setTimeout(() => { audioRef.current?.play().catch(() => {}); mA && (mA.play().catch(() => {}), animVol(mA, VOL_INTRO_VOICE, 2000)); setIsPlaying(true) }, 100)
    setCurrentTime(0); setCumTime(0)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const effTotal = totalDur > 0 ? totalDur : (story?.duration_mins || 0) * 60
  const effCur   = isASC3 ? cumTime : currentTime
  const pct      = effTotal > 0 ? Math.min(100, (effCur / effTotal) * 100) : 0

  if (loading) return <div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
  if (!story)   return <div style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}><p>Story not found</p><button onClick={() => router.back()} style={{ color:'#f97316', background:'none', border:'none', cursor:'pointer', marginTop:'12px' }}>Go Back</button></div>

  return (
    <div style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Voice audio */}
      <audio ref={audioRef}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration; setDuration(d)
          segDursRef.current[queueIndex] = d
          const tot = segDursRef.current.reduce((a, b) => a + (b || 0), 0)
          if (tot > 0) setTotalDur(tot)
          // Schedule crossfade 3s before intro ends → background music fades in
          if (currentType.current === 'intro' && bgMusicRef.current) {
            scheduleSwitch(bgMusicRef.current, VOL_STORY_DUCK, 3)
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime; setCurrentTime(t)
          setCumTime(completedRef.current + t)
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => saveProgress(t), 5000)
          // Preload next segment 3s early
          const rem = e.currentTarget.duration - t
          if (rem < 3 && rem > 0 && isASC3) {
            const ni = queueIndex + 1
            if (ni < queue.length && !nextSegRef.current) {
              const p = new Audio(queue[ni].url); p.preload = 'auto'; p.load(); nextSegRef.current = p
            }
          }
        }}
        onPlay={() => {
          setIsPlaying(true)
          // Duck music as soon as voice starts
          fadeTo(currentType.current === 'story' ? VOL_STORY_DUCK : VOL_INTRO_VOICE, VOL_FADE_MS)
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (!isASC3) { setIsPlaying(false); saveProgress(duration, true); setTimeout(() => router.push('/library'), 1500); return }
          const ni = queueIndex + 1
          const lastStory = currentType.current === 'story' && ni < queue.length && queue[ni]?.type === 'outro'
          if (lastStory) {
            // Swell music for 3s before outro
            fadeTo(VOL_BETWEEN, 300)
            crossFade(introMusicRef.current, VOL_INTRO_VOICE, 3000)
            setTimeout(() => advanceQueue(), 3000)
          } else { advanceQueue() }
        }}
        onCanPlay={() => { if (!isASC3 && resumeRef.current > 0 && audioRef.current) audioRef.current.currentTime = resumeRef.current }}
        src={!isASC3 ? story.audio_url : undefined}
      />
      {/* Two music tracks — both in DOM for iOS/Android compatibility */}
      <audio ref={musicARef} loop style={{ display:'none' }} />
      <audio ref={musicBRef} loop style={{ display:'none' }} />

      {/* Header */}
      <div style={{ padding:'10px 16px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0f172a', borderBottom:'1px solid rgba(148,163,184,0.06)' }}>
        <button onClick={handleBack} style={{ width:'36px', height:'36px', borderRadius:'50%', backgroundColor:'#3b82f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ width:'28px', height:'28px', objectFit:'contain' }} />
          <span style={{ fontWeight:800, fontSize:'18px', color:'white' }}>Endless <span style={{ color:'#f97316' }}>Tales</span></span>
        </div>
        <div style={{ width:'36px', height:'36px', borderRadius:'50%', backgroundColor:'#f97316', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'14px', color:'white' }}>
          {user?.email?.[0]?.toUpperCase() || 'M'}
        </div>
      </div>

      {/* Cover */}
      <div style={{ width:'100vw', aspectRatio:'1', flexShrink:0, overflow:'hidden' }}>
        {story.cover_url
          ? <img src={story.cover_url} alt={story.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#475569,#1e293b)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'64px' }}>🎧</div>}
      </div>

      {/* Controls */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'16px 20px', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:800, margin:0, color:'white', textAlign:'center', lineHeight:1.2 }}>{story.title}</h1>
          <p style={{ color:'#94a3b8', fontSize:'13px', margin:'4px 0 0', textAlign:'center' }}>
            by {story.author || 'Endless Tales'} · {fmt(Math.max(0, effTotal - effCur))} remaining
          </p>
          {isASC3 && sectionLabel && isPlaying && (
            <p style={{ color:'#f97316', fontSize:'11px', margin:'4px 0 0', textAlign:'center', fontWeight:600 }}>
              🎙️ {sectionLabel} · {queueIndex + 1}/{queue.length}
            </p>
          )}
        </div>
        {/* Progress */}
        <div>
          <div onClick={handleSeek} style={{ height:'6px', backgroundColor:'#334155', borderRadius:'3px', overflow:'hidden', cursor:'pointer' }}>
            <div style={{ height:'100%', backgroundColor:'#f97316', width:`${pct}%`, transition:'width 0.1s', borderRadius:'3px' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#64748b', marginTop:'4px' }}>
            <span>{fmt(effCur)}</span><span>{fmt(effTotal)}</span>
          </div>
        </div>
        {/* Buttons */}
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={handlePlayPause} style={{ flex:2, padding:'16px', borderRadius:'14px', border:'none', fontSize:'16px', fontWeight:700, cursor:'pointer', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color:'white' }}>
            {isPlaying ? '⏸ Pause' : hasProgress ? '▶ Continue' : '▶ Play'}
          </button>
          {hasProgress
            ? <button onClick={handleStartOver} style={{ flex:1, padding:'16px', borderRadius:'14px', border:'none', fontSize:'13px', fontWeight:600, cursor:'pointer', backgroundColor:'#1e293b', color:'#94a3b8' }}>Start Over</button>
            : <button onClick={handleNotForMe} style={{ flex:1, padding:'16px', borderRadius:'14px', border:'none', fontSize:'13px', fontWeight:600, cursor:'pointer', backgroundColor:'#1e293b', color:'#94a3b8' }}>Not for Me</button>
          }
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}>
      <PlayerContent />
    </Suspense>
  )
}
