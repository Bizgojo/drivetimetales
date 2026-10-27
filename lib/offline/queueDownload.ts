'use client'

import { downloadEpisode, DownloadError } from './download'
import { deleteEpisode, getEpisode, offlineSupported } from './store'
import { rememberDownloads, forgetDownloads } from './pending'

export type QueueDownloadTarget =
  | { type: 'single'; id: string }
  | { type: 'series'; episodeIds: string[] }
export type QueueDownloadStatus = { state: 'waiting' | 'downloading' | 'error'; percent?: number; message?: string }
export const downloadStatuses = new Map<string, QueueDownloadStatus>()
const tasks = new Map<string, AbortController>()
let tail: Promise<void> = Promise.resolve()

function notify() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('et_downloads_changed')) }
function status(id: string, value: QueueDownloadStatus) { downloadStatuses.set(id, value); notify() }
function idsFor(target: QueueDownloadTarget): string[] {
  return target.type === 'single' ? [target.id] : target.episodeIds
}

/** Serialize saves across stories so simultaneous clicks respect storage limits. */
export async function downloadQueuedItemOffline(target: QueueDownloadTarget, opts: { accessToken: string; firstName?: string | null; userId?: string; remember?: boolean }, allowed: () => boolean = () => true): Promise<void> {
  if (!offlineSupported()) return
  if (opts.userId && opts.remember !== false) rememberDownloads(opts.userId, idsFor(target))
  const pending = idsFor(target).filter(Boolean).filter(id => !tasks.has(id)).map(id => {
    const controller = new AbortController()
    tasks.set(id, controller)
    status(id, { state: 'waiting' })
    return { id, controller }
  })
  const run = tail.then(async () => {
    for (const { id, controller } of pending) {
      if (controller.signal.aborted) continue
      const guard = setInterval(() => { if (!allowed()) controller.abort() }, 500)
      try {
        if (!allowed()) { downloadStatuses.delete(id); continue }
        if (!(await getEpisode(id))) {
          status(id, { state: 'downloading' })
          await downloadEpisode({ storyId: id, ...opts, signal: controller.signal, onProgress: p => {
            status(id, { state: 'downloading', percent: Math.min(99, Math.round(((p.segment + (p.totalBytes ? p.receivedBytes / p.totalBytes : 0)) / p.segments) * 100)) })
          } })
        }
        // A removal during the final database write must not resurrect the download.
        if (controller.signal.aborted) await deleteEpisode(id)
        if (!controller.signal.aborted && opts.userId) forgetDownloads(opts.userId, [id])
        downloadStatuses.delete(id)
      } catch (err) {
        if (!controller.signal.aborted) status(id, { state: 'error', message: err instanceof DownloadError ? err.message : 'Download interrupted. Connect to the internet and try again.' })
      } finally {
        clearInterval(guard)
        if (controller.signal.aborted) downloadStatuses.delete(id)
        if (tasks.get(id) === controller) tasks.delete(id)
        notify()
      }
    }
  })
  tail = run.catch(() => {})
  await run
}

export async function removeQueuedItemOffline(target: QueueDownloadTarget, userId?: string): Promise<void> {
  if (!offlineSupported()) return
  if (userId) forgetDownloads(userId, idsFor(target))
  for (const id of idsFor(target)) {
    tasks.get(id)?.abort()
    tasks.delete(id)
    downloadStatuses.delete(id)
    await deleteEpisode(id)
  }
  notify()
}
