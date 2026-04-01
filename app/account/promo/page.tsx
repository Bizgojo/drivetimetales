'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

function PromoContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')

  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (urlCode) setCode(urlCode.toUpperCase())
  }, [searchParams])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRedeem = async () => {
    if (!code.trim()) return
    if (!user?.id) { router.push('/signin'); return }
    setLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), userId: user.id, email: user.email })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid code'); setLoading(false); return }
      setSuccess(`Code applied! ${data.daysGranted} days of access granted.`)
      setCode('')
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '32px' }}>
        <img src="/images/et-logo.png" alt="Endless Tales" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
        <div style={{ fontSize: '22px', fontWeight: 900 }}>Endless <span style={{ color: '#f97316' }}>Tales</span></div>
      </div>
      <div style={{ background: '#0f172a', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '20px', padding: '36px 28px', maxWidth: '400px', width: '100%' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 8px', textAlign: 'center' }}>Redeem a Code</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.6 }}>
          Have a promo or invite code? Enter it below to unlock free access.
        </p>
        {success && (
          <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '10px', padding: '14px', marginBottom: '20px', color: '#4ade80', fontSize: '14px', textAlign: 'center', fontWeight: 600 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', padding: '14px', marginBottom: '20px', color: '#f87171', fontSize: '14px', textAlign: 'center' }}>
            {error}
          </div>
        )}
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, '').replace(/\+/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleRedeem()}
          placeholder="ENTER CODE"
          style={{ width: '100%', padding: '16px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '18px', fontWeight: 800, textAlign: 'center', letterSpacing: '0.1em', marginBottom: '16px', outline: 'none', boxSizing: 'border-box' }}
        />
        <button
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          style={{ width: '100%', padding: '16px', background: loading || !code.trim() ? '#334155' : '#f97316', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800, cursor: loading || !code.trim() ? 'not-allowed' : 'pointer', marginBottom: '12px' }}
        >
          {loading ? 'Applying...' : 'Apply Code'}
        </button>
        {success && (
          <button onClick={() => router.push('/home')} style={{ width: '100%', padding: '14px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
            Start Listening
          </button>
        )}
      </div>
      <button onClick={() => { try { router.back() } catch { router.push('/home') } }} style={{ marginTop: '24px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '13px' }}>
        Back
      </button>
    </div>
  )
}

export default function PromoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', backgroundColor: '#020617' }} />}>
      <PromoContent />
    </Suspense>
  )
}
