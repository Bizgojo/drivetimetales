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
const INK = '#09090e'
const INK2 = '#111118'
const INK3 = '#1a1a24'
const BORDER = 'rgba(255,255,255,0.07)'
const BORDER_EMBER = 'rgba(232,82,10,0.3)'

const AUDIENCE_WORDS = ['Driving', 'Working out', 'Walking', 'Working', 'Relaxing', 'Drifting off for a nap']
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

// PRICING-FIX-001 (Marc 2026-11-15): must match live Stripe.
// Verified against Stripe API: price_1UGgcfG3QDdai0Zh7o47Wr2u = $9.99/month,
// price_1UGgf2G3QDdai0ZhKQnsaD1j = $79.99/year (both livemode, active).
const MONTHLY = '$9.99'
const ANNUAL = '$79.99'
const ANNUAL_PER_MONTH = '$6.67'
const ANNUAL_SAVE = 'Save 33%'

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: EMBER, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      {children}
      <span style={{ flex: 1, height: 1, background: BORDER_EMBER }} />
    </div>
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
    <div className="et-card" style={{ background: INK2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
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

      <div style={{ position: 'relative', overflow: 'hidden', background: INK3 }}>
        {s.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.coverUrl} alt={`${s.title} cover`} style={{ width: '100%', height: 'auto', display: 'block' }} />
        ) : (
          <div style={{ aspectRatio: '3 / 2' }} />
        )}
        <button
          onClick={toggle}
          className="et-playbtn"
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
        <div className="et-card-title" style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
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
        <Link href={`/series/${s.id}`} style={{ display: 'inline-block', marginTop: 10, color: EMBER, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
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

  const heroCard = series[0] ?? null
  const otherCards = series.slice(1)

  return (
    <div className="et-page" style={{ background: INK, color: '#fff', fontFamily: "'DM Sans', sans-serif", margin: '0 auto', minHeight: '100dvh', overflowX: 'hidden' }}>
      <style>{`
        /* LANDING-RESPONSIVE-001: <900px = single column phone layout,
           >=900px = two-column-ish desktop layout per the reference.
           Type sizes stay large on both — nothing shrinks on mobile. */
        .et-page { max-width: 100%; }
        .et-wrap { padding-left: 20px; padding-right: 20px; margin: 0 auto; }
        .et-grid-cards { display: grid; grid-template-columns: 1fr; gap: 24px; }
        .et-grid-pricing { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .et-hero-split { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: start; }
        .et-hero-sticky { position: static; }

        @media (min-width: 900px) {
          .et-page { max-width: 1180px; }
          .et-wrap { padding-left: 40px; padding-right: 40px; }
          .et-grid-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
          .et-grid-pricing { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
          .et-hero-split { grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; }
          .et-hero-sticky { position: sticky; top: 96px; }
          .et-card { margin-bottom: 0 !important; }
          .et-section { padding-top: 72px !important; padding-bottom: 72px !important; }
          .et-h1 { font-size: 60px !important; }
          .et-h2 { font-size: 42px !important; }
          .et-nav { padding-left: 40px !important; padding-right: 40px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="et-nav" style={{ position: 'sticky', top: 0, zIndex: 200, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(9,9,14,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Endless<span style={{ color: EMBER }}>Tales</span>
        </Link>
        <Link href={signupHref} style={{ background: EMBER, color: 'white', padding: '10px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Get 14 Days Free
        </Link>
      </nav>

      {/* ── HERO (headline + player card; side by side >=900px) ── */}
      <section className="et-wrap" style={{ paddingTop: 56, paddingBottom: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-20%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(232,82,10,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="et-hero-split">
          {/* Left / top: headline block */}
          <div>
            <h1 className="et-h1" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 9.5vw, 46px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Press play. Get lost in a story.
            </h1>

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
              Made for <span style={{ color: EMBER }}>{AUDIENCE_WORDS[wordIndex].toLowerCase()}</span>.
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
          </div>

          {/* Right / below: the player card (Widow EP1) */}
          {heroCard ? (
            <div className="et-hero-sticky">
              <SeriesCard s={heroCard} />
            </div>
          ) : null}
        </div>
      </section>

      {/* ── TICKER ── */}
      <div style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '12px 0', background: INK2, marginTop: 40 }}>
        <div style={{ display: 'flex', gap: 48, whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          {['Full cast', 'Original score', 'Sound design', 'No ads', 'New weekly', 'Full cast', 'Original score', 'Sound design'].map((t, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: EMBER, fontSize: 8 }}>◆</span>{t}
            </span>
          ))}
        </div>
      </div>

      {/* ── MADE FOR YOUR EARS ── */}
      <section className="et-wrap et-section" style={{ background: INK2, borderBottom: `1px solid ${BORDER}`, paddingTop: 40, paddingBottom: 40 }}>
        <SectionLabel>Made for your ears</SectionLabel>
        <h2 className="et-h2" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 28 }}>
          Production you can hear.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
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

      {/* ── SERIES CARDS ── */}
      <section id="series" className="et-wrap et-section" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <SectionLabel>Sample Stories</SectionLabel>
        <h2 className="et-h2" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 12 }}>
          Press play. No signup.
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', marginBottom: 28 }}>
          Four complete series, yours right now. No signup. No credit card. Just press Play Now and enjoy.
        </p>
        <div className="et-grid-cards">
          {otherCards.map(s => (
            <SeriesCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="et-wrap et-section" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <SectionLabel>Pricing</SectionLabel>
        <h2 className="et-h2" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
          One price. Everything.
        </h2>

        <div className="et-grid-pricing">
          {/* Monthly */}
          <div style={{ background: INK2, border: `1px solid ${BORDER_EMBER}`, borderRadius: 14, padding: '24px 20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
              Monthly
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
              {MONTHLY}<span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.6)' }}> / month</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
              14 days free, then {MONTHLY} a month. Cancel anytime.
            </div>
            <Link href={signupHref} style={{ marginTop: 'auto', display: 'block', border: `1px solid ${BORDER_EMBER}`, color: EMBER, padding: '14px 20px', borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
              Start monthly
            </Link>
          </div>

          {/* Annual — featured */}
          <div style={{ background: INK3, border: `1px solid ${EMBER}`, borderRadius: 14, padding: '24px 20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -11, right: 18, background: EMBER, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999 }}>
              Best value
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: EMBER, marginBottom: 8 }}>
              Annual · {ANNUAL_SAVE}
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
              {ANNUAL}<span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.6)' }}> / year</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
              About {ANNUAL_PER_MONTH} a month. {ANNUAL_SAVE} vs. monthly.
            </div>
            <Link href={signupHref} style={{ marginTop: 'auto', display: 'block', background: EMBER, color: 'white', padding: '15px 20px', borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
              Start annual
            </Link>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 16 }}>
          14 days free on both. Card required. Charged after trial ends.
        </div>
      </section>

      {/* ── QUESTIONS ── */}
      <section className="et-wrap et-section" style={{ paddingTop: 0, paddingBottom: 40 }}>
        <SectionLabel>Questions</SectionLabel>
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
      <section className="et-wrap et-section" style={{ background: INK2, borderTop: `1px solid ${BORDER}`, paddingTop: 56, paddingBottom: 56, textAlign: 'center' }}>
        <h2 className="et-h2" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 12 }}>
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
      <footer className="et-wrap" style={{ paddingTop: 32, paddingBottom: 32, borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
