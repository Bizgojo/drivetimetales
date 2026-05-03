/*
================================================================================
🏠 LANDING PAGE - Endless Tales
Location: app/page.tsx
Updated: February 15, 2026

PURPOSE:
Public landing page for new visitors. Single CTA → /welcome
Supports ?partner=slug for QR code partner promotions.
================================================================================
*/

'use client'

import React, { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

function LandingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const partner = searchParams.get('partner')
  const [partnerName, setPartnerName] = useState<string | null>(null)

  // Redirect logged-in users to /home — also listens for OAuth callback session
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) { router.push('/home'); return }
      } catch (err) {
        console.log('[DTT] Auth check skipped:', err)
      }
    }
    checkAuth()
    // Also listen for auth state changes — catches Google OAuth callback on iOS
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) router.push('/home')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load Google Fonts via link tag (avoids hydration mismatch from @import in style)
  useEffect(() => {
    if (!document.querySelector('link[href*="Playfair+Display"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  // Load partner name + fire scan tracking
  useEffect(() => {
    if (!partner) return
    // Fetch real partner name from DB
    fetch('/api/partner/name?slug=' + partner)
      .then(r => r.json())
      .then(d => { if (d.name) setPartnerName(d.name); else setPartnerName(partner.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())) })
      .catch(() => setPartnerName(partner.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())))
    // Fire scan event — dedupe by sessionId stored in sessionStorage
    try {
      const key = 'et_scan_' + partner
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        const sessionId = Math.random().toString(36).slice(2)
        fetch('/api/partner/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: partner, eventType: 'scan', sessionId }) })
      }
    } catch (_) {}
  }, [partner])

  const ctaHref = partner ? `/welcome?partner=${partner}` : '/welcome'

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0a0a0f', 
      color: '#f0ece4', 
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowX: 'hidden',
      WebkitFontSmoothing: 'antialiased'
    }}>

      <style>{`
        @keyframes roadScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(110px); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.7; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
        .land-fade1 { animation: fadeInUp 0.8s ease both; }
        .land-fade2 { animation: fadeInUp 0.8s ease 0.15s both; }
        .land-fade3 { animation: fadeInUp 0.8s ease 0.3s both; }
        .land-fade4 { animation: fadeInUp 0.8s ease 0.45s both; }
        .land-cta:hover {
          background: #ffc040 !important;
          transform: translateY(-2px);
          box-shadow: 0 0 60px rgba(240,160,48,0.3), 0 8px 30px rgba(0,0,0,0.5);
        }
        .land-card:hover {
          border-color: rgba(240,160,48,0.15) !important;
          transform: translateY(-4px);
        }
        .land-play:hover {
          background: rgba(240,160,48,0.18) !important;
          border-color: rgba(240,160,48,0.4) !important;
        }
      `}</style>

      {/* ===== TOP BAR ===== */}
      <header style={{
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '1.4rem' }}>🚛🚗</span>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.3rem',
            fontWeight: 700,
            color: '#f0ece4',
            letterSpacing: '0.02em',
          }}>
            Endless <span style={{ color: '#f0a030', fontStyle: 'italic' }}>Tales</span>
          </span>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: '2rem 1.5rem 3rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Atmospheric gradients */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(240,160,48,0.08) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(30,40,80,0.4) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 80% 70%, rgba(60,20,40,0.3) 0%, transparent 60%)',
          zIndex: 0
        }} />

        {/* Stars */}
        <Stars />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px' }}>
          {/* Partner badge */}
          {partnerName && (
            <div className="land-fade1" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '100px', padding: '8px 20px', fontSize: '0.85rem',
              fontWeight: 500, color: '#22c55e', marginBottom: '0.75rem'
            }}>
              Welcome from {partnerName}
            </div>
          )}

          <div className="land-fade1" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(240,160,48,0.2)',
            borderRadius: '100px', padding: '8px 20px', fontSize: '0.8rem',
            fontWeight: 500, color: '#f0a030', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const, marginBottom: '2rem',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{
              width: '6px', height: '6px', background: '#f0a030',
              borderRadius: '50%', animation: 'pulse 2s ease-in-out infinite'
            }} />
            Audio Stories for the Road
          </div>

          <h1 className="land-fade2" style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(2.8rem, 7vw, 5rem)',
            fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em',
            marginBottom: '1.5rem'
          }}>
            Stories That Make<br />Your Drive{' '}
            <span style={{
              background: 'linear-gradient(135deg, #f0a030 0%, #ffd080 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>Disappear</span>
          </h1>

          <p className="land-fade3" style={{
            fontSize: 'clamp(1.05rem, 2.5vw, 1.3rem)',
            fontWeight: 300, color: 'rgba(240,236,228,0.82)', lineHeight: 1.6,
            maxWidth: '540px', margin: '0 auto 2.5rem'
          }}>
            Hundreds of stories across every genre — mystery, comedy, sci-fi, history, horror, classics, and more. Hundreds of 15–20 minute episodes in series you can binge, plus hundreds of 30–90 minute standalone stories. Crafted for truckers, commuters, and road trippers. Hands-free. Eyes on the road. Mind somewhere extraordinary.
          </p>

          <div className="land-fade4" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'
          }}>
            <Link href={ctaHref} className="land-cta" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: '#f0a030', color: '#0a0a0f',
              fontFamily: "'DM Sans', sans-serif", fontSize: '1.1rem', fontWeight: 600,
              padding: '18px 44px', border: 'none', borderRadius: '60px',
              cursor: 'pointer', textDecoration: 'none',
              transition: 'all 0.3s ease',
              boxShadow: '0 0 40px rgba(240,160,48,0.3), 0 4px 20px rgba(0,0,0,0.4)'
            }}>
              ▶ &nbsp;Start your 14-day free trial
            </Link>
            <span style={{ fontSize: '0.85rem', color: 'rgba(240,236,228,0.55)' }}>
              Credit card required. Cancel before the trial ends and you won&apos;t be charged.
            </span>
            <Link href="/guest" style={{
              color: 'rgba(240,236,228,0.72)', fontSize: '0.9rem',
              textDecoration: 'underline', textUnderlineOffset: '4px'
            }}>
              Listen to 2 free stories as a guest
            </Link>
          </div>
        </div>
      </section>

      {/* ===== AUDIO SAMPLE ===== */}
      <AudioSampleSection />

      {/* ===== FEATURES ===== */}
      <section style={{ padding: '6rem 1.5rem', position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(240,160,48,0.03) 0%, transparent 70%)'
        }} />

        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <p style={{
            fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em',
            textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '1rem'
          }}>Built for Drivers</p>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, marginBottom: '1rem'
          }}>Your Commute, Transformed</h2>
          <p style={{
            color: 'rgba(240,236,228,0.82)', fontSize: '1.05rem', fontWeight: 300,
            maxWidth: '500px', margin: '0 auto', lineHeight: 1.6
          }}>Every feature designed for hands-free listening while you drive.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem', maxWidth: '960px', margin: '0 auto'
        }}>
          {[
            { icon: '🎧', title: 'Hundreds of Stories', desc: 'Hundreds of 15–20 minute episodes across series you can binge, plus hundreds of standalone stories from 30 to 90 minutes. Mystery, comedy, sci-fi, horror, classics, educational — whatever you\'re in the mood for.' },
            { icon: '🎭', title: 'Full-Cast Productions', desc: 'Professional voice actors, original music scores, and cinematic sound effects. Every story is a complete audio experience, not just someone reading aloud.' },
            { icon: '🛣️', title: 'Hands-Free Controls', desc: 'Large buttons, simple gestures, sticky playback bar. Designed so you never need to look at your phone while driving.' },
            { icon: '📚', title: 'Something for Everyone', desc: 'Learn something new with our educational series. Laugh out loud with comedy. Get lost in a thriller. Rediscover the classics. New stories added every week.' },
            { icon: '🎵', title: 'Road Trip Playlists', desc: "Heading cross-country? Build a playlist of multiple stories and series to carry you through the whole trip. Hours of entertainment, queued and ready." },
            { icon: '💰', title: 'Simple Access', desc: "Start with a 14-day free trial, then keep listening with one subscription. Cancel anytime before the trial ends and you won't be charged." },
          ].map((f, i) => (
            <div key={i} className="land-card" style={{
              background: '#12121a', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '20px', padding: '2rem', transition: 'all 0.4s ease'
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '1rem' }}>{f.icon}</span>
              <h3 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem'
              }}>{f.title}</h3>
              <p style={{
                fontSize: '0.95rem', fontWeight: 300, color: 'rgba(240,236,228,0.82)', lineHeight: 1.6
              }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" style={{ padding: '6rem 1.5rem', textAlign: 'center' }}>
        <p style={{
          fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em',
          textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '1rem'
        }}>Getting Started</p>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, marginBottom: '1rem'
        }}>Three Steps to Your First Story</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: '600px', margin: '3rem auto 0' }}>
          {[
            { num: '1', title: 'Start Your Free Trial', desc: "Create your account, choose a plan, and start a 14-day trial. Credit card required, with no charge if you cancel before the trial ends." },
            { num: '2', title: 'Browse the Library', desc: 'Filter by genre, length, or mood. Find stories that match your drive time.' },
            { num: '3', title: 'Hit Play and Drive', desc: 'Tap play, set your phone down, and let the story carry you to your destination.' },
          ].map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '1.5rem',
              textAlign: 'left', padding: '1.5rem 0', position: 'relative'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(240,160,48,0.1)', border: '1px solid rgba(240,160,48,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Playfair Display', serif", fontSize: '1.2rem',
                fontWeight: 700, color: '#f0a030', flexShrink: 0
              }}>{s.num}</div>
              {i < 2 && <div style={{
                position: 'absolute', left: '23px', top: '72px', width: '2px',
                height: 'calc(100% - 72px)',
                background: 'linear-gradient(to bottom, rgba(240,160,48,0.2), transparent)'
              }} />}
              <div>
                <h3 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem'
                }}>{s.title}</h3>
                <p style={{
                  fontSize: '0.95rem', fontWeight: 300, color: 'rgba(240,236,228,0.82)', lineHeight: 1.5
                }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section style={{ padding: '4rem 1.5rem 6rem', textAlign: 'center' }}>
        <p style={{
          fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em',
          textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '2rem'
        }}>Trusted by Drivers</p>

        <div style={{
          display: 'flex', justifyContent: 'center', gap: '3rem',
          flexWrap: 'wrap', marginBottom: '4rem'
        }}>
          {[
            { num: '100s', label: 'of Stories' },
            { num: '10+', label: 'Genres' },
            { num: '20min', label: 'Episodes' },
          ].map((s, i) => (
            <div key={i} style={{ minWidth: '120px' }}>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(2.2rem, 5vw, 3rem)', fontWeight: 800,
                color: '#f0a030', lineHeight: 1, marginBottom: '0.4rem'
              }}>{s.num}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 400, color: 'rgba(240,236,228,0.82)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem', maxWidth: '880px', margin: '0 auto'
        }}>
          {[
            { text: "I drive 8 hours a day hauling freight. I loaded up a road trip playlist with three different series and the miles just vanished. Way better than talk radio.", author: 'Jake R.', role: 'Long-haul trucker, Tennessee' },
            { text: "Started with a comedy series for my commute, then got hooked on Origin 2.0. Now I'm learning about the Big Bang on the way to work. I actually look forward to traffic.", author: 'Maria S.', role: 'Daily commuter, Atlanta' },
            { text: "The production quality blew me away. Original music, sound effects, real voice actors. It's like a movie playing in your head while you drive.", author: 'Chris T.', role: 'Regional driver, Ohio' },
          ].map((t, i) => (
            <div key={i} style={{
              background: '#12121a', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px', padding: '1.75rem', textAlign: 'left'
            }}>
              <div style={{ color: '#f0a030', fontSize: '0.9rem', marginBottom: '0.75rem', letterSpacing: '2px' }}>★★★★★</div>
              <p style={{
                fontSize: '0.95rem', fontWeight: 300, color: 'rgba(240,236,228,0.82)',
                lineHeight: 1.6, marginBottom: '1rem', fontStyle: 'italic'
              }}>"{t.text}"</p>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{t.author}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,236,228,0.55)' }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section style={{
        padding: '6rem 1.5rem 8rem', textAlign: 'center', position: 'relative'
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 60% at 50% 60%, rgba(240,160,48,0.06) 0%, transparent 70%)'
        }} />

        <p style={{
          fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em',
          textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '1rem'
        }}>Ready?</p>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, marginBottom: '1rem'
        }}>
          Your Next Drive<br />Starts{' '}
          <span style={{
            background: 'linear-gradient(135deg, #f0a030 0%, #ffd080 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>Here</span>
        </h2>
        <p style={{
          color: 'rgba(240,236,228,0.82)', fontSize: '1.05rem', fontWeight: 300,
          maxWidth: '500px', margin: '0 auto 2.5rem', lineHeight: 1.6
        }}>Join thousands of drivers who turned dead miles into the best part of their day.</p>
        <Link href={ctaHref} className="land-cta" style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          background: '#f0a030', color: '#0a0a0f',
          fontFamily: "'DM Sans', sans-serif", fontSize: '1.1rem', fontWeight: 600,
          padding: '18px 44px', border: 'none', borderRadius: '60px',
          cursor: 'pointer', textDecoration: 'none', position: 'relative', zIndex: 1,
          transition: 'all 0.3s ease',
          boxShadow: '0 0 40px rgba(240,160,48,0.3), 0 4px 20px rgba(0,0,0,0.4)'
        }}>
          ▶ &nbsp;Start your 14-day free trial
        </Link>
        <div style={{ position: 'relative', zIndex: 1, marginTop: '1rem' }}>
          <Link href="/guest" style={{
            color: 'rgba(240,236,228,0.72)', fontSize: '0.9rem',
            textDecoration: 'underline', textUnderlineOffset: '4px'
          }}>
            Listen to 2 free stories as a guest
          </Link>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{
        padding: '2rem 1.5rem', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}><span style={{ fontSize: '1.2rem' }}>🚛🚗</span> Endless <span style={{ color: '#f0a030', fontStyle: 'italic', marginLeft: '4px' }}>Tales</span></div>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1rem'
        }}>
          {[
            { label: 'Subscription', href: '/subscribe' },
            { label: 'About', href: '/about' },
            { label: 'Start Free Trial', href: '/signup' },
          ].map((l, i) => (
            <Link key={i} href={l.href} style={{
              fontSize: '0.85rem',
              color: l.label === 'Start Free Trial' ? '#f0a030' : 'rgba(240,236,228,0.55)',
              fontWeight: l.label === 'Start Free Trial' ? 600 : 400,
              textDecoration: 'none', transition: 'color 0.3s'
            }}>{l.label}</Link>
          ))}
        </div>
        <p style={{ fontSize: '0.8rem', color: 'rgba(240,236,228,0.55)' }}>
          © 2026 Wonder Books Press. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

