'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type SeriesCardData = {
  id: string
  title: string
  genre: string
  description: string
  episodeCount: number
  coverUrl: string | null
  audioUrl: string | null
}

const EMBER = '#e8520a'
const EMBER2 = '#ff6820'
const INK = '#09090e'
const INK2 = '#111118'
const INK3 = '#1a1a24'
const BORDER = 'rgba(255,255,255,0.07)'
const BORDER_EMBER = 'rgba(232,82,10,0.3)'

const AUDIENCE_WORDS = ['Driving.', 'Working out.', 'Walking.', 'Working.', 'Relaxing.', 'Drifting off for a nap.']

const LABELS = ['Driving', 'Working out', 'Walking', 'Working', 'Relaxing', 'Drifting off for a nap']

const QUALITY = [
  { icon: '🎙', name: 'Full Cast, Real Performances', desc: 'Every story features multiple voice actors matched to each character — not a single narrator reading prose.' },
  { icon: '🎵', name: 'Original Score & Sound Design', desc: 'Custom music and layered sound effects create a world you can see with your ears.' },
  { icon: '⏱', name: 'Timed for Your Drive', desc: 'Stories run 5, 15, 30, 45, or 60 minutes — crafted to fit your commute, workout, or me-time.' },
  { icon: '🚫', name: 'Zero Ads. Always.', desc: 'No mid-story interruptions. No upsells. The story plays start to finish, the way it was meant to be heard.' },
]

const QUESTIONS = [
  { q: 'Do I need a credit card to start?', a: 'Yes. Your card is saved at sign-up but never charged until your 14-day trial ends.' },
  { q: 'Can I cancel any time?', a: 'Yes. Cancel in two taps from your account page. No email required, no retention maze.' },
  { q: 'How long are the stories?', a: 'Stories run 5, 15, 30, 45, or 60 minutes, built to fit a commute or a workout.' },
]

function PlayIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  )
}

function SeriesCard({ s }: { s: SeriesCardData }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) {
      void a.play()
      setPlaying(true)
    } else {
      a.pause()
      setPlaying(false)
    }
  }

  return (
    <div style={{ background: INK2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      {s.audioUrl ? (
        <audio
          ref={ref}
          src={s.audioUrl}
          preload="none"
          onTimeUpdate={e => {
            const a = e.currentTarget
            if (a.duration) setProgress((a.currentTime / a.duration) * 100)
          }}
          onEnded={() => { setPlaying(false); setProgress(0) }}
          onPause={() => setPlaying(false)}
        />
      ) : null}

      <div style={{ position: 'relative', aspectRatio: '1 / 1', overflow: 'hidden', background: INK3 }}>
        {s.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.coverUrl} alt={`${s.title} cover`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : null}
        <button
          onClick={toggle}
          style={{
            position: 'absolute', bottom: 10, right: 10,
            background: EMBER, color: 'white', border: 'none', borderRadius: 999,
            padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          }}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? 'Pause' : 'Play Now'}
        </button>
      </div>

      <div style={{ padding: '14px 16px 12px', background: INK3, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: EMBER, marginBottom: 5, fontFamily: "'DM Mono', monospace" }}>
          {s.genre}
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
          {s.title}
        </div>
      </div>

      <div style={{ height: 3, background: BORDER }}>
        <div style={{ height: '100%', background: EMBER, width: `${progress}%` }} />
      </div>

      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', lineHeight: 1.55 }}>{s.description}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em', marginTop: 7 }}>
          {s.episodeCount} {s.episodeCount === 1 ? 'episode' : 'episodes'}
        </div>
        <Link
          href={`/series/${s.id}`}
          style={{ display: 'inline-block', marginTop: 10, color: EMBER, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          Open series →
        </Link>
      </div>
    </div>
  )
}

