'use client'

// QUEUE-OFFLINE-001 (Marc, 2026-10-04): queueing a story/series now auto-saves
// it for offline playback; un-queueing removes the offline copy. Shared by
// every "+ Queue" entry point (Library, Recommended For You) so they all
// behave the same way. Best-effort: a failed/capped download never blocks or
// reverses the queue action itself — the story stays queued and simply plays
// online if it couldn't be saved offline (storage/episode caps, not signed
// in, not entitled, etc.).

import { downloadEpisode, DownloadError } from './download'
import { deleteEpisode, offlineSupported } from './store'

export type QueueDownloadTarget =
  | { type: 'single'; id: string }
  | { type: 'series'; episodeIds: string[] }

function idsFor(target: QueueDownloadTarget): string[] {
  return target.type === 'single' ? [target.id] : target.episodeIds
}

/** Downloads every episode in the target, one at a time, stopping quietly at the first failure (storage/episode cap reached, not entitled, offline unsupported, etc). */
export async function downloadQueuedItemOffline(
  target: QueueDownloadTarget,
  opts: { accessToken: string; firstName?: string | null }
): Promise<void> {
  if (!offlineSupported()) return
  for (const storyId of idsFor(target)) {
    try {
      await downloadEpisode({ storyId, accessToken: opts.accessToken, firstName: opts.firstName })
    } catch (err) {
      if (err instanceof DownloadError) {
        console.warn('[Queue] offline save stopped:', err.code, err.message)
      } else {
        console.warn('[Queue] offline save failed:', err)
      }
      break
    }
  }
}

/** Deletes any offline copies for the target (un-queue). Safe to call even if nothing was ever downloaded. */
export async function removeQueuedItemOffline(target: QueueDownloadTarget): Promise<void> {
  if (!offlineSupported()) return
  await Promise.all(idsFor(target).map((storyId) => deleteEpisode(storyId).catch(() => {})))
}
