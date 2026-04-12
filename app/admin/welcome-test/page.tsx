'use client'
import { useState, useRef } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BELLE_B_ID = 'KWDD3Wyq30ZF5NEL01EJ'

export default function WelcomeTest() {
  const [name, setName] = useState('Marc')
  const [status, setStatus] = useState('')
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const queueRef = useRef<string[]>([])
  const indexRef = useRef(0)

  const BASE = `${SUPABASE_URL}/storage/v1/object/public/audio`

  function playNext() {
    const audio = audioRef.current
    if (!audio) return
    const idx = indexRef.current
    if (idx >= queueRef.current.length) {
      setPlaying(false)
      setStatus('✅ Done — click Play again to replay')
      return
    }
    const url = queueRef.current[idx]
    setStatus(`Playing part ${idx + 1} of ${queueRef.current.length}...`)
    audio.src = url
    audio.load()
    audio.play().catch(e => { setStatus('Play error: ' + e.message); setPlaying(false) })
    indexRef.current = idx + 1
  }

  async function handlePlay() {
    if (playing || !name) return
    setPlaying(true)
    setStatus('Loading...')

    const welcomeA = `${BASE}/welcome/welcome_A.mp3`
    const welcomeB = `${BASE}/welcome/welcome_B.mp3`
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const nameClip = `${BASE}/names/${safeName}_${BELLE_B_ID}.mp3`

    // Check if name clip exists
    const test = await fetch(nameClip, { method: 'HEAD' }).catch(() => ({ ok: false }))
    if (!test.ok) {
      setStatus(`Generating name clip for "${name}"...`)
      try {
        const res = await fetch('/api/asc3/story-playlist', { method: 'GET' })
        // Fall back — generate via name-audio API
        const genRes = await fetch(`/api/name-audio?name=${encodeURIComponent(name)}`)
        if (!genRes.ok) { setStatus('Failed to generate name clip'); setPlaying(false); return }
      } catch(e) { setStatus('Error: ' + e); setPlaying(false); return }
    }

    queueRef.current = [welcomeA, nameClip, welcomeB]
    indexRef.current = 0
    playNext()
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#FAF9F6', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 48, width: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>Belle B Welcome Test</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>Test the first-time listener welcome. Enter any name to test the stitch.</p>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#444', display: 'block', marginBottom: 8 }}>Listener First Name</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setStatus('') }}
            style={{ width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', color: '#111', boxSizing: 'border-box' }}
            placeholder="Enter first name..."
          />
        </div>

        <button
          onClick={handlePlay}
          disabled={playing || !name}
          style={{ width: '100%', background: playing ? '#ccc' : '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '16px', fontSize: 17, fontWeight: 700, cursor: playing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 16 }}
        >
          {playing ? '▶ Playing...' : '▶ Play Welcome'}
        </button>

        {status && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#0369a1' }}>
            {status}
          </div>
        )}

        <audio ref={audioRef} onEnded={playNext} onError={() => { setStatus('Audio error'); setPlaying(false) }} />

        <div style={{ marginTop: 24, padding: 16, background: '#f8f8f8', borderRadius: 8, fontSize: 12, color: '#666', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#444' }}>Script:</div>
          <div>"Oh good, you found us — <strong style={{ color: '#f97316' }}>{name || '[name]'}</strong>"</div>
          <div style={{ marginTop: 4 }}>"I'm Belle. I'll be here before every story — just a friend who knows what's worth your time. You're going to love this one."</div>
        </div>
      </div>
    </div>
  )
}
