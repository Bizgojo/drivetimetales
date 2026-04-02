'use client'
import { useState, useEffect } from 'react'

export default function HomeHintToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (window.location.pathname !== '/home') return
      if (localStorage.getItem('et_home_hint_seen')) return
    } catch {}
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    try { localStorage.setItem('et_home_hint_seen', '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'white',
      color: '#111',
      padding: '16px 20px',
      borderRadius: '16px',
      fontSize: '13px',
      fontWeight: 600,
      zIndex: 99999,
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      border: '1px solid rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      width: '260px',
      textAlign: 'center',
    }}>
      <span>Tap <strong>Endless Tales</strong> in the header anytime to return home</span>
      <button onClick={dismiss} style={{
        background: '#f97316', color: 'white', border: 'none',
        borderRadius: '20px', padding: '8px 0',
        fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: '100%',
      }}>Got It</button>
    </div>
  )
}
