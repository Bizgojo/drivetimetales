'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Offer { id: string; name: string; offer_type: 'free_days' | 'credits'; referrer_reward: number; referred_reward: number }

// Trial is locked at 14 days for all users
function getTrialVariant(): { days: number; variant: 'A' | 'B' } {
  return { days: 14, variant: 'A' }
}

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
  const [alreadyExists, setAlreadyExists] = useState(false)
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [referrerName, setReferrerName] = useState<string | null>(null)
  const [referrerId, setReferrerId] = useState<string | null>(null)
  const [referrerEmail, setReferrerEmail] = useState<string | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [referralId, setReferralId] = useState<string | null>(null)
  const [trialDays, setTrialDays] = useState(14)
  const [trialVariant, setTrialVariant] = useState<'A' | 'B'>('A')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    const { days, variant } = getTrialVariant()
    setTrialDays(days)
    setTrialVariant(variant)
    const ref = searchParams.get('ref')
    if (ref) { setReferralCode(ref); trackOpenAndFetchReferrer(ref) }
  }, [searchParams])

  async function sendNotification(data: any) {
    try {
      await fetch('/api/referral/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    } catch (e) { console.error('Notification failed:', e) }
  }

  async function trackOpenAndFetchReferrer(code: string) {
    const { data: referrer } = await supabase.from('users').select('id, email, first_name, display_name, default_offer_id').eq('referral_code', code).single()
    if (referrer) {
      const name = referrer.first_name || referrer.display_name || 'A friend'
      setReferrerName(name); setReferrerId(referrer.id); setReferrerEmail(referrer.email)
      let offerId = referrer.default_offer_id
      if (!offerId) { const { data: defaultOffer } = await supabase.from('referral_offers').select('id').eq('is_default', true).eq('is_active', true).single(); if (defaultOffer) offerId = defaultOffer.id }
      if (offerId) { const { data: offerData } = await supabase.from('referral_offers').select('*').eq('id', offerId).single(); if (offerData) setOffer(offerData) }
      const { data: existingReferral } = await supabase.from('referrals').select('id, opened_at').eq('referrer_id', referrer.id).is('referred_id', null).order('created_at', { ascending: false }).limit(1).single()
      if (existingReferral && !existingReferral.opened_at) {
        await supabase.from('referrals').update({ opened_at: new Date().toISOString() }).eq('id', existingReferral.id)
        setReferralId(existingReferral.id)
        await sendNotification({ referralId: existingReferral.id, type: 'referral_opened', referrerEmail: referrer.email, referrerName: name })
      } else if (!existingReferral) {
        const { data: newReferral } = await supabase.from('referrals').insert({ referrer_id: referrer.id, offer_id: offerId, status: 'invited', opened_at: new Date().toISOString() }).select('id').single()
        if (newReferral) { setReferralId(newReferral.id); await sendNotification({ referralId: newReferral.id, type: 'referral_opened', referrerEmail: referrer.email, referrerName: name }) }
      } else { setReferralId(existingReferral.id) }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    const { error: signUpError, user } = await signUp(email, password, firstName)
    if (signUpError) {
      const msg = signUpError.message || ''
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('user already')) {
        setAlreadyExists(true)
        setLoading(false)
        return
      }
      setError(msg); setLoading(false); return
    }
    if (!user) { setError('Failed to create account'); setLoading(false); return }

    // Save trial variant to users table for A/B tracking

    // Handle referral tracking
    if (referralId && referrerId) {
      await supabase.from('referrals').update({ referred_id: user.id, referred_email: email, status: 'signed_up' }).eq('id', referralId)
      if (referrerEmail) await sendNotification({ referralId, type: 'referral_signed_up', referrerEmail, referrerName: referrerName || 'Friend', referredName: firstName })
    } else if (referrerId && !referralId) {
      const { data: newRef } = await supabase.from('referrals').insert({ referrer_id: referrerId, referred_id: user.id, referred_email: email, offer_id: offer?.id, status: 'signed_up', opened_at: new Date().toISOString() }).select('id').single()
      if (referrerEmail && newRef) await sendNotification({ referralId: newRef.id, type: 'referral_signed_up', referrerEmail, referrerName: referrerName || 'Friend', referredName: firstName })
    }

    try {
      // Referral overrides A/B trial (give them the better offer)
      const finalTrialDays = referralCode ? Math.max(trialDays, 14) : trialDays
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email, referralCode: referralCode || undefined, offerId: offer?.id || undefined, trialDays: finalTrialDays, billingCycle })
      })
      const data = await response.json()
      if (data.url) { window.location.href = data.url }
      else {
        // Checkout failed — delete the orphaned auth user so they can retry
        try { await fetch('/api/user/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) }) } catch {}
        setError('Failed to start checkout. Please try again.'); setLoading(false)
      }
    } catch (err) {
        // Checkout error — delete the orphaned auth user so they can retry
        try { await fetch('/api/user/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) }) } catch {}
        setError('Failed to connect to payment system. Please try again.'); setLoading(false)
      }
  }

  const rewardText = offer
    ? (offer.offer_type === 'free_days' ? offer.referred_reward + ' days free' : offer.referred_reward + ' credits')
    : `${trialDays} days free`

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'8px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ height: '52px', objectFit: 'contain' }} />
          <span style={{ color:'#ffffff', fontSize:'22px', fontWeight:800, letterSpacing:'-0.3px' }}>
            Endless <span style={{ color:'#f97316' }}>Tales</span>
          </span>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Audio stories for your me-time</p>
        </div>

        {/* Trial badge */}
        <div style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '12px', padding: '12px 16px', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#f97316', fontSize: '16px', fontWeight: 800, marginBottom: '2px' }}>🎉 {trialDays}-Day Free Trial</div>
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>Full access to hundreds of stories. Credit card required — cancel before trial ends and you won't be charged.</div>
        </div>


        {/* Referral banner */}
        {referralCode && referrerName && (
          <div style={{ backgroundColor: '#22c55e', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>🎉 {referrerName} invited you!</div>
            <div style={{ color: 'white', fontSize: '13px', marginTop: '0.25rem' }}>You both get <strong>{rewardText}</strong> when you subscribe</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem' }}>
          <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem', textAlign: 'center' }}>Start Your 14-Day Free Trial</h2>

          {error && <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
          {alreadyExists && (
            <div style={{ backgroundColor: '#1e3a5f', border: '1px solid #3b82f6', color: 'white', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '14px', textAlign: 'center' }}>
              You already have an account. <a href="/signin" style={{ color: '#f97316', fontWeight: 700, textDecoration: 'underline' }}>Sign in here →</a>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>First Name</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} placeholder="Enter your first name" />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} placeholder="Enter your email" />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={{ width: '100%', padding: '0.75rem', paddingRight: '3rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} placeholder="Create a password (6+ characters)" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          {/* Billing cycle toggle */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid #334155' }}>
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                style={{ flex: 1, padding: '0.75rem', border: 'none', backgroundColor: billingCycle === 'monthly' ? '#f97316' : '#0f172a', color: billingCycle === 'monthly' ? 'white' : '#94a3b8', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                Monthly<br/>
                <span style={{ fontSize: '12px', fontWeight: 400 }}>$7.99/mo</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                style={{ flex: 1, padding: '0.75rem', border: 'none', borderLeft: '1px solid #334155', backgroundColor: billingCycle === 'annual' ? '#f97316' : '#0f172a', color: billingCycle === 'annual' ? 'white' : '#94a3b8', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                Annual 🏷️ Save 37%<br/>
                <span style={{ fontSize: '12px', fontWeight: 400 }}>$59.99/yr — just $5/mo</span>
              </button>
            </div>
          </div>

          <button
            type={alreadyExists ? 'button' : 'submit'}
            onClick={alreadyExists ? () => window.location.href = '/signin' : undefined}
            disabled={loading}
            style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: 'none', backgroundColor: loading ? '#334155' : alreadyExists ? '#1d4ed8' : '#f97316', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Creating Account...' : alreadyExists ? 'You Already Have an Account — Sign In →' : `Start ${trialDays}-Day Free Trial →`}
          </button>

          {/* What you get */}
          <div style={{ marginTop: '1rem', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.8 }}>
              ✅ Unlimited access to all stories<br/>
              ✅ New stories added every week<br/>
              ✅ Cancel anytime — no commitment
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Already have an account? </span>
            <a href="/signin" style={{ color: '#f97316', fontSize: '14px', textDecoration: 'none' }}>Sign In</a>
          </div>
        </form>

        <p style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
          By signing up you agree to our <a href="/terms" style={{ color: "#f0a030", textDecoration: "none" }}>Terms of Service</a> and <a href="/privacy" style={{ color: "#f0a030", textDecoration: "none" }}>Privacy Policy</a>.<br/>
          $7.99/mo or $59.99/yr after trial. Founding members — price locked for life.
        </p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return <Suspense fallback={<LoadingFallback />}><SignUpContent /></Suspense>
}
