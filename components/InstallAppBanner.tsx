'use client'

import { useState, useEffect } from 'react'
import { INSTALL_REOFFER_EVENT, consumeInstallReoffer } from '@/lib/installReoffer'
import { detectIosBrowser, iosBrowserLabel, type IosBrowser } from '@/lib/iosBrowser'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallAppBannerProps {
  /**
   * RETENTION-PATH-001: when true, the banner never auto-shows on a timer —
   * it only appears when a completed-story re-offer fires (requestInstallReoffer).
   * Used on player surfaces so the banner can't overlay playback controls
   * mid-story.
   */
  reofferOnly?: boolean
}

export default function InstallAppBanner({ reofferOnly = false }: InstallAppBannerProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [iosBrowser, setIosBrowser] = useState<IosBrowser>('not-ios')
  const [copied, setCopied] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true)
      return
    }

    const previouslyDismissed = Boolean(localStorage.getItem('et_install_dismissed'))

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)
    setIosBrowser(detectIosBrowser(navigator.userAgent))

    let showTimer: ReturnType<typeof setTimeout> | null = null

    // Always capture beforeinstallprompt (even if dismissed / reofferOnly) so
    // a completed-story re-offer can still use the native Android install flow.
    const promptHandler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      if (!reofferOnly && !previouslyDismissed) {
        showTimer = setTimeout(() => setVisible(true), 2000)
      }
    }
    window.addEventListener('beforeinstallprompt', promptHandler)

    const installedHandler = () => { setIsInstalled(true); setVisible(false) }
    window.addEventListener('appinstalled', installedHandler)

    // Initial auto-show (iOS has no beforeinstallprompt)
    if (ios && !reofferOnly && !previouslyDismissed) {
      showTimer = setTimeout(() => setVisible(true), 3000)
    }

    // RETENTION-PATH-001: completed-story re-offer overrides prior dismissal.
    // Flag path covers navigation (complete on player → land on /home);
    // event path covers a banner already mounted on the completion surface.
    if (consumeInstallReoffer()) {
      setVisible(true)
    }
    const reofferHandler = () => {
      consumeInstallReoffer()
      setVisible(true)
    }
    window.addEventListener(INSTALL_REOFFER_EVENT, reofferHandler)

    return () => {
      if (showTimer) clearTimeout(showTimer)
      window.removeEventListener('beforeinstallprompt', promptHandler)
      window.removeEventListener('appinstalled', installedHandler)
      window.removeEventListener(INSTALL_REOFFER_EVENT, reofferHandler)
    }
  }, [reofferOnly])

  const handleAndroidInstall = async () => {
    if (!installPrompt) {
      // Chrome won't re-fire beforeinstallprompt after a native-prompt dismissal
      // in the same session — fall back to manual menu instructions.
      setShowGuide(true)
      return
    }
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setInstallPrompt(null); setIsInstalled(true); setVisible(false) }
  }

  // ATL-INSTALL-SHEET-001: Chrome/Firefox/etc. on iOS can't add to home screen —
  // let the user copy the URL to paste into Safari.
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard unavailable — button just won't confirm */ }
  }

  const handleDismiss = () => {
    setVisible(false); setShowGuide(false)
    localStorage.setItem('et_install_dismissed', '1')
  }

  if (isInstalled || !visible) return null

  const steps = isIOS
    ? [
        { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
        { icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
        { icon: '✓', text: 'Tap "Add" — Endless Tales appears on your home screen' },
      ]
    : [
        { icon: '⋮', text: 'Tap the menu (three dots) in the top right of Chrome' },
        { icon: '➕', text: 'Tap "Add to Home Screen" (or "Install app")' },
        { icon: '✓', text: 'Confirm — Endless Tales appears on your home screen' },
      ]

  // ATL-INSTALL-SHEET-001: on iOS in a non-Safari browser, flip the sheet —
  // lead with the Safari requirement + copy-link, then show the Safari steps.
  const nonSafariIos = isIOS && iosBrowser !== 'safari' && iosBrowser !== 'not-ios'

  if (showGuide) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(4px)' }}>
        <div style={{ width: '100%', background: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px 24px 44px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/icons/icon-192x192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10 }} />
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>Add to Home Screen</div>
                <div style={{ color: 'white', fontSize: 12 }}>Get the full app experience</div>
              </div>
            </div>
            <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
          {nonSafariIos && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                <span style={{ color: 'white', fontSize: 14, lineHeight: 1.5 }}>
                  You&apos;re in {iosBrowserLabel(iosBrowser)} — this needs Safari. Copy the link below, open Safari, and paste it in the address bar. Then:
                </span>
              </div>
              <button
                onClick={handleCopyLink}
                style={{ width: '100%', marginTop: 12, background: copied ? '#16a34a' : '#f97316', color: 'white', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                {copied ? 'Copied ✓' : '🔗 Copy link for Safari'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{step.icon}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.5 }}>{step.text}</div>
              </div>
            ))}
          </div>
          {isIOS && !nonSafariIos && (
            <div style={{ marginTop: 20, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
              <span style={{ color: 'white', fontSize: 13, lineHeight: 1.5 }}>Make sure you&apos;re using Safari — this won&apos;t work in Chrome or Firefox on iPhone.</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998, background: '#1e293b', borderTop: '1px solid rgba(249,115,22,0.3)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <img src="/icons/icon-192x192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Add Endless Tales to your home screen</div>
        <div style={{ color: 'white', fontSize: 12 }}>Launch instantly like a native app</div>
      </div>
      {isIOS
        ? <button onClick={() => setShowGuide(true)} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>How To</button>
        : <button onClick={handleAndroidInstall} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Install</button>
      }
      <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>✕</button>
    </div>
  )
}
