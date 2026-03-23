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
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '16px 16px 80px' }}>
      <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto', paddingTop: '40px' }}>

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



          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '5px' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                style={{ width: '100%', padding: '11px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '16px', boxSizing: 'border-box' }}
                placeholder="you@example.com" autoComplete="email" />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '5px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                  style={{ width: '100%', padding: '11px', paddingRight: '44px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '16px', boxSizing: 'border-box' }}
                  placeholder="••••••••" autoComplete="current-password" />
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
