'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

const PLANS = [
  {
    id: 'test_driver',
    name: 'Test Driver',
    price: '$2.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEST_DRIVER_MONTHLY,
    credits: 10,
    description: 'Perfect for trying out Drive Time Tales'
  },
  {
    id: 'commuter',
    name: 'Commuter',
    price: '$7.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_COMMUTER_MONTHLY,
    credits: 30,
    description: 'Great for daily commuters'
  },
  {
    id: 'road_warrior',
    name: 'Road Warrior',
    price: '$14.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ROAD_WARRIOR_MONTHLY,
    credits: -1,
    description: 'Unlimited listening for long hauls'
  }
]

export default function SubscribePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleSubscribe = async (plan: typeof PLANS[0]) => {
    if (!user) {
      router.push('/signin?returnTo=/subscribe')
      return
    }

    setLoading(plan.id)
    setError('')

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          priceId: plan.priceId
        })
      })

      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('Failed to start checkout')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', padding: '16px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px', paddingTop: '24px' }}>
          <Link href="/">
            <img 
              src="/images/dtt-logo.png" 
              alt="Drive Time Tales" 
              style={{ height: '60px', margin: '0 auto' }}
            />
          </Link>
          <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', marginTop: '24px' }}>
            Choose Your Plan
          </h1>
          <p style={{ color: '#94a3b8', marginTop: '8px' }}>
            Subscribe for monthly credits • Cancel anytime
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Plans */}
        <div style={{ display: 'grid', gap: '16px' }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                backgroundColor: '#0f172a',
                borderRadius: '12px',
                padding: '24px',
                border: plan.id === 'commuter' ? '2px solid #f97316' : '1px solid #1e293b'
              }}
            >
              {plan.id === 'commuter' && (
                <div style={{ color: '#f97316', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
                    {plan.name}
                  </h2>
                  <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                    {plan.description}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
                    {plan.price}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                    /month
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <div style={{ color: '#f97316', fontWeight: '600' }}>
                  {plan.credits === -1 ? '∞ Unlimited' : `${plan.credits} credits`}
                </div>
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loading !== null}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: loading === plan.id ? '#92400e' : '#f97316',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: loading !== null ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading === plan.id ? 'Loading...' : 'Subscribe'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Back link */}
        <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '32px', fontSize: '14px' }}>
          <Link href="/library" style={{ color: '#f97316', textDecoration: 'none' }}>
            ← Back to Library
          </Link>
        </p>
      </div>
    </div>
  )
}
