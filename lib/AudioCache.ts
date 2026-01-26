const CACHE_NAME = 'dtt-audio-cache-v1'

export function isCacheSupported(): boolean {
  return 'caches' in window
}

export async function isAudioCached(audioUrl: string): Promise<boolean> {
  if (!isCacheSupported()) return false
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(audioUrl)
    return !!response
  } catch (err) {
    console.error('Error checking cache:', err)
    return false
  }
}

export async function getCachedAudioUrl(audioUrl: string): Promise<string> {
  if (!isCacheSupported()) return audioUrl
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(audioUrl)
    if (response) {
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }
    return audioUrl
  } catch (err) {
    console.error('Error getting cached audio:', err)
    return audioUrl
  }
}

export async function cacheAudio(audioUrl: string, onProgress?: (progress: number) => void): Promise<boolean> {
  if (!isCacheSupported()) return false
  try {
    const response = await fetch(audioUrl)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0
    if (!response.body) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(audioUrl, response.clone())
      onProgress?.(100)
      return true
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      if (total > 0 && onProgress) onProgress(Math.round((loaded / total) * 100))
    }
    const blob = new Blob(chunks, { type: 'audio/mpeg' })
    const cacheResponse = new Response(blob, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': blob.size.toString() } })
    const cache = await caches.open(CACHE_NAME)
    await cache.put(audioUrl, cacheResponse)
    onProgress?.(100)
    return true
  } catch (err) {
    console.error('Error caching audio:', err)
    return false
  }
}

export async function clearAudioCache(): Promise<boolean> {
  if (!isCacheSupported()) return false
  try { return await caches.delete(CACHE_NAME) } catch (err) { return false }
}
