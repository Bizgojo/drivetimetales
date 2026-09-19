'use client'

// OFFLINE-DL-001: mounted once in the root layout.
//  - Registers the service worker on EVERY page (it was only registered by
//    InstallAppBanner on /home and the player), so the offline player is
//    precached before the user loses signal.
//  - Whenever online with a session: re-verify the offline license (extends
//    it; deletes paid downloads if the subscription lapsed).

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { refreshOfflineLicense } from '@/lib/offline/download'
import { offlineSupported } from '@/lib/offline/store'

export default function OfflineBootstrap() {
  const { session } = useAuth()
  const token = session?.access_token

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  useEffect(() => {
    if (!token || !offlineSupported()) return
    const sync = () => {
      if (!navigator.onLine) return
      refreshOfflineLicense(token)
        .then(({ purged }) => { if (purged) console.warn(`[offline] removed ${purged} download(s): offline access no longer active`) })
        .catch(err => console.warn('[offline] license refresh failed (will retry when online):', err))
    }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [token])

  return null
}
