'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (window.matchMedia('(display-mode: standalone)').matches) { setIsInstalled(true); return }
    if (localStorage.getItem('et_install_dismissed')) { setDismissed(true); return }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)
    if (ios) {
      setTimeout(() => setVisible(true), 3000)
    } else {
      const handler = (e: Event) => {
        e.preventDefault()
        setInstallPrompt(e as BeforeInstallPromptEvent)
        setTimeout(() => setVisible(true), 2000)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleAndroidInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setInstallPrompt(null); setIsInstalled(true); setVisible(false) }
  }

  const handleDismiss = () => {
    setVisible(false); setDismissed(true)
    localStorage.setItem('et_install_dismissed', '1')
  }

  if (isInstalled || dismissed || !visible) return null

  if (isIOS && showIOSGuide) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(4px)' }}>
        <div style={{ width: '100%', background: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px 24px 44px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/icons/icon-192x192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10 }} />
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>Add to Home Screen</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Get the full app experience</div>
              </div>
            </div>
            <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
              { icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
              { icon: '✓', text: 'Tap "Add" — Endless Tales appears on your home screen' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{step.icon}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.5 }}>{step.text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5 }}>Make sure you&apos;re using Safari — this won&apos;t work in Chrome or Firefox on iPhone.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998, background: '#1e293b', borderTop: '1px solid rgba(249,115,22,0.3)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <img src="/icons/icon-192x192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Add Endless Tales to your home screen</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Launch instantly like a native app</div>
      </div>
      {isIOS
        ? <button onClick={() => setShowIOSGuide(true)} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>How To</button>
        : <button onClick={handleAndroidInstall} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Install</button>
      }
      <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>✕</button>
    </div>
  )
}
