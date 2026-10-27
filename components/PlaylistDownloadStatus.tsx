'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getLicense, listEpisodes } from '@/lib/offline/store'
import { canPlayOffline } from '@/lib/offline/license'
import { downloadStatuses, type QueueDownloadTarget } from '@/lib/offline/queueDownload'
import './playlist-download.css'

export default function PlaylistDownloadStatus({ target, durationMins = 0 }: { target: QueueDownloadTarget; durationMins?: number }) {
  const { user } = useAuth()
  const [label, setLabel] = useState('Preparing download…')
  const [busy, setBusy] = useState(true)
  const [percent, setPercent] = useState(0)
  const ids = target.type === 'single' ? [target.id] : target.episodeIds
  const signature = ids.join(',')
  useEffect(() => {
    let active = true, version = 0
    async function update() {
      const check = ++version
      try {
        const [episodes, license] = await Promise.all([listEpisodes(), getLicense()])
        if (!active || check !== version) return
        const ready = ids.filter(id => episodes.some(ep => ep.storyId === id && ep.userId === user?.id && canPlayOffline(ep, license))).length
        const pending = ids.map(id => downloadStatuses.get(id))
        const working = pending.find(s => s?.state === 'downloading')
        const waiting = pending.find(s => s?.state === 'waiting')
        const error = pending.find(s => s?.state === 'error')
        const fraction = (working?.percent || error?.percent || 0) / 100
        const totalPercent = ids.length ? Math.min(99, Math.floor((ready + fraction) / ids.length * 100)) : 0
        const complete = ids.length > 0 && ready === ids.length
        setPercent(complete ? 100 : totalPercent)
        if (complete) { setLabel('✓ Ready offline'); setBusy(false) }
        else if (working) { setLabel('Downloading automatically…'); setBusy(true) }
        else if (waiting) { setLabel(waiting.message || 'Waiting to download…'); setBusy(true) }
        else if (error) {
          const blocked = ['max_bytes', 'max_episodes', 'storage', 'not_entitled', 'not_authenticated'].includes(error.code || '')
          setLabel(blocked ? error.message || 'Download paused.' : error.code === 'asset_unavailable' ? 'Waiting for story audio. Retrying automatically…' : navigator.onLine ? 'Reconnecting automatically…' : 'Waiting for internet…')
          setBusy(false)
        } else { setLabel(navigator.onLine ? 'Preparing automatic download…' : 'Waiting for internet…'); setBusy(false) }
      } catch { if (active) { setLabel('Downloads unavailable on this device.'); setBusy(false) } }
    }
    update()
    const events = ['et_downloads_changed', 'focus', 'online', 'offline']
    events.forEach(name => window.addEventListener(name, update))
    return () => { active = false; events.forEach(name => window.removeEventListener(name, update)) }
  }, [signature, user?.id])
  const mins = Math.max(0, Math.round(durationMins))
  return <div className="mt-2 text-sm text-white">
    <p className="mb-1 font-semibold">{ids.length} {ids.length === 1 ? 'episode' : 'episodes'} · {Math.floor(mins / 60)}h {mins % 60}m · {percent}% complete</p>
    <div className="et-download-track" role="progressbar" aria-label="Series download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className={`et-download-fill ${busy ? 'et-download-moving' : ''} ${percent === 100 ? 'et-download-done' : ''}`} style={{ width: `${Math.max(busy ? 3 : 0, percent)}%` }} />
    </div>
    <p role="status" className="mt-1 text-xs">{label}</p>
  </div>
}
