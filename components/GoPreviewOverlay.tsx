// components/GoPreviewOverlay.tsx — GO-PREVIEW-001
// Muted autoplay preview clip overlay for /go variants.
//
// Marc authorization: msg 3662, 2026-07-22.
// Clip: Murder at Falls Park Ep1, 2:02–2:18, hard cut after "Pardon?"
//
// Separation rationale: the __tests__/ux-go-001 hard-rule test asserts that
// app/go/page.tsx contains NO direct audio element management (no audioRef,
// no .pause()/.play(), no new Audio(), no <audio>). All audio for the preview
// lives here; page.tsx orchestrates via state and callback props only.
//
// Meta in-app browser (FBAN/FBIOS) requirements:
// - UA: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15
//        (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]
// - muted autoplay: allowed with muted+autoplay HTML attributes (no gesture)
// - unmute: MUST happen inside a user gesture handler — React onClick satisfies
//   this; iOS WebKit propagates user-activation from touchend → click
// - <track> captions: not reliably rendered in Meta in-app browsers.
//   Custom overlay synchronized to audio.currentTime via requestAnimationFrame.
// - Audio load error: onLoadError() removes the preview UI; normal page shown.

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

// =============================================================================
// WebVTT parser
// =============================================================================

export interface VttCue {
  start: number
  end: number
  text: string
}

/** Parse a WebVTT string into timed cue objects. Never throws. */
export function parseVtt(raw: string): VttCue[] {
  try {
    const cues: VttCue[] = []
    const lines = raw.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i].trim()
      // Detect timestamp line: "HH:MM:SS.mmm --> HH:MM:SS.mmm" or "MM:SS.mmm --> ..."
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim())
        const parseTs = (ts: string): number => {
          const parts = ts.split(':').map(Number)
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
          if (parts.length === 2) return parts[0] * 60 + parts[1]
          return 0
        }
        const start = parseTs(startStr)
        const end = parseTs(endStr)
        // Collect text lines until blank or EOF
        const textLines: string[] = []
        i++
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim())
          i++
        }
        if (textLines.length > 0) {
          cues.push({ start, end, text: textLines.join(' ') })
        }
      } else {
        i++
      }
    }
    return cues
  } catch {
    return []
  }
}

/** Find the currently active cue at `currentTime`, or null. */
export function activeCue(cues: VttCue[], currentTime: number): VttCue | null {
  for (const cue of cues) {
    if (currentTime >= cue.start && currentTime < cue.end) return cue
  }
  return null
}

// =============================================================================
// GoPreviewOverlay component
// =============================================================================

export interface GoPreviewOverlayProps {
  coverUrl: string
  clipUrl: string
  captionsUrl: string
  /** Fires when muted autoplay begins — tracker calls onPreviewStarted() */
  onPreviewStarted: () => void
  /** Fires when the 15s preview clip ends naturally — tracker calls onPreviewCompleted() */
  onPreviewCompleted: () => void
  /** Fires when user taps "Tap for sound" — tracker calls onPreviewUnmuted(pos) */
  onPreviewUnmuted: (positionSeconds: number) => void
  /** Called when preview finishes (natural or skip) — parent starts full episode */
  onPreviewEnded: () => void
  /** Called on audio load error — parent removes preview UI (graceful fallback) */
  onLoadError: () => void
  /** Parent signals preview should stop (e.g. user clicked "skip to episode") */
  shouldStop: boolean
}

