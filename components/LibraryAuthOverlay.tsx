'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LibraryAuthOverlay() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setIsLoggedIn(!!session)
      } catch {
        setIsLoggedIn(false)
      }
    }
    checkAuth()
  }, [])

  // Still checking auth, or user is logged in — show nothing
  if (isLoggedIn === null || isLoggedIn === true) return null

  // Not logged in — show overlay
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'linear-gradient(to top, rgba(10,10,15,0.98) 60%, rgba(10,10,15,0.85) 80%, transparent 100%)',
      padding: '3rem 1.5rem 2rem',
      textAlign: 'center',
      pointerEvents: 'auto',
    }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <p style={{
          fontSize: '1.3rem',
          fontWeight: 700,
          color: '#f0ece4',
          marginBottom: '0.5rem',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Like what you see?
        </p>
        <p style={{
          fontSize: '0.95rem',
          color: 'rgba(240,236,228,0.75)',
          marginBottom: '1.5rem',
          lineHeight: 1.5,
        }}>
          Sign up free and get 2 stories on the house. No credit card required.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/signup')}
            style={{
              padding: '14px 32px',
              background: '#f0a030',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Start Listening Free
          </button>
          <button
            onClick={() => router.push('/signin')}
            style={{
              padding: '14px 24px',
              background: 'transparent',
              color: '#f0a030',
              border: '1px solid rgba(240,160,48,0.3)',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
