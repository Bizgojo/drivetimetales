'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getLicense, listEpisodes } from '@/lib/offline/store'
import { canPlayOffline } from '@/lib/offline/license'
import { downloadQueuedItemOffline, downloadStatuses, type QueueDownloadTarget } from '@/lib/offline/queueDownload'

export default function PlaylistDownloadStatus({ target }: { target: QueueDownloadTarget }) {
  const { session, user } = useAuth()
  const [label, setLabel] = useState('Checking downloads…')
  const [retry, setRetry] = useState(false)
  const [busy, setBusy] = useState(true)
  const ids = target.type === 'single' ? [target.id] : target.episodeIds
  const signature = ids.join(',')
  useEffect(() => {
    let active = true
    let version = 0
    async function update() {
      const check = ++version
      try {
        const [episodes, license] = await Promise.all([listEpisodes(), getLicense()])
        if (!active || check !== version) return
        const ready = ids.filter(id => episodes.some(ep => ep.storyId === id && ep.userId === user?.id && canPlayOffline(ep, license))).length
        const pending = ids.map(id => downloadStatuses.get(id))
        const working = pending.find(s => s?.state === 'downloading')
        const waiting = pending.some(s => s?.state === 'waiting')
        const error = pending.find(s => s?.state === 'error')
        if (ids.length && ready === ids.length) { setLabel('✓ Ready offline'); setRetry(false); setBusy(false) }
        else if (working || waiting) {
          const progress = working?.percent === undefined ? '' : ` ${working.percent}%`
          setLabel(working ? `Downloading${progress}${ids.length > 1 ? ` · ${ready}/${ids.length} ready` : ''}` : 'Waiting to download…')
          setRetry(false); setBusy(true)
        }
        else {
          setLabel(error ? `Download paused. ${error.message || 'Please try again.'}` : ready ? `${ready} of ${ids.length} episodes saved` : 'Not downloaded')
          setRetry(true); setBusy(false)
        }
      } catch { if (active) { setLabel('Downloads unavailable in this browser.'); setRetry(false); setBusy(false) } }
    }
    update()
    window.addEventListener('et_downloads_changed', update)
    window.addEventListener('focus', update)
    return () => { active = false; window.removeEventListener('et_downloads_changed', update); window.removeEventListener('focus', update) }
  }, [signature, user?.id])
  return <div className="mt-2 text-sm text-white">
    <p role="status" className="flex items-center gap-2" aria-busy={busy}>
      {busy && <span aria-hidden="true" className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      <span>{label}</span>
    </p>
    {retry && session?.access_token && <button type="button" className="mt-1 min-h-11 rounded-lg border border-white px-3 font-semibold" onClick={() => downloadQueuedItemOffline(target, { userId: user?.id, accessToken: session.access_token })}>{downloadStatuses.get(ids[0])?.state === 'error' ? 'Try again' : 'Download'}</button>}
  </div>
}