export default function GoPreviewOverlay({
  coverUrl,
  clipUrl,
  captionsUrl,
  onPreviewStarted,
  onPreviewCompleted,
  onPreviewUnmuted,
  onPreviewEnded,
  onLoadError,
  shouldStop,
}: GoPreviewOverlayProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [currentCueText, setCurrentCueText] = useState<string | null>(null)
  const [cues, setCues] = useState<VttCue[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const startedFiredRef = useRef(false)
  const completedFiredRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  // Fetch + parse the WebVTT captions file
  useEffect(() => {
    if (!captionsUrl) return
    let cancelled = false
    fetch(captionsUrl)
      .then(r => r.ok ? r.text() : Promise.reject(new Error('vtt fetch failed')))
      .then(raw => { if (!cancelled) setCues(parseVtt(raw)) })
      .catch(() => { /* silent — captions are nice-to-have */ })
    return () => { cancelled = true }
  }, [captionsUrl])

  // rAF caption sync loop — synchronized to audio.currentTime
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const tick = () => {
      if (!audio.paused && !audio.ended) {
        const cue = activeCue(cues, audio.currentTime)
        setCurrentCueText(cue ? cue.text : null)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [cues])

  // Stop preview when parent signals it (user tapped "skip to episode")
  useEffect(() => {
    if (shouldStop && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }, [shouldStop])

  const handlePlay = useCallback(() => {
    if (!startedFiredRef.current) {
      startedFiredRef.current = true
      setHasStarted(true)
      onPreviewStarted()
    }
  }, [onPreviewStarted])

  const handleEnded = useCallback(() => {
    if (!completedFiredRef.current) {
      completedFiredRef.current = true
      onPreviewCompleted()
    }
    onPreviewEnded()
  }, [onPreviewCompleted, onPreviewEnded])

  const handleError = useCallback(() => {
    // Graceful fallback: audio failed to load (network error, bad URL, etc.).
    // Removes preview UI entirely so the normal /go page shows.
    onLoadError()
  }, [onLoadError])

  // Unmute — MUST be called inside a user gesture handler. React onClick
  // satisfies this requirement for iOS WebKit in-app browsers (the touch
  // event that triggered the click propagates the user-activation context).
  const handleUnmuteClick = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = false
    setIsMuted(false)
    const pos = Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime) : 0
    onPreviewUnmuted(pos)
  }, [onPreviewUnmuted])

  if (shouldStop && !hasStarted) return null

  return (
    <div
      aria-label="Story preview — tap for sound"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '480px',
        // Aspect ratio ~3:4 matching cover art; captions overlay on top
        aspectRatio: '3 / 4',
        background: '#0f0f1a',
        overflow: 'hidden',
      }}
    >
      {/* Cover art background */}
      <Image
        src={coverUrl}
        alt=""
        fill
        priority
        style={{ objectFit: 'cover', opacity: 0.65 }}
      />

      {/* Dark gradient overlay to ensure captions are legible */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)',
        zIndex: 1,
      }} />

      {/* PRIMARY VISUAL: large centered caption text
          Minimum 24px (per spec); rendered above the fold; mobile-first.
          Custom overlay — NOT a <track> element (Meta in-app browser compat).
          Renders even when muted (captions help viewer follow along silently). */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}>
        {currentCueText && (
          <div style={{
            fontSize: 'clamp(24px, 5vw, 32px)',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.35,
            // Dark background per spec — semi-transparent pill
            background: 'rgba(0,0,0,0.72)',
            borderRadius: '12px',
            padding: '0.75rem 1.25rem',
            maxWidth: '90%',
            // Text shadow for legibility on light cover areas
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}>
            {currentCueText}
          </div>
        )}
      </div>

      {/* Bottom controls: unmute (prominent) + skip (subtle) */}
      <div style={{
        position: 'absolute',
        bottom: '1.75rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.65rem',
        width: '85%',
        maxWidth: '300px',
      }}>
        {/* "Tap for sound" unmute — visible while muted. Large touch target.
            iOS WebKit: onClick is a user gesture, so audio.muted=false is allowed. */}
        {isMuted && (
          <button
            onClick={handleUnmuteClick}
            aria-label="Tap for sound"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.85rem 1.75rem',
              borderRadius: '50px',
              background: 'rgba(255,255,255,0.15)',
              border: '1.5px solid rgba(255,255,255,0.45)',
              color: '#ffffff',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              justifyContent: 'center',
            }}
          >
            {/* Speaker-muted SVG icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            Tap for sound
          </button>
        )}

        {/* "Skip to episode" — secondary button. Fulfills spec:
            "If user taps the main play button during the preview: stop preview,
            start full episode from 0:00." GoSamplePlayer is not rendered while
            the preview overlay is active, so this button is the path to full
            playback before the preview ends naturally. */}
        <button
          onClick={onPreviewEnded}
          aria-label="Skip to episode"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.55)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          }}
        >
          Skip to episode ›
        </button>
      </div>

      {/* "PREVIEW" badge — top-left, small */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        zIndex: 3,
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.7)',
        textTransform: 'uppercase',
        background: 'rgba(0,0,0,0.45)',
        borderRadius: '6px',
        padding: '3px 8px',
      }}>
        Preview
      </div>

      {/* HTML5 audio element — muted + autoplay attributes for Meta in-app
          browser compliance. The muted attribute enables autoplay without a
          user gesture in iOS WebKit. Unmute requires user gesture via button.
          All audio management lives in this component file — NOT in page.tsx
          (enforced by __tests__/ux-go-001 hard-rule assertions). */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={clipUrl}
        muted
        autoPlay
        playsInline
        preload="auto"
        onPlay={handlePlay}
        onEnded={handleEnded}
        onError={handleError}
        style={{ display: 'none' }}
      />
    </div>
  )
}
