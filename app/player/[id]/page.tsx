'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface QueueItem { url: string; type: 'intro' | 'story' | 'outro'; label: string }

// ── VOLUME LEVELS ─────────────────────────────────────────────────────────────
// All values 0–1. Music stays BELOW these while voice is playing.
const VOL_INTRO_MUSIC = 0.06   // under Belle B announcer  (6%)
const VOL_STORY_MUSIC = 0.06   // under story voices        (6%)
const VOL_SWELL       = 0.10   // brief rise between lines  (10%)
const DUCK_TARGET     = 0.015  // music while voice is active (1.5%)
const DUCK_MS         = 250    // ms to duck
const RAISE_MS        = 600    // ms to raise after voice ends

/** Temp debug: shows live music volume so we can confirm ducking works */
function MusicVolumeDebug({ musicRef }: { musicRef: React.RefObject<HTMLAudioElement | null> }) {
  const [vol, setVol] = useState(0)
  useEffect(() => {
    const t = setInterval(() => { if (musicRef.current) setVol(Math.round(musicRef.current.volume * 1000) / 10) }, 100)
    return () => clearInterval(t)
  }, [])
  return <p style={{ color:'#64748b', fontSize:'10px', textAlign:'center', margin:'2px 0 0' }}>🎵 v0.1 · music: {vol}%</p>
}

