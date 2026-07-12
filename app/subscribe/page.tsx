'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isEntitledUser } from '@/lib/entitlement'
import { normalizePromoCode, readSignupAttribution } from '@/lib/utm'
import { applyPromoTrialDays, BASE_TRIAL_DAYS } from '@/lib/promo'
import { buildSubscribeCheckoutPayload, buildSubscribeSignupPath } from '@/lib/subscribeFunnel'

function safeInternalPath(path: string | null) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return ''
  return path
}

function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#020617',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      Loading...
    </div>
  )
}

function SubscribeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const firstName = (user as any)?.first_name || ''
  const returnTo = safeInternalPath(searchParams.get('returnTo'))
  // ORION-RESUB-FUNNEL-001: read the promo like /signup does ('promo' wins
  // over 'code') and carry it onto the anon signup path so the code survives
  // this page instead of being silently dropped.
  const promoCode = normalizePromoCode(searchParams.get('promo') || searchParams.get('code'))
  const signupPath = buildSubscribeSignupPath(promoCode, returnTo)

  // ORION-RESUB-FUNNEL-001: same server-truth promo validation as the signup
  // page (ATL-PROMO-UI-001) so the trial copy here is honest, not hardcoded.
  const [promoStatus, setPromoStatus] = useState<'none' | 'valid' | 'invalid'>('none')
  const [trialDays, setTrialDays] = useState(BASE_TRIAL_DAYS)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  useEffect(() => {
    if (!promoCode) { setPromoStatus('none'); setTrialDays(BASE_TRIAL_DAYS); return }
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    fetch(`/api/promo/validate?code=${encodeURIComponent(promoCode)}`, { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { valid?: boolean; days?: number | null } | null) => {
        if (cancelled || !data) return
        if (data.valid === true) {
          setPromoStatus('valid')
          // Same max(base, promoDays) math checkout applies server-side.
          setTrialDays(applyPromoTrialDays(BASE_TRIAL_DAYS, data.days))
        } else if (data.valid === false) {
          setPromoStatus('invalid')
        }
      })
      .catch(() => { /* fail quiet — default 7-day display */ })
      .finally(() => clearTimeout(timer))
    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [promoCode])

  // ORION-RESUB-FUNNEL-001 (loop fix): a SIGNED-IN non-entitled user must go
  // straight to Stripe checkout from here. The old router.push('/signup…')
  // bounced authed users right back to /subscribe (ATL-POST-SUB-LOOP-001's
  // signup redirect) — an infinite loop that made resubscribing impossible.
  // /api/checkout re-validates the promo server-side and sets real trial days.
  async function handleStartTrial() {
    if (!user) {
      router.push(signupPath)
      return
    }
    setCheckoutError('')
    setCheckingOut(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubscribeCheckoutPayload({
          userId: user.id,
          email: user.email,
          firstName: (user as any)?.first_name,
          trialDays,
          returnTo: returnTo || undefined,
          attribution: readSignupAttribution(promoCode),
        })),
      })
      const data = await response.json()
      if (data?.url) {
        window.location.href = data.url
        return
      }
      setCheckoutError('Failed to start checkout. Please try again.')
      setCheckingOut(false)
    } catch {
      setCheckoutError('Failed to connect to payment system. Please try again.')
      setCheckingOut(false)
    }
  }

  // ATL-POST-SUB-LOOP-001: entitled users (incl. trialing — webhook writes
  // subscription_type='active' for both) must never see trial/subscribe CTAs.
  // We replace the CTA in place rather than redirecting to /home so a
  // client/middleware entitlement disagreement can never redirect-loop
  // (/home → /subscribe → /home …).
  const entitled = isEntitledUser(user)

  // No flash of the guest CTA while auth is still resolving.
  if (authLoading) {
    return <LoadingFallback />
  }

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#020617',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '32px 24px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          background: '#0f172a',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: '20px',
          padding: '36px 28px',
          width: '100%',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}>
        <div style={{ fontSize: '44px', marginBottom: '16px' }}>🎧</div>

        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.2 }}>
          {firstName ? `${firstName}, unlock` : 'Unlock'} full access
        </h1>

        {/* ORION-RESUB-FUNNEL-001: trial copy is now promo-aware instead of a
            hardcoded 7-day pitch — a validated code shows its real length. */}
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '15px', lineHeight: 1.7, margin: '0 0 28px' }}>
          Original audio dramas made for people on the move. Start your {trialDays}-day free trial and get full access to every story.{promoStatus !== 'valid' ? ' Have a promo code? Enter it at checkout to extend to 14 days.' : ''}
        </p>

        {promoCode && promoStatus === 'valid' && (
          <div style={{ color: '#86efac', fontSize: '13px', fontWeight: 700, textAlign: 'center', marginBottom: '0.75rem' }}>
            {/* ORION-FUNNEL-POLISH-001: never show raw promo codes in copy. */}
            Special offer applied — {trialDays}-day free trial ✓
          </div>
        )}
        {promoCode && promoStatus === 'invalid' && (
          <div style={{ color: '#94a3b8', fontSize: '12.5px', textAlign: 'center', marginBottom: '0.75rem' }}>
            That offer link isn’t valid — standard trial applies
          </div>
        )}

        <div style={{
          background: 'rgba(249,115,22,0.1)',
          border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#f97316' }}>$7.99</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>per month · cancel anytime</div>
          <div style={{ marginTop: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.8 }}>
            ✓ Full access to all stories<br />
            ✓ New stories added weekly<br />
            ✓ Listen or read — even offline<br />
            ✓ Credit card required · cancel before trial ends and you won't be charged
          </div>
        </div>

        {entitled ? (
          <button
            onClick={() => router.push(returnTo || '/home')}
            style={{
              width: '100%', padding: '16px', background: '#f97316', color: 'white',
              border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800,
              cursor: 'pointer', marginBottom: '12px',
            }}
          >
            Go to Library →
          </button>
        ) : (
          <>
            {/* ORION-RESUB-FUNNEL-001: signed-in → direct checkout (loop fix);
                anonymous → /signup with promo + returnTo carried. */}
            <button
              onClick={handleStartTrial}
              disabled={checkingOut}
              style={{
                width: '100%', padding: '16px', background: checkingOut ? '#334155' : '#f97316', color: 'white',
                border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 800,
                cursor: checkingOut ? 'not-allowed' : 'pointer', marginBottom: '12px',
              }}
            >
              {checkingOut ? 'Starting checkout…' : 'Start Free Trial →'}
            </button>
            {checkoutError && (
              <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.75rem', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', textAlign: 'center' }}>
                {checkoutError}
              </div>
            )}
          </>
        )}


        <button
          onClick={() => router.push('/account/promo')}
          style={{ width: '100%', padding: '12px', background: 'transparent', color: 'rgba(255,255,255,0.3)', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', marginTop: '4px' }}
        >
          Have a promo code?
        </button>
        </div>

        {!user && (
          <p style={{ marginTop: '24px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
            Already subscribed?{' '}
            <button
              onClick={() => router.push('/signin')}
              style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: '13px', fontWeight: 600, padding: 0 }}
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscribeContent />
    </Suspense>
  )
}
