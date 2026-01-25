'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

function SignUpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signUp } = useAuth()
  
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [referrerName, setReferrerName] = useState<string | null>(null)

  // Get referral code from URL
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      setReferralCode(ref)
      // Look up referrer name
      fetchReferrerName(ref)
    }
  }, [searchParams])

  async function fetchReferrerName(code: string) {
    const { data } = await supabase
      .from('users')
      .select('first_name, display_name')
      .eq('referral_code', code)
      .single()
    
    if (data) {
      setReferrerName(data.first_name || data.display_name || 'A friend')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Sign up the user
    const { error: signUpError, user } = await signUp(email, password, firstName)

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!user) {
      setError('Failed to create account')
      setLoading(false)
      return
    }

    // If there's a referral code, create the referral record
    if (referralCode) {
      // Find the referrer
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', referralCode)
        .single()

      if (referrer) {
        // Create referral record
        await supabase.from('referrals').insert({
          referrer_id: referrer.id,
          referred_id: user.id,
          referred_email: email,
          status: 'signed_up'
        })
      }
    }

    // Redirect to Stripe Checkout for subscription
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: email,
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEST_DRIVER_MONTHLY,
          referralCode: referralCode || undefined
        })
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        setError('Failed to start checkout')
        setLoading(false)
      }
    } catch (err) {
      setError('Failed to connect to payment system')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '32px' }}>🚗</span>
            <span style={{ fontSize: '32px' }}>🚙</span>
          </div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
            Drive Time <span style={{ color: '#f97316' }}>Tales</span>
          </h1>
        </div>

        {/* Referral Banner */}
        {referralCode && (
          <div style={{ backgroundColor: '#22c55e', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
              🎉 {referrerName || 'A friend'} invited you!
            </div>
            <div style={{ color: 'white', fontSize: '13px', marginTop: '0.25rem' }}>
              You both get <strong>1 month free</strong> when you subscribe
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem' }}>
          <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem', textAlign: 'center' }}>
            Create Your Account
          </h2>

          {error && (
            <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* First Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none' }}
              placeholder="Enter your first name"
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none' }}
              placeholder="Enter your email"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ width: '100%', padding: '0.75rem', paddingRight: '3rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none' }}
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: 'none', backgroundColor: loading ? '#334155' : '#f97316', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Creating Account...' : 'Sign Up & Subscribe'}
          </button>

          {/* Login Link */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Already have an account? </span>
            <a href="/login" style={{ color: '#f97316', fontSize: '14px', textDecoration: 'none' }}>Log In</a>
          </div>
        </form>

        {/* Terms */}
        <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
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
