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
import { connectionInfo, wifiRefillAllowed, refillPlaylist } from '@/lib/offline/refill'

export default function OfflineBootstrap() {
  const { session } = useAuth()
  const token = session?.access_token
  const userId = session?.user.id

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

  useEffect(() => {
    if (!token || !userId || !offlineSupported()) return
    let stopped = false, running = false
    const connection = connectionInfo()
    const allowed = () => !stopped && document.visibilityState === 'visible' && wifiRefillAllowed(navigator.onLine, connectionInfo())
    const refill = async () => {
      if (running || !allowed()) return
      running = true
      try {
        await refreshOfflineLicense(token)
        await refillPlaylist({ accessToken: token, userId, allowed })
      } catch (err) { console.warn('[offline] Refill paused; will retry on the next connection.', err) }
      finally { running = false }
    }
    const schedule = () => { void refill() }
    schedule()
    const events = ['online', 'focus', 'et_playlist_saved', 'et_downloads_changed']
    events.forEach(name => window.addEventListener(name, schedule))
    document.addEventListener('visibilitychange', schedule)
    connection?.addEventListener?.('change', schedule)
    const timer = window.setInterval(schedule, 60000)
    return () => {
      stopped = true
      events.forEach(name => window.removeEventListener(name, schedule))
      document.removeEventListener('visibilitychange', schedule)
      connection?.removeEventListener?.('change', schedule)
      window.clearInterval(timer)
    }
  }, [token, userId])

  return null
}
