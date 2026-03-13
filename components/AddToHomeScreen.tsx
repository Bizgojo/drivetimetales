'use client'

import { useEffect, useState, useRef } from 'react'

type Platform = 'android' | 'ios' | 'other'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
}

export default function AddToHomeScreen() {
  // Detect platform immediately (runs client-side only)
  const [platform, setPlatform] = useState<Platform>(() =>
    typeof window !== 'undefined' ? detectPlatform() : 'other'
  )
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showIOSModal, setShowIOSModal] = useState(false)
  const [installed, setInstalled] = useState(() =>
    typeof window !== 'undefined' ? isInStandaloneMode() : false
  )
  const [dismissed, setDismissed] = useState(false)
  const promptRef = useRef<any>(null)

  useEffect(() => {
    setPlatform(detectPlatform())
    if (isInStandaloneMode()) { setInstalled(true); return }

    // Android Chrome: capture the install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      promptRef.current = e
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide button after user installs
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  // Don't show if already installed, dismissed, or unsupported platform
  if (installed || dismissed) return null
  if (platform === 'other' && !deferredPrompt) return null

  const handleAndroidInstall = async () => {
    if (!promptRef.current) return
    promptRef.current.prompt()
    const choice = await promptRef.current.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    promptRef.current = null
    setDeferredPrompt(null)
  }

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '14px',
    backgroundColor: '#f97316',
    color: 'white',
    border: 'none',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  }

  return (
    <>
      {/* Install button */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          style={buttonStyle}
          onClick={() => {
            if (platform === 'android' && deferredPrompt) handleAndroidInstall()
            else if (platform === 'ios') setShowIOSModal(true)
            else setShowIOSModal(true)
          }}
        >
          <span style={{ fontSize: '20px' }}>📲</span>
          Add to Home Screen
        </button>
      </div>

      {/* iOS instructions modal */}
      {showIOSModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end',
          }}
          onClick={() => setShowIOSModal(false)}
        >
          <div
            style={{
              width: '100%',
              backgroundColor: '#1e293b',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px 40px',
              color: 'white',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div style={{ width: '40px', height: '4px', backgroundColor: '#475569', borderRadius: '2px', margin: '0 auto 20px' }} />

            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px', textAlign: 'center' }}>
              Add to Home Screen
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', margin: '0 0 24px' }}>
              Get instant access from your home screen — no app store needed.
            </p>

            {/* Steps */}
            {[
              { icon: '⬆️', text: 'Tap the Share button at the bottom of your browser' },
              { icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
              { icon: '✅', text: 'Tap "Add" in the top right corner' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: '#f97316', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '18px', flexShrink: 0,
                }}>
                  {step.icon}
                </div>
                <div style={{ paddingTop: '6px', fontSize: '15px', color: '#e2e8f0', lineHeight: 1.4 }}>
                  {step.text}
                </div>
              </div>
            ))}

            <button
              onClick={() => { setShowIOSModal(false); setDismissed(true) }}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                backgroundColor: '#334155', color: '#94a3b8',
                border: 'none', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', marginTop: '8px',
                touchAction: 'manipulation',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
