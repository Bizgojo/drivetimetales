'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

function PurchaseSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshCredits } = useAuth()
  
  const returnUrl = searchParams.get('returnUrl')
  const credits = searchParams.get('credits')

  useEffect(() => {
    // Refresh credits in auth context
    refreshCredits()
    
    // Redirect after a short delay to show success message
    const timer = setTimeout(() => {
      if (returnUrl) {
        // Decode and redirect to the original page
        window.location.href = decodeURIComponent(returnUrl)
      } else {
        router.push('/library')
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [returnUrl, router, refreshCredits])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-2">Purchase Successful!</h1>
        {credits && (
          <p className="text-orange-400 text-lg mb-4">
            +{credits} credits added to your account
          </p>
        )}
        <p className="text-slate-400">
          Redirecting you back...
        </p>
        <div className="mt-4">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    </div>
  )
}

export default function PurchaseSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PurchaseSuccessContent />
    </Suspense>
  )
}
