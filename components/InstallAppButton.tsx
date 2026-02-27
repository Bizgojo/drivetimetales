'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      setIsInstalled(true)
    }
  }

  if (isInstalled || !installPrompt) return null

  return (
    <button
      onClick={handleInstall}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: '#1e293b',
        border: '1px solid rgba(249, 115, 22, 0.4)',
        borderRadius: '12px',
        padding: '10px 16px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        marginBottom: '12px',
      }}
    >
      <img src="/icons/icon-192x192.png" alt="Endless Tales"
        style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'white', fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>
          Add to Home Screen
        </div>
        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
          Get the Endless Tales app
        </div>
      </div>
      <span style={{ background: '#f97316', color: 'white', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', flexShrink: 0 }}>
        Install
      </span>
    </button>
  )
}
