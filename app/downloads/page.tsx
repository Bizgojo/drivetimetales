'use client'

// OFFLINE-DL-001: Downloads screen — everything here is local (IndexedDB), so
// the page is public in middleware.ts; the license is re-verified when a
// session exists (components/offline/OfflineBootstrap). "Play" opens the
// static offline player, which works with or without signal.

import { useCallback, useEffect, useState } from 'react'
import { canPlayOffline, OFFLINE_MAX_BYTES, OFFLINE_MAX_EPISODES, type OfflineLicense } from '@/lib/offline/license'
import { deleteEpisode, getBlob, getLicense, listEpisodes, offlineSupported, type OfflineEpisode } from '@/lib/offline/store'
import { requestPersistentStorage, storageEstimate } from '@/lib/offline/download'
import IosHomeScreenNotice from '@/components/offline/IosHomeScreenNotice'

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function DownloadsPage() {
  const [episodes, setEpisodes] = useState<OfflineEpisode[] | null>(null)
  const [license, setLicense] = useState<OfflineLicense | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [supported, setSupported] = useState(true)

  const load = useCallback(async () => {
    const [eps, lic, est] = await Promise.all([listEpisodes(), getLicense(), storageEstimate()])
    setEpisodes(eps)
    setLicense(lic)
    setEstimate(est)
    const next: Record<string, string> = {}
    for (const ep of eps) {
      if (!ep.coverKey) continue
      const blob = await getBlob(ep.coverKey).catch(() => null)
      if (blob) next[ep.storyId] = URL.createObjectURL(blob)
    }
    setCovers(prev => { Object.values(prev).forEach(u => URL.revokeObjectURL(u)); return next })
  }, [])

  useEffect(() => {
    if (!offlineSupported()) { setSupported(false); return }
    load().catch(() => setEpisodes([]))
    requestPersistentStorage().then(setPersisted)
  }, [load])

  const remove = async (storyId: string) => {
    await deleteEpisode(storyId)
    await load()
  }

  const totalBytes = (episodes || []).reduce((s, e) => s + e.totalBytes, 0)
  const hasPaid = (episodes || []).some(e => !e.isFree)
  const licenseActive = Boolean(license?.validUntil && new Date(license.validUntil) > new Date())

  const card: React.CSSProperties = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '14px' }

  return (
    <div style={{ minHeight: '100dvh', background: '#020617', color: '#fff', padding: '16px' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '4px 0 0' }}>Downloads</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
          Downloaded episodes play with no signal — on back roads, in tunnels, on flights.
          Download them here while you’re on Wi-Fi, one episode at a time from its player.
        </p>

        <IosHomeScreenNotice variant="before" />

        {!supported && <div style={card}>This browser can’t store downloads.</div>}

        {supported && (
          <div style={{ ...card, fontSize: '14px', display: 'grid', gap: '6px' }} data-testid="downloads-summary">
            <div><b>{episodes?.length ?? 0}</b> of {OFFLINE_MAX_EPISODES} episodes · <b>{mb(totalBytes)}</b> of {mb(OFFLINE_MAX_BYTES)}</div>
            {estimate && estimate.quota > 0 && (
              <div style={{ color: '#94a3b8' }}>This device: {mb(estimate.usage)} used by Endless Tales of {mb(estimate.quota)} available{persisted ? ' · protected from automatic cleanup' : ''}</div>
            )}
            {hasPaid && (licenseActive
              ? <div style={{ color: '#86efac' }}>Offline access active until <b>{fmtDate(license!.validUntil!)}</b>. It renews each time you open the app online.</div>
              : <div style={{ color: '#fdba74' }}>Offline access has expired. Open Endless Tales while online with an active subscription to renew it.</div>)}
          </div>
        )}

        {episodes && episodes.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>No downloads yet. Open an episode and tap <b style={{ color: '#fff' }}>⬇ Download for offline</b>.</div>
        )}

        {episodes?.map(ep => {
          const playable = canPlayOffline(ep, license)
          return (
            <div key={ep.storyId} style={{ ...card, display: 'flex', gap: '12px', alignItems: 'center' }} data-testid="download-row">
              {covers[ep.storyId]
                ? <img src={covers[ep.storyId]} alt="" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover', flex: 'none' }} />
                : <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: '#1e293b', flex: 'none' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</div>
                <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                  {[ep.seriesName ? `${ep.seriesName}${ep.episodeNumber ? ` · Ep ${ep.episodeNumber}` : ''}` : ep.author, mb(ep.totalBytes), ep.durationMins ? `${ep.durationMins} min` : null].filter(Boolean).join(' · ')}
                </div>
                {!playable && <div style={{ color: '#fdba74', fontSize: '12px' }}>Offline access expired</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <a href={`/offline-player.html#${encodeURIComponent(ep.storyId)}`}
                   aria-disabled={!playable}
                   onClick={e => { if (!playable) e.preventDefault() }}
                   style={{ background: playable ? '#f97316' : '#334155', color: playable ? '#fff' : '#94a3b8', borderRadius: '10px', padding: '8px 14px', fontWeight: 700, fontSize: '14px', textAlign: 'center', textDecoration: 'none' }}>
                  ▶ Play
                </a>
                <button type="button" onClick={() => remove(ep.storyId)}
                        style={{ background: 'none', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '10px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
