'use client'
import { useState, useEffect, Suspense } from 'react'
import { usePathname } from 'next/navigation'

function ToastInner() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/home') return
    try {
      if (localStorage.getItem('et_home_hint_seen')) return
      const t = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(t)
    } catch {}
  }, [pathname])

  function dismiss() {
    try { localStorage.setItem('et_home_hint_seen', '1') } catch {}
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
      gap: '12px', minWidth: '240px', textAlign: 'center',
      animation: 'fadeInUp 0.35s ease',
    }}>
      <span>∞ Tap <strong>Endless Tales</strong> in the header<br />anytime to return home</span>
      <button
        onClick={dismiss}
        style={{
          background: '#f97316', color: 'white', border: 'none',
          borderRadius: '20px', padding: '8px 24px',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          width: '100%',
        }}
      >
        Got It
      </button>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function HomeHintToast() {
  return <Suspense fallback={null}><ToastInner /></Suspense>
}
