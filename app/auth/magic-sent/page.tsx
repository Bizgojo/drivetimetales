'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function MagicSentContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'your email'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>

        <div style={{ fontSize: '64px', marginBottom: '24px' }}>📬</div>

        <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 800, margin: '0 0 12px' }}>
          Check your email
        </h1>

        <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: 1.6, margin: '0 0 8px' }}>
          We sent a login link to
        </p>
        <p style={{ color: '#f97316', fontSize: '16px', fontWeight: 700, margin: '0 0 32px', wordBreak: 'break-all' }}>
          {email}
        </p>

        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 32px' }}>
          Tap the link in the email to sign in. The link expires in 1 hour.
        </p>

        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: 'white' }}>On iPhone?</strong> Tap the link in Mail — it will open the app directly.
          </p>
        </div>

        <a href="/signin" style={{ color: '#f97316', fontSize: '14px', textDecoration: 'none' }}>
          ← Back to sign in
        </a>
      </div>
    </div>
  )
}

export default function MagicSentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white' }}>Loading…</div>
      </div>
    }>
      <MagicSentContent />
    </Suspense>
  )
}