// Audio Sample Player component
function AudioSampleSection() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio('/audio/Got_a_long_drive_ahead.mp3')
    audio.preload = 'metadata'
    audioRef.current = audio

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
        setCurrentTime(audio.currentTime)
      }
    }
    const handleLoaded = () => setDuration(audio.duration)
    const handleEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0) }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
    }
  }, [])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
    setIsPlaying(!isPlaying)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    audioRef.current.currentTime = pct * duration
    setProgress(pct * 100)
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <section style={{ padding: '4rem 1.5rem 6rem', textAlign: 'center', position: 'relative' }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '200px', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(240,160,48,0.3), transparent)'
      }} />

      <p style={{
        fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em',
        textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '1rem'
      }}>Try Before You Sign Up</p>
      <h2 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, marginBottom: '1rem'
      }}>Hear the Difference</h2>
      <p style={{
        color: 'rgba(240,236,228,0.82)', fontSize: '1.05rem', fontWeight: 300,
        maxWidth: '500px', margin: '0 auto 3rem', lineHeight: 1.6
      }}>Professional voice acting, cinematic soundscapes, and stories crafted for the road.</p>

      <div style={{
        maxWidth: '480px', margin: '0 auto', background: '#12121a',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px',
        padding: '2rem', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 30% 20%, rgba(240,160,48,0.05) 0%, transparent 60%)'
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          marginBottom: '1.5rem', position: 'relative', zIndex: 1
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #1a1a2e, #2a1a3e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem', flexShrink: 0
          }}>🚛🚗</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px'
            }}>Endless Tales</div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(240,236,228,0.82)' }}>Preview — What You'll Hear</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(240,236,228,0.55)', marginTop: '2px' }}>
              {duration > 0 ? formatTime(duration) : '1:00'} sample
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          onClick={handleProgressClick}
          style={{
            height: '6px', background: 'rgba(240,160,48,0.15)', borderRadius: '3px',
            marginBottom: '0.75rem', cursor: 'pointer', position: 'relative', zIndex: 1
          }}
        >
          <div style={{
            height: '100%', background: '#f0a030', borderRadius: '3px',
            width: `${progress}%`, transition: 'width 0.1s linear'
          }} />
        </div>

        {/* Time display */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.75rem', color: 'rgba(240,236,228,0.55)',
          marginBottom: '1rem', position: 'relative', zIndex: 1
        }}>
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '1:00'}</span>
        </div>

        <button onClick={togglePlay} className="land-play" style={{
          width: '100%', padding: '14px',
          background: isPlaying ? 'rgba(240,160,48,0.18)' : 'rgba(240,160,48,0.1)',
          border: `1px solid ${isPlaying ? 'rgba(240,160,48,0.4)' : 'rgba(240,160,48,0.25)'}`,
          borderRadius: '12px', color: '#f0a030',
          fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.3s',
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}>
          {isPlaying ? '⏸ Playing...' : '▶ Play Sample'}
        </button>
      </div>
    </section>
  )
}

// Stars background component
function Stars() {
  const [stars, setStars] = useState<Array<{ left: string; top: string; delay: string; duration: string; size: string }>>([])

  useEffect(() => {
    const generated = Array.from({ length: 60 }, () => ({
      left: Math.random() * 100 + '%',
      top: Math.random() * 70 + '%',
      delay: Math.random() * 4 + 's',
      duration: (3 + Math.random() * 3) + 's',
      size: (1 + Math.random() * 2) + 'px',
    }))
    setStars(generated)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      {stars.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', width: s.size, height: s.size,
          background: '#f0ece4', borderRadius: '50%', opacity: 0,
          left: s.left, top: s.top,
          animation: `twinkle ${s.duration} ease-in-out ${s.delay} infinite`
        }} />
      ))}
    </div>
  )
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#0a0a0f',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          width: '2rem', height: '2rem',
          border: '4px solid #f0a030', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite'
        }} />
      </div>
    }>
      <LandingContent />
    </Suspense>
  )
}
