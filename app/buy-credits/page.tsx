'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

const CREDIT_PACKS = [
  {
    id: 'small',
    credits: 5,
    price: '$1.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PACK_SMALL
  },
  {
    id: 'medium',
    credits: 15,
    price: '$4.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PACK_MEDIUM,
    popular: true
  },
  {
    id: 'large',
    credits: 30,
    price: '$8.99',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PACK_LARGE
  }
]

export default function BuyCreditsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleBuy = async (pack: typeof CREDIT_PACKS[0]) => {
    if (!user) {
      router.push('/signin?returnTo=/buy-credits')
      return
    }

    setLoading(pack.id)
    setError('')

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          priceId: pack.priceId,
          mode: 'payment' // one-time purchase, not subscription
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
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
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
            Buy Credits
          </h1>
          <p style={{ color: '#94a3b8', marginTop: '8px' }}>
            One-time purchase • No subscription required
          </p>
          {user?.credits !== undefined && (
            <p style={{ color: '#f97316', marginTop: '8px', fontWeight: '600' }}>
              Current balance: {user.credits === -1 ? '∞' : user.credits} credits
            </p>
          )}
        </div>

        {error && (
          <div style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Credit Packs */}
        <div style={{ display: 'grid', gap: '12px' }}>
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              style={{
                backgroundColor: '#0f172a',
                borderRadius: '12px',
                padding: '20px',
                border: pack.popular ? '2px solid #f97316' : '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                {pack.popular && (
                  <div style={{ color: '#f97316', fontSize: '11px', fontWeight: '600', marginBottom: '4px' }}>
                    BEST VALUE
                  </div>
                )}
                <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
                  {pack.credits} Credits
                </div>
                <div style={{ color: '#94a3b8', fontSize: '14px' }}>
                  {pack.price}
                </div>
              </div>
              <button
                onClick={() => handleBuy(pack)}
                disabled={loading !== null}
                style={{
                  padding: '10px 20px',
                  backgroundColor: loading === pack.id ? '#92400e' : '#f97316',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: loading !== null ? 'not-allowed' : 'pointer'
                }}
              >
                {loading === pack.id ? '...' : 'Buy'}
              </button>
            </div>
          ))}
        </div>

        {/* Subscribe CTA */}
        <div style={{ 
          backgroundColor: '#1e293b', 
          borderRadius: '12px', 
          padding: '20px', 
          marginTop: '24px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#94a3b8', marginBottom: '12px' }}>
            Want more value? Subscribe for monthly credits!
          </p>
          <Link 
            href="/subscribe"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              backgroundColor: '#22c55e',
              color: 'black',
              borderRadius: '8px',
              fontWeight: '600',
              textDecoration: 'none'
            }}
          >
            View Plans
          </Link>
        </div>

        {/* Back link */}
        <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '24px', fontSize: '14px' }}>
          <Link href="/library" style={{ color: '#f97316', textDecoration: 'none' }}>
            ← Back to Library
          </Link>
        </p>
      </div>
    </div>
  )
}
