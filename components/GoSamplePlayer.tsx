'use client'

// components/GoSamplePlayer.tsx — SUS/ATL-LANDING-001 rev A
// Minimal <audio>-based sample player for the /go campaign landing page.
// Play/pause, seek bar, elapsed/total time. White-on-dark. NO login prompt,
// NO paywall interruption — the sample plays free, start to finish.
//
// CanonicalPlayer (2,070 lines) was evaluated and rejected: it pulls auth
// context, playlists, library state, and guest-minute gating — all forbidden
// on /go (no auth calls, no interruptions).
//
// Rev B (localStorage variant): persists listening position under
// et_go_sample_progress (throttled ~5s + on pause/seek/unmount) and resumes
// from it on mount, so the visitor's spot survives the signup round-trip in
// the same browser.

import { useEffect, useRef, useState } from 'react'
import {
  loadSampleProgress,
  saveSampleProgress,
  shouldPersistProgress,
} from '@/lib/landing'

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface GoSamplePlayerProps {
  storyId: string
  audioUrl: string
  title: string
  author: string
  genre: string
  durationMins: number
}

export default function GoSamplePlayer({ storyId, audioUrl, title, author, genre, durationMins }: GoSamplePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSavedRef = useRef<number | null>(null)
  const resumeAppliedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const persist = (seconds: number, force = false) => {
    if (!force && !shouldPersistProgress(lastSavedRef.current, seconds)) return
    if (seconds <= 0) return
    lastSavedRef.current = seconds
    saveSampleProgress(storyId, seconds)
  }

  // Save on unmount / tab close so pause-then-leave keeps the spot.
  useEffect(() => {
    const flush = () => {
      const el = audioRef.current
      if (el && el.currentTime > 0) persist(el.currentTime, true)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId])

  const onLoadedMetadata = () => {
    const el = audioRef.current
    if (!el) return
    setDuration(el.duration)
    // Rev B: resume from saved anonymous position (once per mount).
    if (!resumeAppliedRef.current) {
      resumeAppliedRef.current = true
      const saved = loadSampleProgress(storyId)
      if (saved !== null && saved > 0 && saved < el.duration - 3) {
        el.currentTime = saved
        setCurrentTime(saved)
        lastSavedRef.current = saved
      }
    }
  }

  const onTimeUpdate = () => {
    const el = audioRef.current
    if (!el) return
    setCurrentTime(el.currentTime)
    if (!el.paused) persist(el.currentTime)
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => { /* autoplay policy — user will tap again */ })
    } else {
      el.pause()
    }
  }

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current
    if (!el) return
    const next = Number(e.target.value)
    el.currentTime = next
    setCurrentTime(next)
    persist(next, true)
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '420px',
      backgroundColor: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '14px',
      padding: '1rem 1.1rem',
      textAlign: 'left',
    }}>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          const el = audioRef.current
          if (el && el.currentTime > 0) persist(el.currentTime, true)
        }}
        onEnded={() => setPlaying(false)}
      />

      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#ffffff', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
        Free Sample — No Account Needed
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
        {title}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#ffffff', marginBottom: '0.75rem' }}>
        {genre} · {author} · {durationMins} min
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: '52px',
            height: '52px',
            minWidth: '52px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#f97316',
            color: '#ffffff',
            fontSize: '1.3rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <div style={{ flex: 1 }}>
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) && duration > 0 ? duration : 0}
            step={1}
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            aria-label="Seek"
            style={{ width: '100%', accentColor: '#f97316', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#ffffff', marginTop: '2px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
