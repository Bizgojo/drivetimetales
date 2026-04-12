'use client'
import { useState, useRef } from 'react'

const BASE = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio'

const VERSIONS = [
  { name: 'Version 1 — Turbo, Natural', url: `${BASE}/welcome/test_v1_turbo_natural.mp3` },
  { name: 'Version 2 — Multilingual, Expressive', url: `${BASE}/welcome/test_v2_multilingual_expressive.mp3` },
  { name: 'Version 3 — Multilingual, Natural', url: `${BASE}/welcome/test_v3_multilingual_natural.mp3` },
]

export default function WelcomeTest() {
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  function play(url: string, name: string) {
    const audio = audioRef.current
    if (!audio) return
    audio.src = url + '?t=' + Date.now()
    audio.load()
    audio.play()
    setPlaying(name)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#FAF9F6', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 48, width: 520, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>Belle B Voice Test</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>Three versions — same script, different model/settings. Pick the most natural one.</p>
        <div style={{ background: '#f8f8f8', borderRadius: 8, padding: 16, fontSize: 13, color: '#555', marginBottom: 32, lineHeight: 1.6 }}>
          <strong>Script:</strong> "Oh good you found us Marc. I'm Belle and I'll be right here before every story. Just think of me as a friend who always knows what's worth your time. You are going to love this one."
        </div>

        {VERSIONS.map(v => (
          <div key={v.name} style={{ marginBottom: 16 }}>
            <button
              onClick={() => play(v.url, v.name)}
              style={{
                width: '100%', textAlign: 'left',
                background: playing === v.name ? '#fff7ed' : '#fff',
                border: playing === v.name ? '2px solid #f97316' : '2px solid #e5e7eb',
                borderRadius: 10, padding: '16px 20px',
                fontSize: 15, fontWeight: 600, color: '#111',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12
              }}
            >
              <span style={{ fontSize: 20 }}>{playing === v.name ? '▶' : '○'}</span>
              {v.name}
            </button>
          </div>
        ))}

        <audio
          ref={audioRef}
          onEnded={() => setPlaying(null)}
          onError={() => setPlaying(null)}
        />

        <div style={{ marginTop: 24, padding: 16, background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534' }}>
          Tell Claude which version sounds most natural — 1, 2, or 3.
        </div>
      </div>
    </div>
  )
}
