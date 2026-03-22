'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase-browser'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)

  const returnTo = searchParams.get('returnTo') || '/home'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(returnTo)
    }
  }

  const handleGoogleLogin = async () => {
    setSocialLoading('google')
    setError('')
    sessionStorage.setItem('authReturnTo', returnTo)
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) {
      setError(error.message)
      setSocialLoading(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ height: '44px', objectFit: 'contain' }} />
        </div>

        {/* NEW USER — Trial CTA */}
        <div style={{ background: 'linear-gradient(135deg, #065f46, #064e3b)', border: '1px solid #10b981', borderRadius: '16px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎧</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>New to Endless Tales?</div>
          <div style={{ color: '#a7f3d0', fontSize: '13px', marginBottom: '16px' }}>Hundreds of audio stories — 7 days free, then $2.99/mo for founding members. Cancel anytime.</div>
          <Link href="/signup" style={{ display: 'block', backgroundColor: '#10b981', color: 'white', padding: '14px', borderRadius: '10px', fontSize: '16px', fontWeight: 800, textDecoration: 'none' }}>
            🎉 Start Your 7-Day Free Trial
          </Link>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#1e293b' }} />
          <span style={{ padding: '0 14px', color: '#475569', fontSize: '13px' }}>Already a subscriber? Sign in</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#1e293b' }} />
        </div>

        {/* EXISTING USER — Sign In */}
        <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: '24px', border: '1px solid #1e293b' }}>
          {error && (
            <div style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>{error}</div>
          )}

          {/* Google */}
          <button type="button" onClick={handleGoogleLogin} disabled={socialLoading !== null}
            style={{ width: '100%', padding: '12px', backgroundColor: '#ffffff', color: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: socialLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {socialLoading === 'google' ? 'Connecting...' : 'Continue with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
            <span style={{ padding: '0 12px', color: '#64748b', fontSize: '13px' }}>or</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '5px' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '11px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '15px', boxSizing: 'border-box' }}
                placeholder="you@example.com" />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '5px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ width: '100%', padding: '11px', paddingRight: '44px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '15px', boxSizing: 'border-box' }}
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px' }}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || socialLoading !== null}
              style={{ width: '100%', padding: '13px', backgroundColor: loading ? '#92400e' : '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Link href="/forgot-password" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>Forgot your password?</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function SignInPage() {
  return (<Suspense fallback={<LoadingFallback />}><SignInContent /></Suspense>)
}
