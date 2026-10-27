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
        if (ids.length && ready === ids.length) { setLabel('✓ Ready offline'); setRetry(false) }
        else if (working || waiting) { setLabel(`Downloading${working?.percent === undefined ? '…' : ` ${working.percent}%`} · ${ready} of ${ids.length} episodes ready`); setRetry(false) }
        else { setLabel(`${ready} of ${ids.length} episodes ready offline. ${error?.message || 'Connect to Wi-Fi and download the remaining episodes.'}`); setRetry(true) }
      } catch { if (active) { setLabel('Downloads unavailable in this browser.'); setRetry(false) } }
    }
    update()
    window.addEventListener('et_downloads_changed', update)
    window.addEventListener('focus', update)
    return () => { active = false; window.removeEventListener('et_downloads_changed', update); window.removeEventListener('focus', update) }
  }, [signature, user?.id])
  return <div className="mt-2 text-sm text-white">
    <p role="status">{label}</p>
    {retry && session?.access_token && <button type="button" className="mt-1 min-h-11 rounded-lg border border-white px-3 font-semibold" onClick={() => downloadQueuedItemOffline(target, { accessToken: session.access_token })}>Download remaining episodes</button>}
  </div>
}
