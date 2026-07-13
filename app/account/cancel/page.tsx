'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function CancelSubscriptionPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState('')

  const userAny = user as any
  const planKey = userAny?.plan || userAny?.subscription_type || 'free'
  
  const planNames: Record<string, string> = {
    'founding_member': 'Founding Member',
    'standard': 'Unlimited',
    'test_driver': 'Founding Member',
    'commuter': 'Unlimited',
    'road_warrior': 'Unlimited',
    'free': 'No active subscription'
  }

  async function handleCancel() {
    setCancelling(true)
    setError('')
    
    try {
      const response = await fetch('/api/user/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id })
      })
      
      if (response.ok) {
        setCancelled(true)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to cancel subscription')
      }
    } catch (err) {
      setError('Failed to cancel subscription. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Please sign in</p>
      </div>
    )
  }

  if (planKey === 'free') {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-center">
          <span className="text-5xl block mb-4">ℹ️</span>
          <h1 className="text-xl font-bold text-white mb-2">No Active Subscription</h1>
          <p className="text-slate-400 mb-6">You don't have an active subscription to cancel.</p>
          <button
            onClick={() => router.push('/account')}
            className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl"
          >
            Back to Account
          </button>
        </div>
      </div>
    )
  }

  if (cancelled) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-center max-w-md mx-auto">
          <span className="text-5xl block mb-4">✅</span>
          <h1 className="text-xl font-bold text-white mb-2">Subscription Cancelled</h1>
          <p className="text-slate-400 mb-6">
            Your subscription has been cancelled. You'll continue to have access until the end of your current billing period.
          </p>
          <p className="text-slate-500 text-sm mb-6">
            You can keep listening to subscriber stories until your current access period ends.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">

      <div className="p-6 max-w-md mx-auto">
        <div className="text-center mb-8">
          <span className="text-5xl block mb-4">😢</span>
          <h1 className="text-xl font-bold text-white mb-2">Cancel Subscription</h1>
          <p className="text-slate-400">We're sorry to see you go!</p>
        </div>

        {/* Current Plan Info */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6">
          <p className="text-slate-400 text-sm mb-1">Current Plan</p>
          <p className="text-orange-400 font-bold text-lg">{planNames[planKey] || planKey}</p>
        </div>

        {/* What You'll Lose */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6">
          <h3 className="text-white font-semibold mb-3">What you'll lose:</h3>
          <ul className="space-y-2 text-slate-400 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-red-400">✕</span>
              Subscriber story access
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400">✕</span>
              Access to new story releases
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400">✕</span>
              Subscriber-only features
            </li>
          </ul>
        </div>

        {/* What You'll Keep */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6">
          <h3 className="text-white font-semibold mb-3">What you'll keep:</h3>
          <ul className="space-y-2 text-slate-400 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-green-400">✓</span>
              Access through the end of your billing period
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400">✓</span>
              Your account and listening preferences
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400">✓</span>
              Your listening history and progress
            </li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 mb-6 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => router.back()}
            className="w-full py-3 bg-orange-500 text-black font-bold rounded-xl"
          >
            Keep My Subscription
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full py-3 bg-slate-800 border border-red-500/50 text-red-400 font-medium rounded-xl disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Yes, Cancel Subscription'}
          </button>
        </div>

        <p className="text-slate-500 text-xs text-center mt-6">
          You can resubscribe anytime from your account settings.
        </p>
      </div>
    </div>
  )
}
