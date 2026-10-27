'use client'

import { ACTIVE_PLAYLIST_KEY } from '@/lib/playlistState'
import { downloadQueuedItemOffline } from './queueDownload'
import { listEpisodes, usage } from './store'
import { OFFLINE_MAX_BYTES, OFFLINE_MAX_EPISODES } from './license'

export type ConnectionInfo = { type?: string; saveData?: boolean; addEventListener?: (name: string, listener: () => void) => void; removeEventListener?: (name: string, listener: () => void) => void }
export function wifiRefillAllowed(online: boolean, connection?: ConnectionInfo | null): boolean {
  return online && !connection?.saveData && connection?.type === 'wifi'
}
export function connectionInfo(): ConnectionInfo | undefined {
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection
}
export function queuedEpisodeIds(value: unknown): string[] {
  const playlist = value as { items?: any[]; stories?: any[] } | null
  const items = playlist?.items || playlist?.stories || []
  if (!Array.isArray(items)) return []
  return Array.from(new Set(items.flatMap(item => item?.type === 'series' ? (item.episodes || []).map((ep: any) => ep.id) : [item?.id]).filter((id: unknown): id is string => typeof id === 'string' && !!id)))
}

/** Re-read the playlist before each episode: removed or finished items never refill. */
export async function refillPlaylist(opts: { accessToken: string; userId: string; allowed: () => boolean }): Promise<void> {
  const attempted = new Set<string>()
  while (opts.allowed()) {
    let ids: string[]
    try { ids = queuedEpisodeIds(JSON.parse(localStorage.getItem(ACTIVE_PLAYLIST_KEY) || 'null')) } catch { return }
    const [saved, space] = await Promise.all([listEpisodes(), usage()])
    if (space.count >= OFFLINE_MAX_EPISODES || space.bytes >= OFFLINE_MAX_BYTES) return
    const id = ids.find(id => !attempted.has(id) && !saved.some(ep => ep.storyId === id && ep.userId === opts.userId))
    if (!id || !opts.allowed()) return
    attempted.add(id)
    await downloadQueuedItemOffline({ type: 'single', id }, { accessToken: opts.accessToken, userId: opts.userId, remember: false }, opts.allowed)
  }
}

/** Finish the series the listener already requested, even after changing pages. */
export async function resumeRequestedDownloads(opts: { accessToken: string; userId: string; allowed: () => boolean }): Promise<void> {
  const { pendingDownloads } = await import('./pending')
  const ids = pendingDownloads(opts.userId)
  for (const id of ids) {
    if (!opts.allowed()) return
    if (!pendingDownloads(opts.userId).includes(id)) continue
    await downloadQueuedItemOffline({ type: 'single', id }, { accessToken: opts.accessToken, userId: opts.userId, remember: false }, opts.allowed)
  }
}
