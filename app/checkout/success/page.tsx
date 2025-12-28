'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // In production, you'd verify the session with Stripe
    // and update the user's subscription status via webhook
    // For now, we'll just show a success message
    setLoading(false)
  }, [sessionId])

  if (loading) {
    return (
      <div className="py-16 px-4 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Processing your purchase...</p>
      </div>
    )
  }

  return (
    <div className="py-16 px-4">
      <div className="max-w-md mx-auto text-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">✓</span>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">Thank You!</h1>
        <p className="text-slate-400 mb-8">
          Your purchase was successful. Your account has been updated.
        </p>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-2">What's Next?</h2>
          <ul className="text-sm text-slate-400 space-y-2 text-left">
            <li>✓ Your subscription/credits are now active</li>
            <li>✓ You can start streaming immediately</li>
            <li>✓ Receipt sent to your email</li>
          </ul>
        </div>

        <div className="space-y-3">
          <Link 
            href="/library" 
            className="block w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-xl"
          >
            Start Listening
          </Link>
          <Link 
            href="/" 
            className="block w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl"
          >
            Go to Home
          </Link>
        </div>

        {sessionId && (
          <p className="text-xs text-slate-500 mt-6">
            Order ID: {sessionId.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="py-16 px-4 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
