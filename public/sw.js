// Endless Tales Service Worker v8
// Full offline support: app shell + audio caching
// v7 (WALK-BUG-0713, 2026-07-13): cache-name bump to force-purge stale shells.
// Devices whose SW predated the isNextScriptChunk exemption were serving old
// webpack chunks into fresh HTML — old module factories hydrating new pages
// (crash on /home post-signup, mixed-era chrome/double headers, missing
// Continue hero). Activating v7 deletes et-shell-v6 and recaches clean.
// v8 (ORION-SW-RANGE-001, Marc walk bug 2026-07-14): audio handler was
// range-blind — cache.match ignores the Range header, so a mid-stream
// `Range: bytes=X-` request was answered with the FULL cached 200 body:
// Chromium's media stack misaligns and playback dies at a deterministic
// offset (reproducible fixed-position stall). Also `response.ok` is true for
// 206 partials, so streaming responses were cache.put() — which the Cache API
// REJECTS (unhandled throw): streaming playback never populated the cache at
// all. v8 synthesizes proper 206 slices from cached full bodies, passes
// uncached ranged requests to the network untouched, and only ever stores
// full status-200 responses.

const SHELL_CACHE  = 'et-shell-v7'
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

  // Audio files: range-aware cache-first (ORION-SW-RANGE-001)
  if (isAudioRequest(url) && isAudioDomain(url)) {
    e.respondWith(serveAudio(e.request))
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

// ── Audio serving: range-aware cache-first (ORION-SW-RANGE-001) ────────────
async function serveAudio(request) {
  const cache = await caches.open(AUDIO_CACHE)
  const rangeHeader = request.headers.get('range')
  // Cache is keyed by URL and only ever holds full status-200 bodies.
  const cached = await cache.match(request.url)

  if (!rangeHeader) {
    if (cached) return cached
    try {
      const response = await fetch(request)
      // ONLY full 200s. 206 partials are both invalid to store (Cache API
      // rejects them) and dangerous to serve whole. Await + swallow so a
      // quota/put failure can never break playback.
      if (response.status === 200) {
        try { await cache.put(request.url, response.clone()) } catch (_) {}
      }
      return response
    } catch {
      return new Response('', { status: 503, statusText: 'Audio unavailable offline' })
    }
  }

  // Ranged request: synthesize a real 206 slice from the cached full body —
  // never hand a full 200 to a Range request (fixed-position stall bug).
  const parsed = /bytes=(\d+)-(\d+)?/.exec(rangeHeader)
  if (cached && parsed) {
    const buf = await cached.arrayBuffer()
    const total = buf.byteLength
    const start = Number(parsed[1])
    const end = parsed[2] ? Math.min(Number(parsed[2]), total - 1) : total - 1
    if (start >= total || start > end) {
      return new Response(null, {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: { 'Content-Range': `bytes */${total}` },
      })
    }
    const slice = buf.slice(start, end + 1)
    return new Response(slice, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(slice.byteLength),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  // No cached full body (or unparseable range): straight network passthrough —
  // the origin handles ranges correctly (curl-verified 206 + Accept-Ranges).
  try {
    return await fetch(request)
  } catch {
    return new Response('', { status: 503, statusText: 'Audio unavailable offline' })
  }
}

// ── Message handler: app-triggered audio caching ─────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO') {
    const urls = e.data.urls || []
    caches.open(AUDIO_CACHE).then(cache => {
      urls.forEach(url => {
        cache.match(url).then(cached => {
          if (!cached) {
            fetch(url)
              // ORION-SW-RANGE-001: full 200s only — never store partials.
              .then(r => { if (r.status === 200) return cache.put(url, r) })
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
