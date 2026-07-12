'use client'

// components/GoSamplePlayer.tsx — SUS/ATL-LANDING-002 rev C
// Hero sample player for the /go campaign landing page: the story's COVER
// ART is the hero, with one large circular play button overlaid. After play
// starts, the overlay becomes a compact pause/seek row under the art — the
// timeline/times appear ONLY there, once playing (rev C: NO duration is
// shown anywhere pre-play, and the slim title bar on the art is gone; the
// title/hook stack lives on the page, below the art).
// White-on-dark, single #f97316 accent. NO login prompt, NO paywall
// interruption — the sample plays free, start to finish.
//
// CanonicalPlayer (2,070 lines) was evaluated and rejected in rev A: it
// pulls auth context, playlists, library state, and guest-minute gating —
// all forbidden on /go (no auth calls, no interruptions).
//
// Persistence (rev B/C): listening position saved under a per-story key
// (lib/landing.ts sampleProgressKey — the default Grave story keeps the
// original et_go_sample_progress key), throttled ~5s + on
// pause/seek/unmount, and resumed on mount, so the visitor's spot survives
// the signup round-trip in the same browser.
//
// Engagement callback (rev C — the ONLY one): the page owns the trial-CTA
// reveal decision (lib/landing.ts shouldRevealTrialCta).
//   - onListenedSeconds(cum): cumulative REAL listening seconds, counted
//     from timeupdate deltas only while playing (seeks don't count).
// The rev-B first-play and pause-after-play callbacks were REMOVED with
// the pause + idle reveal triggers (Marc final spec).

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
  coverUrl: string
  title: string
  onListenedSeconds?: (cumulativeSeconds: number) => void
}

export default function GoSamplePlayer({
  storyId,
  audioUrl,
  coverUrl,
  title,
  onListenedSeconds,
}: GoSamplePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSavedRef = useRef<number | null>(null)
  const resumeAppliedRef = useRef(false)
  // Listening-time accumulation: previous timeupdate position + running total.
  const lastTickRef = useRef<number | null>(null)
  const listenedRef = useRef(0)
  const [hasStarted, setHasStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [coverFailed, setCoverFailed] = useState(false)

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
    if (!el.paused) {
      // Accumulate REAL listening time: small forward deltas only, so seeks
      // and buffering jumps never count toward the CTA reveal threshold.
      const prev = lastTickRef.current
      if (prev !== null) {
        const delta = el.currentTime - prev
        if (delta > 0 && delta < 2) {
          listenedRef.current += delta
          onListenedSeconds?.(listenedRef.current)
        }
      }
      lastTickRef.current = el.currentTime
      persist(el.currentTime)
    }
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
    lastTickRef.current = next // seeks never count as listening time
    persist(next, true)
  }

  const handlePlay = () => {
    setPlaying(true)
    setHasStarted(true)
    const el = audioRef.current
    if (el) lastTickRef.current = el.currentTime
  }

  const handlePauseLike = () => {
    setPlaying(false)
    lastTickRef.current = null
    const el = audioRef.current
    if (el && el.currentTime > 0) persist(el.currentTime, true)
  }

  return (
    <div style={{ width: '100%' }}>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePauseLike}
        onEnded={handlePauseLike}
      />

      {/* ===== HERO: cover art with overlays ===== */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxHeight: '58vh',
        aspectRatio: '3 / 4',
        borderRadius: '16px',
        overflow: 'hidden',
        backgroundColor: '#141422',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}>
        {!coverFailed ? (
          // Plain <img>: remote Supabase host; graceful onError fallback below.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${title} cover art`}
            onError={() => setCoverFailed(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          /* Fallback: dark gradient block with the title (image errored) */
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(160deg, #1b1b30 0%, #0f0f1a 55%, #241627 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}>
            <div style={{
              fontSize: 'clamp(1.5rem, 7vw, 2.2rem)',
              fontWeight: 800,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}>
              {title}
            </div>
          </div>
        )}

        {/* Pill — top of the art */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          backgroundColor: 'rgba(15,15,26,0.72)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          color: '#ffffff',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          Free sample — no account needed
        </div>

        {/* THE big play button — only before playback has started */}
        {!hasStarted && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '84px',
              height: '84px',
              minWidth: '64px',
              minHeight: '64px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#f97316',
              color: '#ffffff',
              fontSize: '2rem',
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 34px rgba(0,0,0,0.55), 0 4px 16px rgba(249,115,22,0.45)',
              paddingLeft: '6px', // optical centering of the ▶ glyph
            }}
          >
            ▶
          </button>
        )}
      </div>

      {/* ===== Compact pause/seek row — replaces the big overlay once started ===== */}
      {hasStarted && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.7rem',
          padding: '0.5rem 0.75rem',
          borderRadius: '12px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            style={{
              width: '46px',
              height: '46px',
              minWidth: '46px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#f97316',
              color: '#ffffff',
              fontSize: '1.05rem',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#ffffff', marginTop: '1px' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
