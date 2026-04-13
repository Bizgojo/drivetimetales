'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

function ConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'magiclink' | 'email' | null
    const next = searchParams.get('next') || '/home'

    if (!tokenHash || !type) {
      router.replace('/signin?error=invalid_link')
      return
    }

    supabaseBrowser.auth.verifyOtp({ token_hash: tokenHash, type })
      .then(({ data, error }) => {
        if (error || !data.session) {
          console.error('[Confirm] verifyOtp failed:', error?.message)
          router.replace(`/signin?error=auth_failed&reason=${encodeURIComponent(error?.message || 'no_session')}`)
        } else {
          console.log('[Confirm] Session established, redirecting to', next)
          router.replace(next)
        }
      })
  }, [router, searchParams])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: '#94a3b8', fontSize: '15px' }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}
