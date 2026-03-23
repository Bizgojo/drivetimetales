'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn } = useAuth()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const returnTo = searchParams.get('returnTo') || '/home'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.'
        : error.message)
      setLoading(false)
    } else {
      router.push(returnTo)
    }
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#020617', overflowY:'auto', WebkitOverflowScrolling:'touch' as any, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 16px 60px' }}>
      <div style={{ width:'100%', maxWidth:'380px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ height:'48px', objectFit:'contain' }} />
        </div>

        {/* Sign In Card */}
        <div style={{ backgroundColor:'#0f172a', borderRadius:'20px', padding:'28px 24px', border:'1px solid #1e293b' }}>
          <h1 style={{ color:'white', fontSize:'22px', fontWeight:800, margin:'0 0 6px', textAlign:'center' }}>Welcome back</h1>
          <p style={{ color:'#64748b', fontSize:'14px', textAlign:'center', margin:'0 0 24px' }}>Sign in to your Endless Tales account</p>

          {error && (
            <div style={{ backgroundColor:'#450a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'12px 16px', borderRadius:'10px', marginBottom:'20px', fontSize:'14px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', color:'#94a3b8', fontSize:'13px', fontWeight:600, marginBottom:'6px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior:'smooth', block:'center' }), 300)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={{ width:'100%', padding:'13px 14px', backgroundColor:'#1e293b', border:'1px solid #334155', borderRadius:'10px', color:'white', fontSize:'16px', boxSizing:'border-box', outline:'none' }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <label style={{ color:'#94a3b8', fontSize:'13px', fontWeight:600 }}>Password</label>
                <Link href="/forgot-password" style={{ color:'#f97316', fontSize:'12px', textDecoration:'none' }}>Forgot password?</Link>
              </div>
              <div style={{ position:'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior:'smooth', block:'center' }), 300)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ width:'100%', padding:'13px 44px 13px 14px', backgroundColor:'#1e293b', border:'1px solid #334155', borderRadius:'10px', color:'white', fontSize:'16px', boxSizing:'border-box', outline:'none' }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:'18px', lineHeight:1, padding:0 }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'15px', backgroundColor: loading ? '#7c3f10' : '#f97316', color:'white', border:'none', borderRadius:'12px', fontSize:'16px', fontWeight:800, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing:'0.3px' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* New user link — secondary, below the form */}
        <div style={{ textAlign:'center', marginTop:'24px' }}>
          <span style={{ color:'#475569', fontSize:'14px' }}>Don't have an account? </span>
          <Link href="/signup" style={{ color:'#f97316', fontSize:'14px', fontWeight:700, textDecoration:'none' }}>
            Start free trial →
          </Link>
        </div>

      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:'32px', height:'32px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
