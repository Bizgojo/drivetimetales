// lib/offline/download.ts — OFFLINE-DL-001 client-side download + license sync.
//
// One episode at a time. The download freezes exactly what the player would
// play for this user right now: the /api/asc3/story-playlist response
// (personalized queue, or the single final mix) + cover + story details.
// Audio is stored as Blobs in IndexedDB (lib/offline/store.ts) and played
// from blob: URLs by public/offline-player.html — no service-worker range
// emulation involved.

import {
  checkDownloadCaps, OFFLINE_MAX_BYTES, OFFLINE_MAX_EPISODES, type OfflineLicense,
} from './license'
import {
  coverKey, deleteEpisode, getLicense, listEpisodes, putBlob, putEpisode, putLicense, segmentKey, usage,
  type OfflineEpisode, type OfflineSegment,
} from './store'

export class DownloadError extends Error {
  constructor(public code: 'not_entitled' | 'not_available' | 'max_episodes' | 'max_bytes' | 'no_audio' | 'network' | 'storage' | 'not_authenticated', message: string) {
    super(message)
  }
}

// totalBytes = bytes finished so far + the current segment's size (known per
// segment only), so the bar is exact for single-file downloads.
export interface DownloadProgress { receivedBytes: number; totalBytes: number | null; segment: number; segments: number }

type PlaylistItem = { url: string; type: 'intro' | 'story' | 'outro'; label: string }

async function authedJson(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

// Download requests carry DOWNLOAD_MARKER so public/sw.js does NOT copy the
// response into its own audio cache (that would double the storage used by
// every download). A query param, not cache:'no-store' — Chromium doesn't
// reliably expose the page's cache mode on the service worker's FetchEvent
// (verified in the localhost check). Storage ignores unknown query params.
export const DOWNLOAD_MARKER = 'et_offline_dl=1'
export function markDownloadUrl(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + DOWNLOAD_MARKER
}

async function fetchBlob(url: string, onChunk: (received: number, total: number | null) => void, signal?: AbortSignal): Promise<{ blob: Blob; mime: string }> {
  const res = await fetch(markDownloadUrl(url), { cache: 'no-store', signal })
  if (!res.ok) throw new DownloadError('network', `HTTP ${res.status} for ${url.split('?')[0].split('/').pop()}`)
  const mime = res.headers.get('content-type') || 'audio/mpeg'
  const total = Number(res.headers.get('content-length')) || null
  if (!res.body) {
    const blob = await res.blob()
    onChunk(blob.size, total)
    return { blob, mime }
  }
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value as BlobPart)
      received += value.byteLength
      onChunk(received, total) // may throw (cap exceeded) → stop the stream below
    }
  } catch (err) {
    reader.cancel().catch(() => {})
    throw err
  }
  return { blob: new Blob(chunks, { type: mime }), mime }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null
  } catch { return null }
}

