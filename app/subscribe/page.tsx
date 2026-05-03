'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

function safeInternalPath(path: string | null) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return ''
  return path
}

function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#020617',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      Loading...
    </div>
  )
}

function SubscribeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const firstName = (user as any)?.first_name || ''
  const returnTo = safeInternalPath(searchParams.get('returnTo'))
  const signupPath = returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#020617',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 60, width: '100%', background: 'rgba(2,6,23,0.96)', borderBottom: '1px solid rgba(148,163,184,0.16)', backdropFilter: 'blur(12px)', padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <img src="/images/et-logo.png" alt="Endless Tales" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            <span style={{ color: '#ffffff', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
              Endless <span style={{ color: '#f97316' }}>Tales</span>
            </span>
          </button>
          <button onClick={() => router.push('/signin')} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: 0, whiteSpace: 'nowrap' }}>Sign in</button>
        </div>
      </header>

      <div style={{ width: '100%', maxWidth: '400px', padding: '32px 24px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          background: '#0f172a',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: '20px',
          padding: '36px 28px',
          width: '100%',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}>
        <div style={{ fontSize: '44px', marginBottom: '16px' }}>🎧</div>

        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.2 }}>
          {firstName ? `${firstName}, unlock` : 'Unlock'} full access
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '15px', lineHeight: 1.7, margin: '0 0 28px' }}>
          Original audio dramas made for people on the move. Start your 14-day free trial and get full access to every story.
        </p>

        <div style={{
          background: 'rgba(249,115,22,0.1)',
          border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#f97316' }}>$7.99</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>per month · cancel anytime</div>
          <div style={{ marginTop: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.8 }}>
            ✓ Full access to all stories<br />
            ✓ New stories added weekly<br />
            ✓ Listen or read — even offline<br />
            ✓ Credit card required · cancel before trial ends and you won't be charged
          </div>
        </div>

        <button
          onClick={() => router.push(signupPath)}
          style={{
            width: '100%', padding: '16px', background: '#f97316', color: 'white',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800,
            cursor: 'pointer', marginBottom: '12px',
          }}
        >
          Start Free Trial →
        </button>


        <button
          onClick={() => router.push('/account/promo')}
          style={{ width: '100%', padding: '12px', background: 'transparent', color: 'rgba(255,255,255,0.3)', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginTop: '4px' }}
        >
          Have a promo code?
        </button>
        </div>

        <p style={{ marginTop: '24px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
          Already subscribed?{' '}
          <button
            onClick={() => router.push('/signin')}
            style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: '13px', fontWeight: 600, padding: 0 }}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscribeContent />
    </Suspense>
  )
}