function PlayerContent() {
  const params  = useParams()
  const router  = useRouter()
  const { user } = useAuth()
  const storyId = params.id as string

  const audioRef = useRef<HTMLAudioElement>(null)  // voice
  const musicRef = useRef<HTMLAudioElement>(null)  // single music track
  const nextSegRef = useRef<HTMLAudioElement | null>(null)

  const volTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const schedTimer = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const resumeRef  = useRef(0)
  const typeRef    = useRef<'intro' | 'story' | 'outro'>('intro')
  const switchingRef = useRef(false) // true while swapping music src

  const [story, setStory]       = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [hasProgress, setHasProgress] = useState(false)
  const [queue, setQueue]           = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isASC3, setIsASC3]         = useState(false)
  const [sectionLabel, setSectionLabel] = useState('')
  const introMusicRef = useRef('')
  const bgMusicRef    = useRef<string | null>(null)
  const noMusicRef    = useRef(true)   // music disabled globally — voice only
  const segDursRef    = useRef<number[]>([])
  const completedRef  = useRef(0)
  const sessionStartRef = useRef<number | null>(null)
  const [totalDur, setTotalDur] = useState(0)
  const [cumTime, setCumTime]   = useState(0)

  // ── Volume helpers ─────────────────────────────────────────────────────────

  const animVol = (el: HTMLAudioElement, from: number, to: number, ms: number, done?: () => void) => {
    if (volTimer.current) clearInterval(volTimer.current)
    el.volume = Math.max(0, Math.min(1, from))
    const steps = Math.max(6, ms / 20); const stepMs = ms / steps; let s = 0
    volTimer.current = setInterval(() => {
      s++; el.volume = Math.max(0, Math.min(1, from + (to - from) * s / steps))
      if (s >= steps) { clearInterval(volTimer.current!); volTimer.current = null; done?.() }
    }, stepMs)
  }

  const duck  = () => { const m = musicRef.current; if (m && !switchingRef.current) animVol(m, m.volume, DUCK_TARGET, DUCK_MS) }
  const raise = (target: number) => { const m = musicRef.current; if (m && !switchingRef.current) animVol(m, m.volume, target, RAISE_MS) }

  /** Fade to 0, swap src, fade back to target */
  const swapMusic = (newSrc: string, targetVol: number, fadeDuration = 1500) => {
    const m = musicRef.current; if (!m) return
    switchingRef.current = true
    animVol(m, m.volume, 0, fadeDuration / 2, () => {
      m.src = newSrc; m.loop = true
      m.play().catch(() => {})
      animVol(m, 0, targetVol, fadeDuration / 2, () => { switchingRef.current = false })
    })
  }

  /** Schedule a music swap leadSec seconds before the current voice audio ends */
  const schedSwap = (newSrc: string, targetVol: number, leadSec: number) => {
    if (schedTimer.current) clearTimeout(schedTimer.current)
    const a = audioRef.current; if (!a?.duration || isNaN(a.duration)) return
    const delay = Math.max(0, (a.duration - a.currentTime - leadSec) * 1000)
    schedTimer.current = setTimeout(() => swapMusic(newSrc, targetVol, leadSec * 1000), delay)
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
        // If audio_url is a pre-rendered final mix, skip ALL music and queue setup immediately.
        // Don't wait for the story-playlist API — set noMusicRef now so there's no race condition.
        if ((data as any).audio_url?.includes('final_mix')) {
          noMusicRef.current = true
          introMusicRef.current = ''
          bgMusicRef.current = null
          // isASC3 stays false, queue stays empty → <audio src={story.audio_url}> plays directly
        } else {
          const IM = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/intro_outro_music.mp3`
          introMusicRef.current = IM
          bgMusicRef.current = (data as any).background_music_url || null
          const q: QueueItem[] = []
          if (data.intro_audio_url) q.push({ url: data.intro_audio_url, type: 'intro', label: 'Intro'  })
          if (data.audio_url)       q.push({ url: data.audio_url,       type: 'story', label: 'Story'  })
          if (data.outro_audio_url) q.push({ url: data.outro_audio_url, type: 'outro', label: 'Outro'  })
          setQueue(q); setIsASC3(true)
        }
      }
      try {
        const res = await fetch(`/api/asc3/story-playlist?storyId=${storyId}`)
        if (res.ok) {
          const pl = await res.json()
          if (pl.useFinalMix && pl.finalMixUrl) {
            // Story has a pre-rendered final mix — play the audio_url directly.
            // Override the early isASC3=true set above, clear the segment queue,
            // and silence the separate music ref (music is already baked into final_mix.mp3).
            setIsASC3(false)
            setQueue([])
            introMusicRef.current = ''
            bgMusicRef.current = null
            noMusicRef.current = true
            if (musicRef.current) { musicRef.current.pause(); musicRef.current.src = 'about:blank'; musicRef.current.volume = 0 }
          } else if (pl.queue?.length > 1) {
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

  // Init audio once loaded
  useEffect(() => {
    if (!isASC3 || !queue.length || loading || !audioRef.current) return
    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      audioRef.current.src = queue[0].url; audioRef.current.load()
    }
    setSectionLabel(queue[0].label); typeRef.current = 'intro'
    const m = musicRef.current
    if (m && introMusicRef.current) { m.src = introMusicRef.current; m.loop = true; m.volume = 0 }
  }, [isASC3, queue, loading])

  // ── Queue advance ──────────────────────────────────────────────────────────

  const advanceQueue = () => {
    completedRef.current += segDursRef.current[queueIndex] || duration
    const ni = queueIndex + 1
    if (ni < queue.length) {
      setQueueIndex(ni)
      const next = queue[ni]; setSectionLabel(next.label); typeRef.current = next.type
      if (audioRef.current) {
        if (nextSegRef.current?.src?.includes(next.url.split('/').pop() || '')) {
          audioRef.current.src = nextSegRef.current.src; nextSegRef.current = null
        } else { audioRef.current.src = next.url; audioRef.current.load() }
        audioRef.current.play().catch(() => {})
        // Brief swell on segment boundary then duck again
        const m = musicRef.current
        if (m) {
          if (volTimer.current) clearInterval(volTimer.current)
          m.volume = Math.min(VOL_SWELL, m.volume + 0.02)
          setTimeout(() => duck(), 120)
        }
      }
    } else {
      raise(0); setIsPlaying(false); saveProgress(duration, true)
      setTimeout(() => router.push('/library'), 3000)
    }
  }

  // ── Play / Pause ───────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause(); musicRef.current?.pause()
      saveProgress(currentTime); setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true)
        if (!user && !sessionStartRef.current) { sessionStartRef.current = Date.now() }
        const m = musicRef.current
        if (!noMusicRef.current && m?.src && m.src !== 'about:blank') {
          m.volume = 0
          m.play().catch(() => {})
          // Fade intro music in gently then duck under first voice
          animVol(m, 0, VOL_INTRO_MUSIC, 2000)
        }
      }).catch(() => {})
    }
  }

  const saveProgress = async (t: number, done = false) => {
    if (user?.id) await supabase.from('user_library').upsert({
      user_id: user.id, story_id: storyId, progress: Math.floor(t), completed: done,
      hide_from_home: false,  // Reset dismiss if user plays again
      last_played: new Date().toISOString()
    })
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const handleNotForMe = async () => {
    audioRef.current?.pause(); musicRef.current?.pause()
    if (user?.id) await supabase.from('user_library').upsert({ user_id: user.id, story_id: storyId, not_for_me: true, progress: Math.floor(currentTime), last_played: new Date().toISOString() })
    router.push('/library')
  }
  const handleBack = () => {
    audioRef.current?.pause(); musicRef.current?.pause(); saveProgress(currentTime)
    if (!user && sessionStartRef.current) {
      const mins = (Date.now() - sessionStartRef.current) / 60000
      const prev = parseFloat(localStorage.getItem('et_guest_minutes') || '0')
      localStorage.setItem('et_guest_minutes', String(prev + mins))
      sessionStartRef.current = null
    }
    router.push(user ? '/library' : '/guest')
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const effTotal = totalDur > 0 ? totalDur : (story?.duration_mins || 0) * 60
  const effCur   = isASC3 ? cumTime : currentTime
  const pct      = effTotal > 0 ? Math.min(100, (effCur / effTotal) * 100) : 0

  if (loading) return <div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
  if (!story)   return <div style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}><p>Story not found</p><button onClick={() => router.back()} style={{ color:'#f97316', background:'none', border:'none', cursor:'pointer' }}>Go Back</button></div>

  return (
    <div style={{ height:'100dvh', backgroundColor:'#020617', color:'white', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <audio ref={audioRef} crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration; setDuration(d)
          segDursRef.current[queueIndex] = d
          const tot = segDursRef.current.reduce((a,b) => a+(b||0), 0); if (tot>0) setTotalDur(tot)
          // 3s before intro ends → swap to background story music
          if (typeRef.current === 'intro' && bgMusicRef.current) schedSwap(bgMusicRef.current, VOL_STORY_MUSIC, 3)
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime; setCurrentTime(t); setCumTime(completedRef.current + t)
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => saveProgress(t), 5000)
          const rem = e.currentTarget.duration - t
          if (rem < 3 && rem > 0 && isASC3) {
            const ni = queueIndex + 1
            if (ni < queue.length && !nextSegRef.current) { const p = new Audio(queue[ni].url); p.preload='auto'; p.load(); nextSegRef.current = p }
          }
        }}
        onPlay={() => {
          setIsPlaying(true)
          if (!noMusicRef.current) duck()
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (!isASC3) { setIsPlaying(false); saveProgress(duration, true); setTimeout(() => router.push('/library'), 1500); return }
          const ni = queueIndex + 1
          const lastStory = typeRef.current === 'story' && ni < queue.length && queue[ni]?.type === 'outro'
          if (lastStory) {
            // 3s musical swell, then swap to outro music, then advance
            raise(VOL_SWELL)
            setTimeout(() => swapMusic(introMusicRef.current, VOL_INTRO_MUSIC, 2000), 500)
            setTimeout(() => advanceQueue(), 3000)
          } else advanceQueue()
        }}
        onCanPlay={() => { if (!isASC3 && resumeRef.current > 0 && audioRef.current) audioRef.current.currentTime = resumeRef.current }}
        onError={() => {
          // If a segment fails to load, skip to next segment instead of dying
          if (isASC3 && queue.length > 0) {
            const ni = queueIndex + 1
            if (ni < queue.length) {
              console.warn('[player] Segment failed, skipping to next:', queue[queueIndex]?.url)
              advanceQueue()
            }
          }
        }}
        src={!isASC3 ? story.audio_url : undefined}
      />
      <audio ref={musicRef} crossOrigin="anonymous" loop style={{ display:'none' }} />

      {/* Header */}
      <div style={{ padding:'10px 16px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0f172a', borderBottom:'1px solid rgba(148,163,184,0.06)' }}>
        <button onClick={handleBack} style={{ width:'36px', height:'36px', borderRadius:'50%', backgroundColor:'#3b82f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
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
            by {story.author || 'Endless Tales'} · {fmt(Math.max(0,effTotal-effCur))} remaining
          </p>
          {isASC3 && sectionLabel && isPlaying && (
            <p style={{ color:'#f97316', fontSize:'11px', margin:'4px 0 0', textAlign:'center', fontWeight:600 }}>
              🎙️ {sectionLabel} · {queueIndex+1}/{queue.length}
            </p>
          )}
          {/* DEBUG — remove after testing */}
          <MusicVolumeDebug musicRef={musicRef} />
        </div>
        <div>
          <div onClick={handleSeek} style={{ height:'6px', backgroundColor:'#334155', borderRadius:'3px', overflow:'hidden', cursor:'pointer' }}>
            <div style={{ height:'100%', backgroundColor:'#f97316', width:`${pct}%`, transition:'width 0.1s', borderRadius:'3px' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#64748b', marginTop:'4px' }}>
            <span>{fmt(effCur)}</span><span>{fmt(effTotal)}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={handlePlayPause} style={{ flex:2, padding:'16px', borderRadius:'14px', border:'none', fontSize:'16px', fontWeight:700, cursor:'pointer', backgroundColor: isPlaying ? '#f97316' : '#22c55e', color:'white' }}>
            {isPlaying ? '⏸ Pause' : hasProgress ? '▶ Continue' : '▶ Play'}
          </button>
          {hasProgress
            ? <button onClick={() => {
                if (!isASC3 && story?.audio_url) {
                  // Final mix mode — clear resume ref so onCanPlay doesn't seek back, then seek to 0
                  resumeRef.current = 0
                  setHasProgress(false)
                  const a = audioRef.current
                  if (a) { a.currentTime = 0; a.play().catch(() => {}) }
                  setCurrentTime(0); setCumTime(0); setIsPlaying(true)
                } else {
                  // Segment queue mode
                  completedRef.current=0; segDursRef.current=[]; setQueueIndex(0); setSectionLabel(queue[0]?.label||''); typeRef.current='intro'
                  const m=musicRef.current; if(m){m.src=introMusicRef.current;m.loop=true;m.volume=0}
                  if(audioRef.current){audioRef.current.src=queue[0]?.url||'';audioRef.current.load()}
                  setTimeout(()=>{audioRef.current?.play().catch(()=>{});const mu=musicRef.current;if(mu){mu.play().catch(()=>{});animVol(mu,0,VOL_INTRO_MUSIC,2000)};setIsPlaying(true)},100)
                  setCurrentTime(0); setCumTime(0)
                }
              }} style={{ flex:1, padding:'16px', borderRadius:'14px', border:'none', fontSize:'13px', fontWeight:600, cursor:'pointer', backgroundColor:'#1e293b', color:'#94a3b8' }}>Start Over</button>
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
