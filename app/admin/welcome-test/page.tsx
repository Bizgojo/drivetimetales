'use client'
import { useState, useRef } from 'react'

export default function WelcomeTest() {
  const [name, setName] = useState('Marc')
  const [status, setStatus] = useState('')
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  async function handlePlay() {
    if (playing || !name) return
    setPlaying(true)
    setStatus('Generating...')
    try {
      const welcomeText = `Hey ${name}! I'm Belle. I'll be here before every story. Just a friend who knows what's worth your time. You're going to love this one.`
      const res = await fetch('/api/admin/generate-belle-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', firstName: name, introText: welcomeText })
      })
      const data = await res.json()
      if (!data.url) { setStatus('Failed: ' + (data.error||'unknown')); setPlaying(false); return }
      setStatus(data.cached ? '▶ Playing cached...' : '▶ Playing fresh generation...')
      const audio = audioRef.current!
      audio.src = data.url + '?t=' + Date.now()
      audio.load()
      await audio.play()
    } catch(e) {
      setStatus('Error: ' + e)
      setPlaying(false)
    }
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#FAF9F6', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 48, width: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>Belle Welcome Test</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>New voice — name baked in, no stitching.</p>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#444', display: 'block', marginBottom: 8 }}>Listener First Name</label>
          <input value={name} onChange={e => { setName(e.target.value); setStatus('') }}
            style={{ width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', color: '#111', boxSizing: 'border-box' }}
            placeholder="Enter any first name..." />
        </div>
        <button onClick={handlePlay} disabled={playing || !name}
          style={{ width: '100%', background: playing ? '#ccc' : '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '16px', fontSize: 17, fontWeight: 700, cursor: playing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          {playing ? '⏳ Loading...' : '▶ Play Welcome'}
        </button>
        {status && <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#0369a1', marginBottom: 16 }}>{status}</div>}
        <audio ref={audioRef} onEnded={() => { setPlaying(false); setStatus('✅ Done') }} onError={() => { setStatus('Audio error'); setPlaying(false) }} />
        <div style={{ padding: 16, background: '#f8f8f8', borderRadius: 8, fontSize: 12, color: '#666', lineHeight: 1.6 }}>
          <strong>Script:</strong> "Hey <strong style={{ color: '#f97316' }}>{name}</strong>! I'm Belle. I'll be here before every story. Just a friend who knows what's worth your time. You're going to love this one."
        </div>
      </div>
    </div>
  )
}
