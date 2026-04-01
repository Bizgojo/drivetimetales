'use client'
import { useState, useEffect, Suspense } from 'react'
import { usePathname } from 'next/navigation'

function ToastInner() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/home') return
    try {
      const seen = localStorage.getItem('et_home_hint_seen')
      if (seen) return
      const t = setTimeout(() => {
        setVisible(true)
        localStorage.setItem('et_home_hint_seen', '1')
        setTimeout(() => setVisible(false), 4000)
      }, 1200)
      return () => clearTimeout(t)
    } catch {}
  }, [pathname])

  if (!visible) return null

  return (
    <div
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed', bottom: 90, left: '50%',
        transform: 'translateX(-50%)',
        background: 'white', color: '#111',
        padding: '10px 18px', borderRadius: '20px',
        fontSize: '13px', fontWeight: 600,
        whiteSpace: 'nowrap', zIndex: 999,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        animation: 'fadeInDown 0.3s ease', cursor: 'pointer',
      }}
    >
      ∞ Tap the logo anytime to go home
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function HomeHintToast() {
  return <Suspense fallback={null}><ToastInner /></Suspense>
}
