'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function SubscribePage() {
  const router = useRouter()
  const { user } = useAuth()
  const firstName = (user as any)?.first_name || ''

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#020617',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <img src="/images/et-logo.png" alt="Endless Tales" style={{ height: '80px', objectFit: 'contain' }} />
        <div style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '8px', letterSpacing: '-0.5px' }}>Endless <span style={{ color: '#f97316' }}>Tales</span></div>
      </div>

      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(249,115,22,0.25)',
        borderRadius: '20px',
        padding: '36px 28px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '44px', marginBottom: '16px' }}>🎧</div>

        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.2 }}>
          {firstName ? `${firstName}, unlock` : 'Unlock'} full access
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '15px', lineHeight: 1.7, margin: '0 0 28px' }}>
          Original audio dramas made for people on the move. Subscribe to get full access to every story.
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
            ✓ Listen or read — even offline
          </div>
        </div>

        <button
          onClick={() => router.push('/signup')}
          style={{
            width: '100%', padding: '16px', background: '#f97316', color: 'white',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800,
            cursor: 'pointer', marginBottom: '12px',
          }}
        >
          Subscribe Now →
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
  )
}
