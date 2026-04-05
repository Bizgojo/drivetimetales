// Endless Tales Service Worker v2
// Caches audio MP3s as they stream so stories work offline

const CACHE_VERSION = 'et-v2'
const AUDIO_CACHE = 'et-audio-v1'
const PRECACHE = ['/offline.html']

// Audio domains to cache
const AUDIO_DOMAINS = [
  'vmyhlfeouzslixtkmddy.supabase.co',
  'pub-',  // R2 public URLs
]

function isAudioRequest(url) {
  return (
    url.endsWith('.mp3') ||
    url.endsWith('.m4a') ||
    url.endsWith('.wav') ||
    url.includes('/audio/') ||
    url.includes('/storage/v1/object/public/audio')
  )
}

function isFromAudioDomain(url) {
  return AUDIO_DOMAINS.some(domain => url.includes(domain))
}

// Install — precache offline page
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== CACHE_VERSION && k !== AUDIO_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

// Fetch — smart caching strategy
self.addEventListener('fetch', e => {
  const url = e.request.url

  // Navigation — network first, fallback to offline page
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/offline.html').then(r => r || new Response('Offline'))
      )
    )
    return
  }

  // Audio files — cache as they stream (cache first if available, network + cache if not)
  if (isAudioRequest(url) && isFromAudioDomain(url)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        // Check cache first
        const cached = await cache.match(e.request)
        if (cached) {
          return cached
        }

        // Not in cache — fetch from network and cache it
        try {
          const response = await fetch(e.request)
          // Only cache successful responses
          if (response.ok && response.status === 200) {
            // Clone before consuming — response can only be read once
            cache.put(e.request, response.clone())
          }
          return response
        } catch (err) {
          // Network failed — return empty response so player knows
          return new Response('', { status: 503, statusText: 'Offline' })
        }
      })
    )
    return
  }

  // Everything else — network only (don't cache API calls, images, etc.)
})

// Message handler — allows app to trigger caching of specific URLs
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO') {
    const urls = e.data.urls || []
    caches.open(AUDIO_CACHE).then(cache => {
      urls.forEach(url => {
        // Check if already cached before fetching
        cache.match(url).then(cached => {
          if (!cached) {
            fetch(url)
              .then(response => {
                if (response.ok) cache.put(url, response)
              })
              .catch(() => {}) // Silently fail if offline
          }
        })
      })
    })
  }

  if (e.data && e.data.type === 'CLEAR_AUDIO_CACHE') {
    caches.delete(AUDIO_CACHE).then(() => {
      e.source.postMessage({ type: 'AUDIO_CACHE_CLEARED' })
    })
  }
})
