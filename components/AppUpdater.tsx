'use client'

// APP-UPDATE-001: keeps an open app on the latest release (see lib/appUpdate.ts).
import { useCallback, useEffect, useRef, useState } from 'react'
import { decideUpdate, UPDATE_CHECK_EVERY_MS } from '@/lib/appUpdate'

const CURRENT = process.env.NEXT_PUBLIC_APP_VERSION || ''
const RELOADED_KEY = 'et-app-reloaded-for'

function somethingPlaying(): boolean {
  return Array.from(document.querySelectorAll('audio, video')).some((el) => {
    const m = el as HTMLMediaElement
    return !m.paused && !m.ended && m.currentTime > 0
  })
}

function readReloaded(): string | null {
  try { return sessionStorage.getItem(RELOADED_KEY) } catch { return null }
}

export default function AppUpdater() {
  const [ready, setReady] = useState(false)
  const pending = useRef<string | null>(null)

  const doReload = useCallback((server: string) => {
    try { sessionStorage.setItem(RELOADED_KEY, server) } catch { /* private mode */ }
    navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {}).finally(() => window.location.reload())
  }, [])

  const check = useCallback(async (trigger: 'open' | 'return' | 'timer') => {
    if (!CURRENT || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    let server = ''
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return
      server = String((await res.json())?.version || '')
    } catch { return }
    const decision = decideUpdate({
      current: CURRENT,
      server,
      playing: somethingPlaying(),
      trigger,
      adminPage: window.location.pathname.startsWith('/admin'),
      alreadyReloadedFor: readReloaded(),
    })
    if (decision === 'reload') doReload(server)
    else if (decision === 'banner') { pending.current = server; setReady(true) }
  }, [doReload])

  useEffect(() => {
    check('open')
    const onVisible = () => { if (document.visibilityState === 'visible') check('return') }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') check('timer') }, UPDATE_CHECK_EVERY_MS)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer) }
  }, [check])

  if (!ready) return null
  return (
    <div role="status" className="fixed left-0 right-0 z-[100] flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div className="flex items-center gap-3 rounded-xl bg-amber-500 text-gray-950 shadow-lg px-4 py-3 text-base font-semibold">
        <span>A new version of Endless Tales is ready.</span>
        <button
          type="button"
          className="rounded-lg bg-gray-950 text-white px-4 py-2 text-base font-bold"
          onClick={() => doReload(pending.current || '')}
        >
          Update
        </button>
        <button type="button" aria-label="Later" className="px-2 py-2 text-base" onClick={() => setReady(false)}>Later</button>
      </div>
    </div>
  )
}
