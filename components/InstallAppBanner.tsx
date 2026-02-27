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

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) { setIsInstalled(true); return }
    if (localStorage.getItem('et_install_dismissed')) { setDismissed(true); return }
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), 2000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setInstallPrompt(null); setIsInstalled(true); setVisible(false) }
  }

  const handleDismiss = () => {
    setVisible(false)
    setDismissed(true)
    localStorage.setItem('et_install_dismissed', '1')
  }

  if (isInstalled || dismissed || !installPrompt) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        background: '#1e293b', borderTop: '1px solid rgba(249, 115, 22, 0.3)',
        padding: '14px 16px 20px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <img src="/icons/icon-192x192.png" alt="Endless Tales"
          style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>Add Endless Tales to your home screen</div>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>Listen anytime, even offline</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
          <button onClick={handleInstall} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Install
          </button>
          <button onClick={handleDismiss} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '11px', cursor: 'pointer', textAlign: 'center' }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
