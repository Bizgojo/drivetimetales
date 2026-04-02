'use client'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'

export default function HomeHeader() {
  const { user } = useAuth()
  const userInitial = user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'
  const isFoundingMember = (user as any)?.is_founding_member

  const [showPWAButton, setShowPWAButton] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Don't show if already dismissed or installed
    if (localStorage.getItem('et_pwa_dismissed')) return
    // Don't show if already running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Detect platform
    const ua = navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua)) {
      setPlatform('ios')
      setShowPWAButton(true)
    } else if (/android/i.test(ua)) {
      setPlatform('android')
      setShowPWAButton(true)
    } else {
      // Desktop — skip
      setShowPWAButton(false)
    }

    // Capture Android install prompt
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('et_pwa_dismissed', '1')
    setShowModal(false)
    setShowPWAButton(false)
  }

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        localStorage.setItem('et_pwa_dismissed', '1')
        setShowPWAButton(false)
      }
      setDeferredPrompt(null)
    }
    setShowModal(false)
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <button onClick={() => window.history.back()} className="w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} aria-label="Go back">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Link href="/home" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', gap: '4px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '32px', height: '32px', borderRadius: '7px' }} />
              <span style={{ color: 'white' }}>Endless </span>
              <span style={{ color: '#fb923c' }}>Tales</span>
            </span>
            {isFoundingMember && (
              <span style={{ fontSize: '0.55rem', fontWeight: 700, background: '#f0a030', color: '#0a0a0f', padding: '2px 10px', borderRadius: '20px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Founding Member
              </span>
            )}
            {showPWAButton && !isFoundingMember && (
              <button
                onClick={e => { e.preventDefault(); setShowModal(true) }}
                style={{ fontSize: '0.6rem', fontWeight: 700, background: '#f97316', color: 'white', padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.05em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                📲 Put Us On Your Phone
              </button>
            )}
          </Link>
          <Link href="/account" className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-black font-bold text-lg transition-colors flex-shrink-0">
            {userInitial}
          </Link>
        </div>
      </header>

      {/* PWA Install Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px' }}
          onClick={handleDismiss}>
          <div style={{ background: '#0f172a', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 420, border: '1px solid rgba(249,115,22,0.3)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 12 }} />
              <div style={{ color: 'white', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Put Us On Your Phone</div>
              <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>Get one-tap access to Endless Tales — no app store needed.</div>
            </div>

            {platform === 'ios' && (
              <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
                <div style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Follow these steps in Safari:</div>
                {[
                  ['1', 'Tap the Share button', 'at the bottom of your screen', '⬆️'],
                  ['2', 'Scroll down and tap', '"Add to Home Screen"', '➕'],
                  ['3', 'Tap "Add"', 'in the top right corner', '✅'],
                ].map(([num, line1, line2, icon]) => (
                  <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'white', fontSize: 12, fontWeight: 800 }}>{num}</span>
                    </div>
                    <div>
                      <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{line1} <span style={{ fontSize: 16 }}>{icon}</span></div>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>{line2}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {platform === 'android' && (
              <button
                onClick={handleAndroidInstall}
                style={{ width: '100%', padding: '16px', background: '#f97316', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}
              >
                📲 Add to Home Screen
              </button>
            )}

            <button
              onClick={handleDismiss}
              style={{ width: '100%', padding: '12px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </>
  )
}
