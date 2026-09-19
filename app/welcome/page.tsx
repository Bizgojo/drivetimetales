'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { captureReferralFromUrl, normalizeReferralCode } from '@/lib/referral'

export default function WelcomePage() {
  const router = useRouter()

  useEffect(() => {
    async function check() {
      // REFERRAL-SIGNUP-001: /welcome?ref=CODE is the "help a friend" invite
      // link (app/refer). This page used to bounce straight to /guest and drop
      // the query string, so the code never reached signup. Persist it first
      // (don't rely on the layout-level ReferralCapture winning the race with
      // this redirect), and send new visitors to /signup WITH the code so they
      // see the referral banner.
      captureReferralFromUrl()
      const ref = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'))
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/home')
      } else if (ref) {
        router.replace(`/signup?ref=${encodeURIComponent(ref)}`)
      } else {
        router.replace('/guest')
      }
    }
    check()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
