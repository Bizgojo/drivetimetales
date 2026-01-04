'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useAuth } from '@/contexts/AuthContext'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function AddCardForm() {
  const router = useRouter()
  const { user } = useAuth()
  const stripe = useStripe()
  const elements = useElements()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      // Get setup intent
      fetch('/api/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.clientSecret) {
            setClientSecret(data.clientSecret)
          } else {
            setError(data.error || 'Failed to initialize payment setup')
          }
        })
        .catch(err => {
          setError('Failed to connect to payment service')
        })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!stripe || !elements || !clientSecret) {
      return
    }

    setLoading(true)
    setError(null)

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      setError('Card element not found')
      setLoading(false)
      return
    }

    // Confirm the setup intent to save the card
    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    })

    if (stripeError) {
      setError(stripeError.message || 'Failed to save card')
      setLoading(false)
      return
    }

    if (setupIntent?.status === 'succeeded') {
      setSuccess(true)
      // Redirect back after 2 seconds
      setTimeout(() => {
        router.push('/account?cardAdded=true')
      }, 2000)
    } else {
      setError('Failed to save card. Please try again.')
    }

    setLoading(false)
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-white mb-2">Card Saved Successfully!</h2>
        <p className="text-slate-400">Redirecting to your account...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Card Information
        </label>
        <div className="bg-white rounded-lg p-4">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#1e293b',
                  '::placeholder': {
                    color: '#94a3b8',
                  },
                },
                invalid: {
                  color: '#ef4444',
                },
              },
            }}
          />
        </div>
        <p className="text-slate-500 text-xs mt-2">
          Test card: 4242 4242 4242 4242, any future date, any CVC
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !clientSecret || loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-black font-bold rounded-xl transition"
      >
        {loading ? 'Saving...' : 'Save Card'}
      </button>

      <p className="text-slate-500 text-xs text-center">
        Your card will be securely stored by Stripe for future purchases.
      </p>
    </form>
  )
}

export default function AddPaymentMethodPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/signin')
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/account" className="text-white hover:text-orange-400 flex items-center gap-2">
            <span>←</span>
            <span>Back</span>
          </Link>
          <Link href="/home" className="flex items-center gap-1">
            <span className="text-lg">🚛</span>
            <span className="text-lg">🚗</span>
            <span className="font-bold text-white ml-1">Drive Time</span>
            <span className="font-bold text-orange-400">Tales</span>
          </Link>
          <div className="w-12" />
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Add Payment Method</h1>
          <p className="text-slate-400">Save a card for quick credit purchases</p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <Elements stripe={stripePromise}>
            <AddCardForm />
          </Elements>
        </div>
      </div>
    </div>
  )
}
