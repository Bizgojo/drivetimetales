/**
 * Endless Tales — Cover Performance Tracking (C6)
 *
 * Client-side impression + tap tracking for story-card covers.
 * All calls are fire-and-forget and batched — never block the UI.
 *
 * Instrumentation contract (zero-layout-risk): card root elements carry
 *   data-cover-track="<storyId>"  data-cover-page="<surface>"  data-cover-pos="<1-based position>"
 * and a single <CoverTracking /> component per page installs the observers.
 */

type CoverEventType = 'impression' | 'tap'

type CoverEvent = {
  type: CoverEventType
  storyId: string
  page: string
  position: number | null
}

const ENDPOINT = '/api/analytics/cover-impressions'
const FLUSH_INTERVAL_MS = 3000
const MAX_BATCH = 40
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let queue: CoverEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let listenersInstalled = false

// One impression per story+page per page view (pathname change = new page view).
let firedPath = ''
const firedKeys = new Set<string>()

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function getAnonId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    let id = localStorage.getItem('et_anon_id')
    if (!id || id.length > 64) {
      id = generateUUID()
      localStorage.setItem('et_anon_id', id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

function buildPayload(events: CoverEvent[]) {
  return JSON.stringify({ anonId: getAnonId(), events })
}

function flush(useBeacon = false) {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!queue.length) return
  const events = queue.splice(0, queue.length)
  const body = buildPayload(events)
  try {
    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
      return
    }
    if (typeof fetch !== 'undefined') {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {})
    }
  } catch {
    // fire-and-forget — never surface tracking errors
  }
}

function scheduleFlush() {
  if (queue.length >= MAX_BATCH) {
    flush()
    return
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => flush(), FLUSH_INTERVAL_MS)
}

function installLifecycleListeners() {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
}

function currentPath(): string {
  return typeof window !== 'undefined' ? window.location.pathname : ''
}

function resetFiredIfNavigated() {
  const path = currentPath()
  if (path !== firedPath) {
    firedPath = path
    firedKeys.clear()
  }
}

export function trackCoverImpression(storyId: string, page: string, position: number | null) {
  if (typeof window === 'undefined') return
  if (!UUID_RE.test(storyId || '')) return
  resetFiredIfNavigated()
  const key = `${page}|${storyId}`
  if (firedKeys.has(key)) return
  firedKeys.add(key)
  installLifecycleListeners()
  queue.push({ type: 'impression', storyId, page: String(page || 'unknown').slice(0, 40), position })
  scheduleFlush()
}

export function trackCoverTap(storyId: string, page: string, position: number | null) {
  if (typeof window === 'undefined') return
  if (!UUID_RE.test(storyId || '')) return
  installLifecycleListeners()
  queue.push({ type: 'tap', storyId, page: String(page || 'unknown').slice(0, 40), position })
  // A tap usually precedes navigation — flush immediately (keepalive).
  flush()
}

function readCardDataset(el: Element): { storyId: string; page: string; position: number | null } | null {
  const storyId = el.getAttribute('data-cover-track') || ''
  if (!UUID_RE.test(storyId)) return null
  const page = el.getAttribute('data-cover-page') || 'unknown'
  const rawPos = Number(el.getAttribute('data-cover-pos'))
  const position = Number.isFinite(rawPos) && rawPos > 0 ? Math.min(Math.round(rawPos), 500) : null
  return { storyId, page, position }
}

/**
 * Install IntersectionObserver + MutationObserver + delegated click listener
 * for all `[data-cover-track]` elements. Returns a cleanup function.
 * Safe to call from multiple pages — instances are independent.
 */
export function initCoverTracking(): () => void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return () => {}

  installLifecycleListeners()

  const observed = new WeakSet<Element>()

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.4) return
        const meta = readCardDataset(entry.target)
        if (meta) trackCoverImpression(meta.storyId, meta.page, meta.position)
        io.unobserve(entry.target)
      })
    },
    { threshold: 0.4 }
  )

  const scan = (root: ParentNode) => {
    root.querySelectorAll?.('[data-cover-track]')?.forEach(el => {
      if (observed.has(el)) return
      observed.add(el)
      io.observe(el)
    })
  }

  scan(document)

  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return
        const el = node as Element
        if (el.hasAttribute?.('data-cover-track') && !observed.has(el)) {
          observed.add(el)
          io.observe(el)
        }
        scan(el)
      })
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null
    const card = target?.closest?.('[data-cover-track]')
    if (!card) return
    const meta = readCardDataset(card)
    if (meta) trackCoverTap(meta.storyId, meta.page, meta.position)
  }
  document.addEventListener('click', onClick, { capture: true, passive: true })

  return () => {
    io.disconnect()
    mo.disconnect()
    document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions)
    flush(true)
  }
}
