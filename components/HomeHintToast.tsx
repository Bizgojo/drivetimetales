'use client'
import { useState, useEffect } from 'react'

export default function HomeHintToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 100, left: '50%',
      transform: 'translateX(-50%)',
      background: 'white', color: '#111',
      padding: '14px 20px', borderRadius: '16px',
      fontSize: '13px', fontWeight: 600,
      zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      border: '1px solid rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '12px', width: '260px', textAlign: 'center',
    }}>
      <span>Tap <strong>Endless Tales</strong> in the header anytime to return home</span>
      <button onClick={dismiss} style={{
        background: '#f97316', color: 'white', border: 'none',
        borderRadius: '20px', padding: '8px 24px',
        fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: '100%',
      }}>Got It</button>
    </div>
  )
}
