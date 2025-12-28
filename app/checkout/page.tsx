'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const planInfo: Record<string, { name: string; price: number; tier: string }> = {
  commuter_monthly: { name: 'Commuter Monthly', price: 7.99, tier: 'commuter' },
  commuter_annual: { name: 'Commuter Annual', price: 59.99, tier: 'commuter' },
  road_warrior_monthly: { name: 'Road Warrior Monthly', price: 12.99, tier: 'road_warrior' },
  road_warrior_annual: { name: 'Road Warrior Annual', price: 99.99, tier: 'road_warrior' },
}

function CheckoutForm() {
  const params = useSearchParams()
  const planId = params.get('plan') || 'commuter_monthly'
  const email = params.get('email') || ''
  const name = params.get('name') || ''
  const plan = planInfo[planId] || planInfo.commuter_monthly
  const [processing, setProcessing] = useState(false)
  const router = useRouter()
  const { signIn } = useAuth()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    setTimeout(() => {
      router.push('/success?plan=' + planId)
    }, 2000)
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Plan</span>
            <span className="text-white">{plan.name}</span>
          </div>
          <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between text-lg">
            <span className="text-white font-bold">Total</span>
            <span className="text-orange-400 font-bold">${plan.price}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <p className="text-slate-400 text-sm text-center mb-4">
          This is a demo checkout. In production, Stripe handles payments.
        </p>
        <form onSubmit={handleSubmit}>
          <button 
            type="submit" 
            disabled={processing} 
            className={`w-full py-3 rounded-lg font-semibold ${
              processing 
                ? 'bg-slate-600 text-slate-400' 
                : 'bg-orange-500 hover:bg-orange-400 text-black'
            }`}
          >
            {processing ? 'Processing...' : `Complete Purchase`}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <div className="py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="flex items-center justify-center gap-2 mb-6">
          <span className="text-2xl">🚛</span>
          <span className="font-bold"><span className="text-orange-400">Drive Time</span> Tales</span>
        </Link>
        <h1 className="text-2xl font-bold text-white text-center mb-6">Complete Your Subscription</h1>
        <Suspense fallback={<div className="text-slate-400 text-center">Loading...</div>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </div>
  )
}
