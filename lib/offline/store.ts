// lib/offline/store.ts — OFFLINE-DL-001 IndexedDB storage for downloads.
//
// SCHEMA CONTRACT — public/offline-player.html reads this database with
// plain JS. Change both together (and bump DB_VERSION with a migration).
//   DB 'et-offline' v1
//   'episodes'  keyPath 'storyId' → OfflineEpisode
//   'blobs'     out-of-line key  → Blob   (keys: `${storyId}:seg:${i}`, `${storyId}:cover`)
//   'meta'      out-of-line key  → 'license' → OfflineLicense

import type { OfflineLicense } from './license'

export const OFFLINE_DB_NAME = 'et-offline'
export const OFFLINE_DB_VERSION = 1

export interface OfflineSegment {
  key: string
  type: 'intro' | 'story' | 'outro'
  label: string
  bytes: number
  mime: string
}

export interface OfflineEpisode {
  storyId: string
  userId: string
  title: string
  seriesId: string | null
  seriesName: string | null
  author: string | null
  episodeNumber: number | null
  durationMins: number | null
  isFree: boolean
  coverKey: string | null
  segments: OfflineSegment[]
  totalBytes: number
  downloadedAt: string
}

export const segmentKey = (storyId: string, i: number) => `${storyId}:seg:${i}`
export const coverKey = (storyId: string) => `${storyId}:cover`

let dbPromise: Promise<IDBDatabase> | null = null

export function offlineSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('episodes')) db.createObjectStore('episodes', { keyPath: 'storyId' })
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'))
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function listEpisodes(): Promise<OfflineEpisode[]> {
  const db = await openDb()
  const all = await request(db.transaction('episodes').objectStore('episodes').getAll()) as OfflineEpisode[]
  return all.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
}

export async function getEpisode(storyId: string): Promise<OfflineEpisode | null> {
  const db = await openDb()
  return ((await request(db.transaction('episodes').objectStore('episodes').get(storyId))) as OfflineEpisode) || null
}

export async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDb()
  return ((await request(db.transaction('blobs').objectStore('blobs').get(key))) as Blob) || null
}

/** Blobs first, episode record last — an episode record only exists once every blob is stored. */
export async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('blobs', 'readwrite')
  tx.objectStore('blobs').put(blob, key)
  await done(tx)
}

export async function putEpisode(episode: OfflineEpisode): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('episodes', 'readwrite')
  tx.objectStore('episodes').put(episode)
  await done(tx)
}

/** Deletes the episode record and every blob for it (including orphans from an aborted download). */
export async function deleteEpisode(storyId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['episodes', 'blobs'], 'readwrite')
  tx.objectStore('episodes').delete(storyId)
  tx.objectStore('blobs').delete(IDBKeyRange.bound(`${storyId}:`, `${storyId}:￿`))
  await done(tx)
}

export async function getLicense(): Promise<OfflineLicense | null> {
  const db = await openDb()
  return ((await request(db.transaction('meta').objectStore('meta').get('license'))) as OfflineLicense) || null
}

export async function putLicense(license: OfflineLicense): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put(license, 'license')
  await done(tx)
}

export async function usage(): Promise<{ count: number; bytes: number }> {
  const eps = await listEpisodes()
  return { count: eps.length, bytes: eps.reduce((s, e) => s + (e.totalBytes || 0), 0) }
}
