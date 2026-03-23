'use client'

/**
 * /auth/callback — Client-side OAuth callback
 *
 * When this page loads with ?code=, the supabaseBrowser client automatically
 * detects the PKCE code via detectSessionInUrl and exchanges it internally
 * during _initialize(). We must NOT call exchangeCodeForSession manually —
 * that would cause a race condition and consume/remove the verifier before
 * the auto-exchange can use it.
 *
 * Instead: wait for the SIGNED_IN auth state event, then redirect.
 */
import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const returnTo = sessionStorage.getItem('authReturnTo') || '/home'
    sessionStorage.removeItem('authReturnTo')

    // Check for OAuth error in hash fragment (e.g. #error=server_error)
    const hash = window.location.hash
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const errorCode = params.get('error_code') || params.get('error') || 'unknown'
      const errorDesc = params.get('error_description') || ''
      console.error('[AuthCallback] Supabase OAuth error in hash:', errorCode, errorDesc)
      router.push(`/signin?error=${encodeURIComponent(errorCode)}&desc=${encodeURIComponent(errorDesc)}`)
      return
    }

    // The supabaseBrowser client auto-detects ?code= via detectSessionInUrl
    // and exchanges it during initialization. Listen for the result.
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthCallback] Auth event:', event, !!session)

      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()

        // Ensure user profile exists in DB (non-blocking)
        try {
          await fetch('/api/user/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: session.user.id,
              email: session.user.email,
              firstName: session.user.user_metadata?.given_name
                || session.user.user_metadata?.full_name?.split(' ')[0]
                || session.user.email?.split('@')[0],
            }),
          })
        } catch (e) {
          console.error('[AuthCallback] User create error (non-fatal):', e)
        }

        router.push(returnTo)
      } else if (event === 'INITIAL_SESSION' && !session) {
        // No session after initialization — exchange failed
        const code = searchParams.get('code')
        if (!code) {
          subscription.unsubscribe()
          router.push('/signin?error=no_code')
          return
        }
        // Auto-exchange might still be in progress; wait briefly then check
        setTimeout(async () => {
          const { data: { user } } = await supabaseBrowser.auth.getUser()
          if (user) {
            subscription.unsubscribe()
            router.push(returnTo)
          } else {
            subscription.unsubscribe()
            router.push('/signin?error=auth_failed')
          }
        }, 1500)
      }
    })

    // Safety timeout — if no auth event fires in 10s, give up
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      router.push('/signin?error=timeout')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router, searchParams])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Signing you in…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