export default function LandingClient({ series, signupHref }: { series: SeriesCardData[]; signupHref: string }) {
  const [wordIndex, setWordIndex] = useState(0)
  const [openQ, setOpenQ] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setWordIndex(i => (i + 1) % AUDIENCE_WORDS.length), 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ background: INK, color: '#fff', fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: '0 auto', minHeight: '100dvh', overflowX: 'hidden' }}>
      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 200, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(9,9,14,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Endless<span style={{ color: EMBER }}>Tales</span>
        </Link>
        <Link href={signupHref} style={{ background: EMBER, color: 'white', padding: '10px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Get 14 Days Free
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section style={{ padding: '56px 20px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-30%', width: '70vw', height: '70vw', maxWidth: 500, maxHeight: 500, background: 'radial-gradient(circle, rgba(232,82,10,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 9.5vw, 46px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.02em', marginBottom: 16 }}>
          Press play. Get lost in a story.
        </h1>

        {/* audience label row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {LABELS.map((l, i) => (
            <span
              key={l}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20,
                border: `1px solid ${BORDER_EMBER}`,
                color: i === wordIndex ? EMBER : 'rgba(255,255,255,0.72)',
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 28 }}>
          Made for <span style={{ color: EMBER }}>{AUDIENCE_WORDS[wordIndex].replace('.', '').toLowerCase()}</span>.
        </div>

        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(255,255,255,0.92)', marginBottom: 24 }}>
          <strong>Short stories. Big productions. Made for your me-time.</strong>
          <br /><br />
          Not a podcast. Not an audiobook. Endless Tales are original audio dramas — full casts, original scores, and sound design built to pull you in and not let go. New stories every week and zero ads standing between you and the story.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href={signupHref} style={{ background: EMBER, color: 'white', padding: '16px 28px', borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
            Start your 14-day free trial
          </Link>
          <a href="#series" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '15px 28px', borderRadius: 8, fontSize: 15, fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
            Hear a free preview
          </a>
        </div>
      </section>

      {/* ── TICKER ── */}
      <div style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '12px 0', background: INK2 }}>
        <div style={{ display: 'flex', gap: 48, whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
          {['Full cast', 'Original score', 'Sound design', 'No ads', 'New weekly', 'Full cast', 'Original score', 'Sound design'].map((t, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: EMBER, fontSize: 8 }}>◆</span>{t}
            </span>
          ))}
        </div>
      </div>

      {/* ── SERIES CARDS ── */}
      <section id="series" style={{ padding: '40px 20px 20px' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: EMBER, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          Sample Stories
          <span style={{ flex: 1, height: 1, background: BORDER_EMBER }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 12 }}>
          Press play. No signup.
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', marginBottom: 28 }}>
          Four complete series, yours right now. No signup. No credit card. Just press Play Now and enjoy.
        </p>

        {series.map(s => (
          <SeriesCard key={s.id} s={s} />
        ))}
      </section>

      {/* ── MADE FOR YOUR EARS ── */}
      <section style={{ background: INK2, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '40px 20px' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: EMBER, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          Made for your ears
          <span style={{ flex: 1, height: 1, background: BORDER_EMBER }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 28 }}>
          Production you can hear.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {QUALITY.map(q => (
            <div key={q.name} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 26, flexShrink: 0, marginTop: 2 }}>{q.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, color: '#fff' }}>{q.name}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55 }}>{q.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ padding: '40px 20px' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: EMBER, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          Pricing
          <span style={{ flex: 1, height: 1, background: BORDER_EMBER }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
          One price. Everything.
        </h2>
        <div style={{ background: INK2, border: `1px solid ${BORDER_EMBER}`, borderRadius: 14, padding: '24px 20px' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: EMBER, marginBottom: 8 }}>
            14 days free, then
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
            $7.99<span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.6)' }}> / month</span>
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
            Unlimited listening. Every story. New releases weekly. Cancel anytime.
          </div>
          <Link href={signupHref} style={{ display: 'block', background: EMBER, color: 'white', padding: '15px 20px', borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: 'none', textAlign: 'center', marginBottom: 10 }}>
            Start free trial
          </Link>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            Card required. Charged after trial ends.
          </div>
        </div>
      </section>

      {/* ── QUESTIONS ── */}
      <section style={{ padding: '0 20px 40px' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: EMBER, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          Questions
          <span style={{ flex: 1, height: 1, background: BORDER_EMBER }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {QUESTIONS.map((item, i) => (
            <div key={item.q} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <button
                onClick={() => setOpenQ(openQ === i ? null : i)}
                style={{ width: '100%', background: 'none', border: 'none', color: '#fff', textAlign: 'left', padding: '16px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}
              >
                {item.q}
                <span style={{ color: EMBER, fontSize: 18, lineHeight: 1 }}>{openQ === i ? '−' : '+'}</span>
              </button>
              {openQ === i ? (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, paddingBottom: 16 }}>{item.a}</div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ background: INK2, borderTop: `1px solid ${BORDER}`, padding: '56px 20px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 12 }}>
          Ready to get lost?
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.82)', lineHeight: 1.6, marginBottom: 28 }}>
          14 days free. Unlimited stories. Cancel any time.
        </p>
        <Link href={signupHref} style={{ display: 'inline-block', background: EMBER, color: 'white', padding: '16px 36px', borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
          Start your free trial →
        </Link>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>
          Card required. Charged after trial ends.
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '32px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700 }}>
          Endless<span style={{ color: EMBER }}>Tales</span>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Terms</Link>
          <Link href="/signin" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Sign in</Link>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
          © 2026 Wonder Books Press. All rights reserved.<br />Audio stories for ears in motion.
        </p>
      </footer>
    </div>
  )
}
