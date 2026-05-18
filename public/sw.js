// Endless Tales Service Worker v5
// Full offline support: app shell + audio caching

const SHELL_CACHE  = 'et-shell-v5'
const AUDIO_CACHE  = 'et-audio-v1'

// App shell pages to cache on install
const SHELL_URLS = [
  '/offline.html',
  '/home',
  '/library',
  '/player/playlist',
  '/library-playlist',
]

// Audio file patterns to cache on fetch
function isAudioRequest(url) {
  return (
    url.endsWith('.mp3') ||
    url.endsWith('.m4a') ||
    url.endsWith('.wav') ||
    url.includes('/audio/') ||
    url.includes('/storage/v1/object/public/audio')
  )
}

function isAudioDomain(url) {
  return (
    url.includes('vmyhlfeouzslixtkmddy.supabase.co') ||
    url.includes('pub-') // R2 CDN
  )
}

function isAppShell(url) {
  const u = new URL(url)
  return SHELL_URLS.some(p => u.pathname === p || u.pathname.startsWith(p))
}

function isAdminRoute(url) {
  const u = new URL(url)
  return u.pathname === '/admin' || u.pathname.startsWith('/admin/')
}

function isAdminChunk(url) {
  const u = new URL(url)
  return u.pathname.startsWith('/_next/static/chunks/app/admin/')
}

function isNextScriptChunk(url) {
  const u = new URL(url)
  return u.pathname.startsWith('/_next/static/chunks/') && u.pathname.endsWith('.js')
}

// ── Install: cache app shell pages ───────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => {
        // Cache offline page first (must succeed), then try shell pages
        return cache.add('/offline.html').then(() =>
          Promise.allSettled(SHELL_URLS.slice(1).map(url =>
            fetch(url, { cache: 'reload' })
              .then(res => { if (res.ok) cache.put(url, res) })
              .catch(() => {}) // Don't fail install if a page can't be cached
          ))
        )
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== SHELL_CACHE && k !== AUDIO_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

// ── Fetch: smart strategy per request type ───────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url

  // Skip non-GET requests
  if (e.request.method !== 'GET') return

  // Admin routes must always use the live network shell.
  // Never cache, serve cached, or fallback admin navigations to app-shell pages.
  if (e.request.mode === 'navigate' && isAdminRoute(url)) return

  // Skip Supabase API calls and Next.js internals — always network
  if (
    url.includes('/rest/v1/') ||
    url.includes('/auth/v1/') ||
    url.includes('/_next/webpack') ||
    url.includes('/api/') ||
    url.includes('hot-update')
  ) return

  // Audio files: cache-first, then network+cache
  if (isAudioRequest(url) && isAudioDomain(url)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        try {
          const response = await fetch(e.request)
          if (response.ok) cache.put(e.request, response.clone())
          return response
        } catch {
          return new Response('', { status: 503, statusText: 'Audio unavailable offline' })
        }
      })
    )
    return
  }

  // Next script chunks must stay live. Stale webpack/runtime chunks can hydrate
  // fresh pages with old module factories and crash the local/admin preview.
  if (isAdminChunk(url) || isNextScriptChunk(url)) return

  // Next.js static assets (_next/static): cache-first
  if (url.includes('/_next/static/')) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        try {
          const response = await fetch(e.request)
          if (response.ok) cache.put(e.request, response.clone())
          return response
        } catch {
          return new Response('', { status: 503 })
        }
      })
    )
    return
  }

  // App shell pages: network-first with cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Update cache with fresh version
          if (response.ok) {
            const clone = response.clone()
            caches.open(SHELL_CACHE).then(cache => cache.put(e.request, clone))
          }
          return response
        })
        .catch(async () => {
          // Offline: serve from cache
          const cached = await caches.match(e.request)
          if (cached) return cached
          // Fallback to cached home page for any app route
          const home = await caches.match('/home')
          if (home) return home
          // Last resort: offline page
          return caches.match('/offline.html')
            .then(r => r || new Response('Offline', { status: 503 }))
        })
    )
    return
  }
})

// ── Message handler: app-triggered audio caching ─────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO') {
    const urls = e.data.urls || []
    caches.open(AUDIO_CACHE).then(cache => {
      urls.forEach(url => {
        cache.match(url).then(cached => {
          if (!cached) {
            fetch(url)
              .then(r => { if (r.ok) cache.put(url, r) })
              .catch(() => {})
          }
        })
      })
    })
  }

  if (e.data && e.data.type === 'CLEAR_AUDIO_CACHE') {
    caches.delete(AUDIO_CACHE).then(() => {
      if (e.source) e.source.postMessage({ type: 'AUDIO_CACHE_CLEARED' })
    })
  }

  // Cache specific shell pages on demand
  if (e.data && e.data.type === 'CACHE_SHELL') {
    const urls = (e.data.urls || []).filter(url => !isAdminRoute(url))
    caches.open(SHELL_CACHE).then(cache => {
      urls.forEach(url => {
        fetch(url, { cache: 'reload' })
          .then(r => { if (r.ok) cache.put(url, r) })
          .catch(() => {})
      })
    })
  }
})