export async function downloadEpisode(opts: {
  storyId: string
  accessToken: string
  firstName?: string | null
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}): Promise<OfflineEpisode> {
  const { storyId, accessToken, onProgress, signal } = opts

  const before = await usage()
  if (before.count >= OFFLINE_MAX_EPISODES) {
    throw new DownloadError('max_episodes', `You can keep up to ${OFFLINE_MAX_EPISODES} downloaded episodes. Remove one to make room.`)
  }

  // 1. Server-side gate: is_free OR entitled. Also returns a fresh license.
  const { res: authRes, body: auth } = await authedJson(`/api/offline/license?storyId=${encodeURIComponent(storyId)}`, accessToken)
  if (authRes.status === 401) throw new DownloadError('not_authenticated', 'Sign in to download episodes.')
  if (authRes.status === 404) throw new DownloadError('not_available', 'This episode can’t be downloaded.')
  if (!auth.allowed) throw new DownloadError('not_entitled', 'Downloads are included with an active subscription.')
  const license = auth.license as OfflineLicense
  const story = auth.story as {
    id: string; title: string; author: string | null; seriesId: string | null; seriesName: string | null
    episodeNumber: number | null; durationMins: number | null; coverUrl: string | null; isFree: boolean
  }

  // 2. Freeze what the player would play for this user (personalized queue or final mix).
  const params = new URLSearchParams({ storyId })
  if (opts.firstName) params.set('firstName', opts.firstName)
  const plRes = await fetch(`/api/asc3/story-playlist?${params.toString()}`, { signal })
  if (!plRes.ok) throw new DownloadError('no_audio', 'Audio isn’t available for this episode right now.')
  const pl = await plRes.json()
  const items: PlaylistItem[] = pl.useFinalMix && pl.finalMixUrl
    ? [{ url: pl.finalMixUrl, type: 'story', label: story.title }]
    : (pl.queue || []).filter((q: PlaylistItem) => q?.url)
  if (!items.length) throw new DownloadError('no_audio', 'Audio isn’t available for this episode right now.')

  await requestPersistentStorage()

  // 3. Fetch every segment into IndexedDB, enforcing the byte cap as sizes become known.
  const segments: OfflineSegment[] = []
  let doneBytes = 0
  try {
    for (let i = 0; i < items.length; i++) {
      let capChecked = false
      const { blob, mime } = await fetchBlob(items[i].url, (received, total) => {
        if (!capChecked && total) {
          capChecked = true
          const cap = checkDownloadCaps({ count: before.count, bytes: before.bytes + doneBytes }, total)
          if (!cap.ok) throw new DownloadError('max_bytes', `Downloads are limited to ${Math.round(OFFLINE_MAX_BYTES / 1024 / 1024)} MB. Remove an episode to make room.`)
        }
        onProgress?.({ receivedBytes: doneBytes + received, totalBytes: total ? doneBytes + total : null, segment: i, segments: items.length })
      }, signal)
      const cap = checkDownloadCaps({ count: before.count, bytes: before.bytes + doneBytes }, blob.size)
      if (!cap.ok) throw new DownloadError('max_bytes', `Downloads are limited to ${Math.round(OFFLINE_MAX_BYTES / 1024 / 1024)} MB. Remove an episode to make room.`)
      const key = segmentKey(storyId, i)
      try { await putBlob(key, blob) } catch (e) {
        throw new DownloadError('storage', 'Not enough storage on this device to save the episode.')
      }
      segments.push({ key, type: items[i].type, label: items[i].label, bytes: blob.size, mime })
      doneBytes += blob.size
    }

    // Cover is best-effort — the offline player has a fallback.
    let storedCover: string | null = null
    if (story.coverUrl) {
      try {
        const { blob } = await fetchBlob(story.coverUrl, () => {}, signal)
        await putBlob(coverKey(storyId), blob)
        storedCover = coverKey(storyId)
      } catch { /* fall back to app icon */ }
    }

    const episode: OfflineEpisode = {
      storyId,
      userId: license.userId,
      title: story.title,
      seriesId: story.seriesId,
      seriesName: story.seriesName,
      author: story.author,
      episodeNumber: story.episodeNumber,
      durationMins: story.durationMins,
      isFree: story.isFree,
      coverKey: storedCover,
      segments,
      totalBytes: doneBytes,
      downloadedAt: new Date().toISOString(),
    }
    await putLicense(license)
    await putEpisode(episode) // last: the record only exists once every blob is stored
    return episode
  } catch (err) {
    await deleteEpisode(storyId).catch(() => {})
    if (err instanceof DownloadError) throw err
    if ((err as any)?.name === 'AbortError') throw err
    throw new DownloadError('network', 'The download was interrupted. Check your connection and try again.')
  }
}

/**
 * Re-verify entitlement (call whenever online with a session). Extends the
 * license; if the user is no longer entitled — or a different user signed in
 * on this device — deletes every paid download. Free-story downloads are kept
 * for the same user (they need no subscription).
 */
export async function refreshOfflineLicense(accessToken: string): Promise<{ license: OfflineLicense | null; purged: number }> {
  const episodes = await listEpisodes()
  const previous = await getLicense()
  if (!episodes.length && !previous) return { license: null, purged: 0 }
  const { res, body } = await authedJson('/api/offline/license', accessToken)
  if (!res.ok || !body.license) return { license: previous, purged: 0 } // transient: keep current license
  const license = body.license as OfflineLicense
  let purged = 0
  for (const ep of episodes) {
    const otherUser = ep.userId !== license.userId
    if (otherUser || (!license.entitled && !ep.isFree)) {
      await deleteEpisode(ep.storyId)
      purged++
    }
  }
  await putLicense(license)
  return { license, purged }
}
