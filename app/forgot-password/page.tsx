'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ backgroundColor: '#0f172a', borderRadius: '12px', padding: '32px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
            <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
              Check Your Email
            </h1>
            <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
              We sent a password reset link to <strong style={{ color: 'white' }}>{email}</strong>
            </p>
            <Link 
              href="/signin"
              style={{ color: '#f97316', textDecoration: 'none' }}
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link href="/">
            <img 
              src="/images/et-logo.png" 
              alt="Endless Tales" 
              style={{ height: '60px', margin: '0 auto' }}
            />
          </Link>
        </div>

        <div style={{ backgroundColor: '#0f172a', borderRadius: '12px', padding: '32px', border: '1px solid #1e293b' }}>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
            Reset Password
          </h1>
          <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: '14px', marginBottom: '24px' }}>
            Enter your email and we'll send you a reset link
          </p>

          {error && (
            <div style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', marginBottom: '6px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: loading ? '#92400e' : '#f97316',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '24px', fontSize: '14px' }}>
          Remember your password?{' '}
          <Link href="/signin" style={{ color: '#f97316', textDecoration: 'none', fontWeight: '600' }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
