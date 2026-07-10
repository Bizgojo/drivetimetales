'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { normalizeEmail } from '@/lib/email'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, loading: authLoading, session } = useAuth()

  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [error, setError]             = useState('')
  const [magicLoading, setMagicLoading] = useState(false)
  const [pwLoading, setPwLoading]     = useState(false)

  const returnToParam = searchParams.get('returnTo')
  const returnTo = returnToParam && returnToParam.startsWith('/') && !returnToParam.startsWith('//') ? returnToParam : '/home'

  useEffect(() => {
    if (session) router.replace(returnTo)
  }, [returnTo, router, session])

  useEffect(() => {
    if (authLoading || session) return
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(returnTo)
    })
  }, [authLoading, returnTo, router, session])

  const urlError = searchParams.get('error')
  const urlDesc  = searchParams.get('desc')

  const handleGoogleSignIn = () => {
    const params = returnTo !== '/home' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    window.location.href = `/api/auth/google${params}`
  }

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setError('Please enter your email address above.')
      return
    }
    setError('')
    setMagicLoading(true)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(email), returnTo }),
      })
      if (!res.ok) throw new Error('Request failed')
      router.push(`/auth/magic-sent?email=${encodeURIComponent(normalizeEmail(email))}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setMagicLoading(false)
    }
  }

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPwLoading(true)
    // ATL-CHECKOUT-HYGIENE-001 (defect 2): consistent with signup — Supabase
    // auth already compares emails case-insensitively, so this is safe for
    // accounts created before normalization.
    const { error } = await signIn(normalizeEmail(email), password)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.'
        : error.message)
      setPwLoading(false)
    } else {
      router.push(returnTo)
    }
  }

  if (authLoading || session) return <AuthLaunchSplash />

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '32px 16px 60px', boxSizing: 'border-box' }}>

        <div style={{ backgroundColor: '#0f172a', borderRadius: '20px', padding: '28px 24px', border: '1px solid #1e293b' }}>
          <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 800, margin: '0 0 6px', textAlign: 'center' }}>Welcome back</h1>
          <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', margin: '0 0 24px' }}>Sign in to your Endless Tales account</p>

          <button onClick={handleGoogleSignIn} type="button"
            style={{ width: '100%', padding: '13px', backgroundColor: '#fff', color: '#1f2937', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px', boxSizing: 'border-box' }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#1e293b' }} />
            <span style={{ padding: '0 12px', color: '#475569', fontSize: '13px' }}>or</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#1e293b' }} />
          </div>

          {(error || urlError) && (
            <div style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '14px' }}>
              {error || `Auth error: ${urlError}${urlDesc ? ` — ${urlDesc}` : ''}`}
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
              onKeyDown={e => { if (e.key === 'Enter' && !showPasswordForm) handleMagicLink() }}
              autoComplete="email"
              placeholder="you@example.com"
              style={{ width: '100%', padding: '13px 14px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: 'white', fontSize: '16px', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {!showPasswordForm && (
            <>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={magicLoading}
                style={{ width: '100%', padding: '15px', backgroundColor: magicLoading ? '#7c3f10' : '#f97316', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800, cursor: magicLoading ? 'not-allowed' : 'pointer', letterSpacing: '0.3px', marginBottom: '12px' }}>
                {magicLoading ? 'Sending link…' : '✉️  Send me a login link'}
              </button>

              <button
                type="button"
                onClick={() => { setError(''); setShowPasswordForm(true) }}
                style={{ width: '100%', padding: '12px', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '14px', cursor: 'pointer' }}>
                Sign in with password instead
              </button>
            </>
          )}

          {showPasswordForm && (
            <form onSubmit={handlePasswordSignIn}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>Password</label>
                  <Link href="/forgot-password" style={{ color: '#f97316', fontSize: '12px', textDecoration: 'none' }}>Forgot password?</Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '13px 44px 13px 14px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: 'white', fontSize: '16px', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0 }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={pwLoading}
                style={{ width: '100%', padding: '15px', backgroundColor: pwLoading ? '#7c3f10' : '#f97316', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800, cursor: pwLoading ? 'not-allowed' : 'pointer', letterSpacing: '0.3px', marginBottom: '12px' }}>
                {pwLoading ? 'Signing in…' : 'Sign In'}
              </button>

              <button type="button" onClick={() => { setError(''); setShowPasswordForm(false) }}
                style={{ width: '100%', padding: '12px', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '14px', cursor: 'pointer' }}>
                ← Send me a login link instead
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: '13px', marginTop: '20px' }}>
          Don't have an account?{' '}
          <Link href="/signup" style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600 }}>Sign up</Link>
        </p>

      </div>
    </div>
  )
}

function AuthLaunchSplash() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '14px' }}>
      <img src="/images/et-logo.png" alt="Endless Tales" style={{ width: '54px', height: '54px', objectFit: 'contain' }} />
      <div style={{ width: '30px', height: '30px', border: '3px solid rgba(249,115,22,0.3)', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthLaunchSplash />}>
      <SignInContent />
    </Suspense>
  )
}
