'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SignUpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Get plan from URL params
  const planId = searchParams.get('plan') || 'road_warrior'
  const billing = searchParams.get('billing') || 'monthly'
  const priceId = searchParams.get('priceId') || ''

  // Plan details mapping
  const planDetails: { [key: string]: { name: string, monthly: string, annual: string, credits: string } } = {
    test_driver: { 
      name: 'Test Driver', 
      monthly: '$2.99/mo', 
      annual: '$29.99/yr',
      credits: '10 credits/month'
    },
    commuter: { 
      name: 'Commuter', 
      monthly: '$7.99/mo', 
      annual: '$79.99/yr',
      credits: '25 credits/month'
    },
    road_warrior: { 
      name: 'Road Warrior', 
      monthly: '$14.99/mo', 
      annual: '$149.99/yr',
      credits: 'Unlimited'
    }
  }

  const currentPlan = planDetails[planId] || planDetails['road_warrior']
  const currentPrice = billing === 'annual' ? currentPlan.annual : currentPlan.monthly

  // Password validation
  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 6) {
      return 'Password must be at least 6 characters'
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least 1 capital letter'
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least 1 number'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Validation
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    
    // Password validation with new rules
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Create user account with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            name: name.trim(),
          }
        }
      })
      
      if (authError) {
        if (authError.message.includes('already registered')) {
          // Auto-redirect to Sign In with email pre-filled
          router.push(`/signin?email=${encodeURIComponent(email.trim())}`)
          return
        } else {
          setError(authError.message)
        }
        setIsSubmitting(false)
        return
      }
      
      if (!authData.user) {
        setError('Failed to create account. Please try again.')
        setIsSubmitting(false)
        return
      }
      
      // Create user profile (pending subscription)
      // DB columns: id, email, display_name, credits, subscription_type, subscription_ends_at, stripe_customer_id, stripe_subscription_id, created_at
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: email.trim(),
          display_name: name.trim(),  // DB column is 'display_name', not 'name'
          credits: 0,                  // DB column is 'credits', not 'credits_remaining'
          subscription_type: planId,   // DB column is 'subscription_type'
          // Note: subscription_status and subscription_plan don't exist in DB schema
        })
      
      if (profileError) {
        console.error('Profile creation error:', profileError)
      }
      
      // Redirect to Stripe checkout
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
  productType: 'subscription',
  productId: `${planId}_${billing}`,
  userId: authData.user.id,
}),
      })
      
      const { url, error: checkoutError } = await response.json()
      
      if (checkoutError) {
        setError('Failed to create checkout session. Please try again.')
        setIsSubmitting(false)
        return
      }
      
      // Redirect to Stripe
      if (url) {
        window.location.href = url
      }
      
    } catch (err) {
      setError('An error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto px-4 py-6">
        
        {/* Logo - NEW EMOJI VERSION */}
        <div className="flex justify-center mb-6">
          <Link href="/welcome" className="flex items-center gap-2">
            <span className="text-3xl">🚛</span>
            <span className="text-3xl">🚗</span>
            <div className="flex items-baseline ml-1">
              <span className="text-lg font-bold text-white">Drive Time </span>
              <span className="text-lg font-bold text-orange-500">Tales</span>
            </div>
          </Link>
        </div>

        {/* Selected Plan Banner - UPDATED with name, type, price, credits */}
        <div className="bg-orange-500/20 border border-orange-500/50 rounded-xl p-4 mb-6">
          <div className="text-center">
            <p className="text-orange-300 text-xs uppercase tracking-wide mb-1">Selected Plan</p>
            <p className="text-white text-lg font-bold">
              {currentPlan.name}
              <span className="text-orange-400 font-normal"> ({billing})</span>
            </p>
            <p className="text-orange-400 text-xl font-bold mt-1">{currentPrice}</p>
            <p className="text-slate-400 text-sm">{currentPlan.credits}</p>
          </div>
          <div className="text-center mt-2">
            <Link href="/pricing" className="text-orange-300 text-sm hover:underline">
              Change plan
            </Link>
          </div>
        </div>

        {/* Registration Form */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h1 className="text-xl font-bold text-white text-center mb-4">
            Create Your Account
          </h1>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="name"
              />
            </div>
            
            {/* Email */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="email"
              />
            </div>
            
            {/* Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="new-password"
              />
              <p className="text-slate-500 text-xs mt-1">
                Must be 6+ characters with 1 capital letter and 1 number
              </p>
            </div>
            
            {/* Confirm Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="new-password"
              />
            </div>
            
            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 rounded-xl font-bold text-base transition-colors ${
                isSubmitting
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-400 text-black'
              }`}
            >
              {isSubmitting ? 'Creating Account...' : 'Continue to Payment'}
            </button>
          </form>
          
          {/* Terms */}
          <p className="text-slate-500 text-xs text-center mt-4">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-orange-400 hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-orange-400 hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SignUpContent />
    </Suspense>
  )
}
