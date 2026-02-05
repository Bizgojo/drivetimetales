'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface StickyHeaderProps {
  showBack?: boolean
}

export default function StickyHeader({ showBack = true }: StickyHeaderProps) {
  const router = useRouter()
  const { user } = useAuth()
  
  const userInitial = user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'
  const logoHref = user ? '/home' : '/welcome'

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: '#020617',
      borderBottom: '1px solid #1e293b',
      padding: '0.75rem 1rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: '64rem',
        margin: '0 auto',
      }}>
        {showBack ? (
          <button
            onClick={() => router.back()}
            style={{
              width: '2.75rem',
              height: '2.75rem',
              borderRadius: '50%',
              backgroundColor: '#334155',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Go back"
          >
            <svg width="24" height="24" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div style={{ width: '2.75rem', height: '2.75rem', flexShrink: 0 }} />
        )}

        <Link href={logoHref} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '1.25rem' }}>🚗</span>
            <span style={{ fontSize: '1.5rem' }}>🚛</span>
          </div>
          <span style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            transform: 'skewX(-8deg)',
          }}>
            <span style={{ color: 'white' }}>Drive Time </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
        </Link>

        {user ? (
          <Link
            href="/account"
            style={{
              width: '2.75rem',
              height: '2.75rem',
              borderRadius: '50%',
              backgroundColor: '#f97316',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'black',
              fontWeight: 700,
              fontSize: '1.125rem',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            {userInitial}
          </Link>
        ) : (
          <div style={{ width: '2.75rem', height: '2.75rem', flexShrink: 0 }} />
        )}
      </div>
    </header>
  )
}
