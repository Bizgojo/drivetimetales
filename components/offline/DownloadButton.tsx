'use client'

// OFFLINE-DL-001: per-episode Download control on the player.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { downloadEpisode, DownloadError, type DownloadProgress } from '@/lib/offline/download'
import { deleteEpisode, getEpisode, offlineSupported } from '@/lib/offline/store'
import IosHomeScreenNotice from './IosHomeScreenNotice'

const mb = (b: number) => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)

export default function DownloadButton({ storyId }: { storyId: string }) {
  const { user, session } = useAuth()
  const [status, setStatus] = useState<'checking' | 'none' | 'downloading' | 'done' | 'error'>('checking')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!offlineSupported()) { setSupported(false); return }
    let cancelled = false
    setStatus('checking')
    getEpisode(storyId)
      .then(ep => { if (!cancelled) setStatus(ep ? 'done' : 'none') })
      .catch(() => { if (!cancelled) setStatus('none') })
    return () => { cancelled = true; abortRef.current?.abort() }
  }, [storyId])

  if (!supported || !user || !session?.access_token || status === 'checking') return null

  const start = async () => {
    setError('')
    setProgress(null)
    setStatus('downloading')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await downloadEpisode({
        storyId,
        accessToken: session.access_token,
        firstName: (user as any)?.first_name || null,
        onProgress: setProgress,
        signal: controller.signal,
      })
      setStatus('done')
    } catch (err) {
      if ((err as any)?.name === 'AbortError') { setStatus('none'); return }
      setError(err instanceof DownloadError ? err.message : 'The download didn’t finish. Try again.')
      setStatus('error')
    }
  }

  const remove = async () => {
    await deleteEpisode(storyId).catch(() => {})
    setStatus('none')
  }

  const pct = progress?.totalBytes ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100)) : null
  const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '999px', border: '1px solid rgba(249,115,22,0.45)', background: 'rgba(249,115,22,0.12)', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }

  return (
    <div data-testid="offline-download" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: '10px 16px 0' }}>
      {status === 'none' && <IosHomeScreenNotice variant="before" />}
      {(status === 'none' || status === 'error') && (
        <button type="button" onClick={start} style={pill} aria-label="Download this episode to play offline">⬇ Download for offline</button>
      )}
      {status === 'downloading' && (
        <div style={{ width: '100%', maxWidth: '320px', textAlign: 'center' }} aria-live="polite">
          <div style={{ color: '#e2e8f0', fontSize: '13px', marginBottom: '6px' }}>
            Downloading… {progress ? `${mb(progress.receivedBytes)}${progress.totalBytes ? ` / ${mb(progress.totalBytes)}` : ''} MB` : ''}
            {progress && progress.segments > 1 ? ` · part ${progress.segment + 1} of ${progress.segments}` : ''}
          </div>
          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct ?? 5}%`, background: '#f97316', transition: 'width 0.2s' }} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '6px' }}>Keep this screen open until it finishes.</div>
          <button type="button" onClick={() => abortRef.current?.abort()} style={{ ...pill, marginTop: '6px', padding: '6px 12px', fontSize: '12px', background: 'transparent' }}>Cancel</button>
        </div>
      )}
      {status === 'done' && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ color: '#86efac', fontWeight: 700, fontSize: '14px' }}>✓ Downloaded — plays with no signal</span>
          <Link href="/downloads" style={{ color: '#f97316', fontSize: '13px', fontWeight: 700 }}>Downloads</Link>
          <button type="button" onClick={remove} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}>Remove</button>
        </div>
      )}
      {status === 'done' && <IosHomeScreenNotice variant="after" />}
      {status === 'error' && error && <div role="alert" style={{ color: '#fca5a5', fontSize: '13px', textAlign: 'center' }}>{error}</div>}
    </div>
  )
}
