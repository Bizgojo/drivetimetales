'use client'

// OFFLINE-DL-001 iOS requirement: Safari erases a site's stored data after 7
// days without a visit (Home Screen apps are exempt) and can't download in
// the background. Nudge iPhone users to the Home Screen app, and warn when
// they download in a plain browser tab.

import { useEffect, useState } from 'react'
import { detectIosBrowser, iosBrowserLabel, type IosBrowser } from '@/lib/iosBrowser'

export function useIosDownloadContext(): { ios: boolean; standalone: boolean; browser: IosBrowser } {
  const [ctx, setCtx] = useState({ ios: false, standalone: false, browser: 'not-ios' as IosBrowser })
  useEffect(() => {
    const browser = detectIosBrowser(navigator.userAgent)
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setCtx({ ios: browser !== 'not-ios', standalone, browser })
  }, [])
  return ctx
}

export default function IosHomeScreenNotice({ variant }: { variant: 'before' | 'after' }) {
  const { ios, standalone, browser } = useIosDownloadContext()
  if (!ios || standalone) return null
  const howTo = browser === 'safari'
    ? <>Tap <b>Share</b> <span aria-hidden>⎋</span>, then <b>Add to Home Screen</b>, and download from the Home Screen app.</>
    : <>Open endless-tales.com in <b>Safari</b> (not {iosBrowserLabel(browser)}), tap <b>Share</b>, then <b>Add to Home Screen</b>.</>
  return (
    <div role="note" style={{ background: '#422006', border: '1px solid #f97316', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', lineHeight: 1.45, color: '#fff', textAlign: 'left' }}>
      <b>{variant === 'before' ? 'On iPhone, add Endless Tales to your Home Screen first.' : 'Heads up: this download is in a browser tab.'}</b>{' '}
      Safari can erase downloads saved in a tab after 7 days without a visit, and a download stops if you leave the page before it finishes. {howTo}
    </div>
  )
}
