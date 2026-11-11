'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isSwipePage, swipeTarget } from '@/lib/pageSwipe'

/**
 * PAGE-SWIPE-001 (Marc, Nov 10, 2026; canon item 135): side swipe between
 * Library, Home and Account only. Swipes that start on a row that scrolls
 * sideways, on a form field or slider, or outside the page content (header,
 * Continue card, mini player) never change the page. The header buttons still
 * work, and VoiceOver/TalkBack keep their own swipe gestures (they do not
 * deliver one-finger swipes to the page).
 */
function startsOnSideScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== document.body) {
    if (el.closest('[data-no-page-swipe]') === el) return true
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    const style = window.getComputedStyle(el)
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true
    el = el.parentElement
  }
  return false
}

export default function PageSwipeNav() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isSwipePage(pathname)) return
    let start: { x: number; y: number; t: number } | null = null

    const onStart = (e: TouchEvent) => {
      start = null
      if (e.touches.length !== 1) return
      const target = e.target
      if (!(target instanceof Element) || !target.closest('main')) return
      // No page swipe while a pop-up (review screen, dialog) is open.
      if (document.querySelector('[aria-modal="true"]')) return
      if (startsOnSideScroller(target)) return
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
    }
    const onEnd = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const next = swipeTarget({
        pathname, startX: start.x, startY: start.y, endX: t.clientX, endY: t.clientY,
        durationMs: Date.now() - start.t, screenWidth: window.innerWidth,
      })
      start = null
      if (next) router.push(next)
    }
    const onCancel = () => { start = null }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [pathname, router])

  return null
}
