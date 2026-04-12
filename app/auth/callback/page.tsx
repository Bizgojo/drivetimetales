'use client'
// This client-side page handles the implicit flow token in the URL hash
// which the server-side route.ts cannot access (hash never sent to server)
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

export default function AuthCallbackPage() {
  const router = useRouter()
  useEffect(() => {
    // Handle implicit flow — token in hash fragment
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/home')
      } else {
        // Listen for auth state change — token arrives via hash
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            subscription.unsubscribe()
            router.replace('/home')
          }
        })
        // Fallback timeout
        setTimeout(() => router.replace('/signin?error=auth_failed'), 10000)
      }
    })
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f0a030', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>∞</div>
        <div>Signing you in...</div>
      </div>
    </div>
  )
}
