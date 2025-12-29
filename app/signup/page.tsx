'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

type TierKey = 'test_driver' | 'commuter' | 'road_warrior'

const tierInfo: Record<TierKey, { name: string; icon: string; monthlyPrice: number; features: string }> = {
  test_driver: { name: 'Test Driver', icon: '🚗', monthlyPrice: 0, features: '2 hours/month free' },
  commuter: { name: 'Commuter', icon: '🚙', monthlyPrice: 7.99, features: 'Unlimited streaming' },
  road_warrior: { name: 'Road Warrior', icon: '🚛', monthlyPrice: 12.99, features: 'Unlimited + Downloads' },
}

function Form() {
  const params = useSearchParams()
  const tierId = (params.get('tier') || 'test_driver') as TierKey
  const tier = tierInfo[tierId] || tierInfo.test_driver
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const router = useRouter()
  const { signUp } = useAuth()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tier.monthlyPrice > 0) {
      router.push(`/checkout?tier=${tierId}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`)
    } else {
      router.push('/')
    }
  }
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <div className="bg-slate-900/50 rounded-lg p-3 mb-4 text-center">
        <p className="text-xs text-slate-400">Selected Plan</p>
        <p className="text-2xl mb-1">{tier.icon}</p>
        <p className="text-lg font-bold text-white">{tier.name}</p>
        <p className="text-orange-400 text-sm">
          {tier.features}
          {tier.monthlyPrice > 0 && ` • $${tier.monthlyPrice}/mo`}
        </p>
      </div>
      <h1 className="text-xl font-bold text-white text-center mb-4">Create Your Account</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-orange-500" />
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-orange-500" />
        <button type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg">
          {tier.monthlyPrice > 0 ? 'Continue to Payment' : 'Create Free Account'}
        </button>
      </form>
      <p className="text-xs text-slate-500 text-center mt-3">🔒 This device will remember you</p>
      <p className="text-center text-xs text-slate-500 mt-3"><Link href="/pricing" className="text-orange-400">← Change plan</Link></p>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <div className="py-12 px-4">
      <div className="max-w-sm mx-auto">
        <Link href="/" className="flex items-center justify-center gap-2 mb-6">
          <span className="text-2xl">🚛</span>
          <span className="font-bold"><span className="text-orange-400">Drive Time</span> Tales</span>
        </Link>
        <Suspense fallback={<div className="text-slate-400 text-center">Loading...</div>}>
          <Form />
        </Suspense>
        <p className="text-center text-slate-400 text-sm mt-4">Have an account? <Link href="/signin" className="text-orange-400">Sign in</Link></p>
      </div>
    </div>
  )
}
