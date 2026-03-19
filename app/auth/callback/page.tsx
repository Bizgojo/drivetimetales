'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { supabase } from '@/lib/supabase'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const returnTo = searchParams.get('returnTo') || '/home'

      if (code) {
        // Exchange the OAuth code for a session (PKCE flow)
        // supabaseBrowser stores the session in cookies so middleware can read it
        const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[AuthCallback] Code exchange error:', error)
          router.push('/signin?error=auth_failed')
          return
        }
      }

      // Get the user after exchange
      const { data: { user } } = await supabaseBrowser.auth.getUser()

      if (!user) {
        router.push('/signin')
        return
      }

      // Ensure user profile exists in DB
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingUser) {
        await fetch('/api/user/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            display_name: user.user_metadata?.full_name || user.email?.split('@')[0],
            credits: 2,
            plan: 'free'
          })
        })
      }

      // Redirect to returnTo (preserves /admin destination)
      router.push(returnTo)
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Signing you in...</p>
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
