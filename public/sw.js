// Endless Tales Service Worker
// Minimal SW to enable PWA install prompt on Android

const CACHE = 'et-v1'
const PRECACHE = ['/offline.html']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Network first, fall back to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/offline.html').then(r => r || new Response('Offline'))
      )
    )
  }
})
