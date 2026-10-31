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
    const rawNext = searchParams.get('next') || '/home'
    // AMENDMENT-1 Gap 8.4b: this page loads in a NEW TAB (from the email
    // link) where the old tab's sessionStorage does not exist. Carry
    // et_test=<run_id> forward into the landing URL so the pixel guards
    // (URL → sessionStorage) suppress production events for the whole
    // test session. Invalid ids are dropped, never echoed.
    const etTestRaw = searchParams.get('et_test')
    const etTest = etTestRaw && /^[A-Za-z0-9_-]{1,64}$/.test(etTestRaw.trim()) ? etTestRaw.trim() : null
    const withEtTest = (path: string) => {
      if (!etTest || /(^|[?&])et_test=/.test(path)) return path
      return `${path}${path.includes('?') ? '&' : '?'}et_test=${encodeURIComponent(etTest)}`
    }
    const next = withEtTest(rawNext)

    if (!tokenHash || !type) {
      router.replace(withEtTest('/signin?error=invalid_link'))
      return
    }

    supabaseBrowser.auth.verifyOtp({ token_hash: tokenHash, type })
      .then(({ data, error }) => {
        if (error || !data.session) {
          console.error('[Confirm] verifyOtp failed:', error?.message)
          // Show a clear expired-link page rather than the generic sign-in
          router.replace(withEtTest(`/auth/link-expired?reason=${encodeURIComponent(error?.message || 'no_session')}`))
        } else {
          console.log('[Confirm] Session established, redirecting to', next)
          // AMENDMENT-1 Gap 8.4 (test-account suppression): a logged-in
          // test account must suppress pixels even with no et_test in the
          // URL. Best-effort persistent flags; the et_test carry above is
          // the primary guard and never depends on this lookup.
          supabaseBrowser.from('users').select('is_test_account').eq('id', data.session.user.id).single()
            .then(({ data: row }) => {
              if ((row as any)?.is_test_account === true) {
                try { localStorage.setItem('et_test_account', '1') } catch {}
                try { document.cookie = 'et_test_account=1; Max-Age=31536000; Path=/; SameSite=Lax' } catch {}
                try { (window as any).__etTestSession = true } catch {}
              }
            })
            .catch(() => {})
            .finally(() => router.replace(next))
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
