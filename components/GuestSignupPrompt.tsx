'use client'
import Link from 'next/link'

interface Props {
  minutesPlayed: number
  storiesPlayed: number
}

export default function GuestSignupPrompt({ minutesPlayed, storiesPlayed }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0f172a', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <img src="/images/og-share.png" alt="Endless Tales" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '20px' }} />
      <h1 style={{ color: 'white', fontSize: '26px', fontWeight: 900, textAlign: 'center', lineHeight: 1.2, marginBottom: '12px' }}>
        You've enjoyed<br /><span style={{ color: '#f97316' }}>{minutesPlayed} minutes free!</span>
      </h1>
      <p style={{ color: 'white', fontSize: '14px', textAlign: 'center', lineHeight: 1.6, marginBottom: '32px', maxWidth: '300px' }}>
        You've listened to {storiesPlayed} {storiesPlayed === 1 ? 'story' : 'stories'}. Sign up now and get <strong style={{ color: '#22c55e' }}>2 weeks completely free</strong> — cancel before then and you won't be charged.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px' }}>
        <Link href="/signup" style={{ width: '100%', background: '#22c55e', color: '#042013', padding: '16px', borderRadius: '14px', fontSize: '17px', fontWeight: 900, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
          🎉 Create Free Account — 2 Weeks Free!
        </Link>
        <Link href="/signup?signin=true" style={{ width: '100%', background: '#1e293b', color: 'white', padding: '14px', borderRadius: '14px', fontSize: '15px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
          Already have an account? Sign In
        </Link>
      </div>
      <p style={{ color: '#475569', fontSize: '11px', marginTop: '20px', textAlign: 'center' }}>
        Credit card required · Won't be charged for 14 days
      </p>
    </div>
  )
}
