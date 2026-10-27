'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
export default function AccountPhoto() {
  const { user, refreshUser } = useAuth()
  const [source, setSource] = useState('')
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  function choose(file?: File) {
    if (!file) return
    if (file.size > 20_000_000) { setMessage('Choose a photo smaller than 20 MB.'); return }
    setMessage(''); setZoom(1); setX(50); setY(50); setSource(URL.createObjectURL(file))
  }
  const cropSize = Math.min(size.width, size.height) / zoom
  const left = (size.width - cropSize) * x / 100
  const top = (size.height - cropSize) * y / 100
  async function save() {
    setBusy(true); setMessage('')
    try {
      const img = new Image(); img.src = source; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
      canvas.getContext('2d')!.drawImage(img, left, top, cropSize, cropSize, 0, 0, 256, 256)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85))
      if (!blob) throw new Error('Could not prepare your photo.')
      const body = new FormData(); body.append('photo', blob, 'photo.jpg')
      const res = await fetch('/api/user/photo', { method: 'POST', body })
      const data = await res.json(); if (!res.ok) throw new Error(data.error)
      // Refresh the cookie client's user, then merge the refreshed metadata into the account.
      const { supabaseBrowser } = await import('@/lib/supabase-browser')
      await supabaseBrowser.auth.refreshSession()
      await refreshUser(); setSource(''); setMessage('Your photo is saved!')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save your photo.') }
    finally { setBusy(false) }
  }
  const btn = 'px-4 py-3 rounded-xl bg-orange-500 text-black font-bold disabled:opacity-50'
  return <div className="space-y-4">
    <input ref={camera} aria-label="Take a selfie" type="file" accept="image/*" capture="user" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
    <input ref={library} aria-label="Choose a photo" type="file" accept="image/*" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
    <div className="flex flex-wrap gap-3"><button className={btn} onClick={() => camera.current?.click()}>Take a Selfie</button><button className={btn} onClick={() => library.current?.click()}>Choose a Photo</button></div>
    {source ? <div className="space-y-3">
      <p>Position your face inside the circle. Adjust the sliders, then save.</p>
      <div style={{ width: 220, height: 220, borderRadius: '50%', overflow: 'hidden', border: '3px solid white', margin: 'auto', position: 'relative', background: '#020617' }}>
        <img src={source} alt="Circular photo preview" onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => { setSource(''); setMessage('This photo could not be opened. Try a JPEG or PNG.') }} style={{ position: 'absolute', maxWidth: 'none', width: size.width * 220 / cropSize, height: size.height * 220 / cropSize, left: -left * 220 / cropSize, top: -top * 220 / cropSize }} />
      </div>
      <label className="block">Zoom<input className="block w-full" type="range" min="1" max="3" step=".05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label className="block">Move left or right<input className="block w-full" type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} /></label>
      <label className="block">Move up or down<input className="block w-full" type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} /></label>
      <div className="flex gap-3"><button className={btn} disabled={busy || size.width === 1} onClick={save}>{busy ? 'Saving…' : 'Save My Photo'}</button><button disabled={busy} onClick={() => setSource('')}>Cancel</button></div>
    </div> : user?.user_metadata?.et_photo ? <img src={`/api/user/photo?v=${encodeURIComponent(user.user_metadata.et_photo)}`} alt="Your current profile photo" className="w-20 h-20 rounded-full object-cover" /> : null}
    <p role="status">{message}</p>
  </div>
}
