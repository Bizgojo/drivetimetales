'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '../layout'

const planInfo: Record<string, { name: string; price: number; credits: number }> = {
  starter: { name: 'Starter', price: 3.99, credits: 18 },
  commuter: { name: 'Commuter', price: 6.99, credits: 30 },
  longhaul: { name: 'Long Haul', price: 14.99, credits: 999 },
}

function CheckoutForm() {
  const params = useSearchParams()
  const planId = params.get('plan') || 'starter'
  const email = params.get('email') || ''
  const name = params.get('name') || ''
  const plan = planInfo[planId] || planInfo.starter
  const [method, setMethod] = useState<'card' | 'paypal'>('card')
  const [processing, setProcessing] = useState(false)
  const router = useRouter()
  const { setUser } = useUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    setTimeout(() => {
      setUser({ isLoggedIn: true, name, email, plan: planId, creditsRemaining: plan.credits, creditsTotal: plan.credits, wishlist: [] })
      router.push('/')
    }, 2000)
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Plan</span><span className="text-white">{plan.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Credits</span><span className="text-orange-400">{plan.credits === 999 ? 'Unlimited' : plan.credits}/mo</span></div>
          <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between text-lg"><span className="text-white font-bold">Total</span><span className="text-orange-400 font-bold">${plan.price}/mo</span></div>
        </div>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-4">Payment</h2>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMethod('card')} className={`flex-1 py-2 rounded-lg font-semibold text-sm ${method === 'card' ? 'bg-orange-500 text-black' : 'bg-slate-700 text-slate-300'}`}>💳 Card</button>
          <button onClick={() => setMethod('paypal')} className={`flex-1 py-2 rounded-lg font-semibold text-sm ${method === 'paypal' ? 'bg-orange-500 text-black' : 'bg-slate-700 text-slate-300'}`}>🅿️ PayPal</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {method === 'card' ? (
            <>
              <input type="text" placeholder="4242 4242 4242 4242" className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm" required />
              <div className="flex gap-2">
                <input type="text" placeholder="MM/YY" className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm" required />
                <input type="text" placeholder="CVC" className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm" required />
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-slate-400 text-sm">Click below to pay with PayPal</div>
          )}
          <button type="submit" disabled={processing} className={`w-full py-3 rounded-lg font-semibold ${processing ? 'bg-slate-600 text-slate-400' : 'bg-orange-500 text-black'}`}>{processing ? 'Processing...' : `Pay $${plan.price}/mo`}</button>
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
