/*
================================================================================
🚗 /go — GVL CAMPAIGN LANDING PAGE (SUS/ATL-LANDING-001)
Location: app/go/page.tsx

PURPOSE:
Dedicated landing page for paid ad traffic (Greenville launch). Single CTA
to /signup carrying promo + full utm_* param set.

HARD RULES:
- NO auth calls of any kind. Renders identically for anonymous and
  signed-in visitors. '/go' is in PUBLIC_ROUTES (middleware.ts) so the
  middleware never touches Supabase for this path.
- Dark background, WHITE text only (standing UI rule). Orange is allowed
  only as the CTA button background / brand mark.
- ONE CTA. No nav, no header menu, no footer link farm. Logo + copy + CTA +
  trust line + small terms/privacy links only.
- UTM capture: root layout mounts <UtmCapture /> (verified in
  app/layout.tsx), which fires captureUtmFromUrl() on this route too. The
  CTA href additionally carries the full utm_* set directly, so attribution
  survives even if localStorage capture fails.
- Promo trial display mirrors app/signup/page.tsx (ATL-PROMO-UI-001):
  server-truth via GET /api/promo/validate, fail-quiet to 7-day default.
================================================================================
*/

'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { buildCampaignSignupHref, normalizePromoCode } from '@/lib/utm'
import { getTrialDisplay, PromoStatus } from '@/lib/landing'

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

function GoLandingContent() {
  const searchParams = useSearchParams()
  // Same param precedence as app/signup/page.tsx: ?promo= wins over ?code=.
  const promoCode = normalizePromoCode(searchParams.get('promo') || searchParams.get('code'))
  // 'none' = no code or validation unavailable (fail quiet → default display)
  const [promoStatus, setPromoStatus] = useState<PromoStatus>('none')
  const [promoDays, setPromoDays] = useState<number | null>(null)

  // CTA href: promo + full utm_* set from the current URL → /signup.
  const ctaHref = buildCampaignSignupHref(searchParams)

  // ATL-PROMO-UI-001 pattern: server-truth promo validation for honest trial
  // display. Valid → real trial length + "applied" badge. Invalid, missing,
  // or endpoint down/slow → quietly keep the 7-day default. Never blocking.
  useEffect(() => {
    if (!promoCode) { setPromoStatus('none'); return }
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    fetch(`/api/promo/validate?code=${encodeURIComponent(promoCode)}`, { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { valid?: boolean; days?: number | null } | null) => {
        if (cancelled || !data) return
        if (data.valid === true) {
          setPromoStatus('valid')
          setPromoDays(typeof data.days === 'number' ? data.days : null)
        } else if (data.valid === false) {
          setPromoStatus('invalid')
        }
      })
      .catch(() => { /* fail quiet — default 7-day display */ })
      .finally(() => clearTimeout(timer))
    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [promoCode])

  const trial = getTrialDisplay(promoCode, promoStatus, promoDays)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f1a',
      color: '#ffffff',
      fontFamily: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '2rem 1.5rem 2.5rem',
      position: 'relative',
      overflow: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Atmospheric gradient, matching app/page.tsx brand look */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 15%, rgba(249,115,22,0.10) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 20% 85%, rgba(30,40,80,0.4) 0%, transparent 60%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '480px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>

        {/* Logo (brand mark — the only non-white accent besides the CTA) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.75rem' }}>
          <Image src="/images/et-logo.png" alt="" width={36} height={36} style={{ objectFit: 'contain' }} priority />
          <span style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#ffffff' }}>Endless </span>
            <span style={{ color: '#f97316' }}>Tales</span>
          </span>
        </div>

        {/* COPY: placeholder structure — Susan owns final copy (SUS/ATL-LANDING-001) */}
        <h1 style={{
          fontSize: 'clamp(1.9rem, 8vw, 2.75rem)',
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          color: '#ffffff',
          margin: '0 0 0.9rem',
        }}>
          Turn Your Daily Commute Into Story Time
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 4vw, 1.15rem)',
          lineHeight: 1.55,
          color: '#ffffff',
          margin: '0 0 1.4rem',
          maxWidth: '420px',
        }}>
          Original audio series made for the drive. New episodes every week.
        </p>

        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 1.6rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
          fontSize: '0.98rem',
          lineHeight: 1.4,
          color: '#ffffff',
          fontWeight: 500,
        }}>
          <li>✓ Original series you can&apos;t hear anywhere else</li>
          <li>✓ Episodes sized to fit your drive</li>
          <li>✓ Hands-free. Eyes on the road.</li>
        </ul>

        {/* Promo applied badge (only after server-truth validation) */}
        {trial.appliedBadge && (
          <div style={{ color: '#ffffff', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            {trial.appliedBadge}
          </div>
        )}

        {/* THE one CTA */}
        <Link
          href={ctaHref}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '380px',
            padding: '1.05rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: '#f97316',
            color: '#ffffff',
            fontSize: '1.1rem',
            fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 8px 30px rgba(249,115,22,0.35)',
          }}
        >
          {trial.ctaLabel} →
        </Link>

        {/* Trust line */}
        <p style={{ fontSize: '0.85rem', color: '#ffffff', marginTop: '0.9rem', maxWidth: '360px', lineHeight: 1.5 }}>
          {trial.subtext}
        </p>

        {/* Legal — small, bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '2.5rem', fontSize: '0.75rem', color: '#ffffff' }}>
          <Link href="/terms" style={{ color: '#ffffff', textDecoration: 'underline' }}>Terms</Link>
          <span style={{ margin: '0 0.6rem' }}>·</span>
          <Link href="/privacy" style={{ color: '#ffffff', textDecoration: 'underline' }}>Privacy</Link>
        </div>
      </div>
    </div>
  )
}

export default function GoLandingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoLandingContent />
    </Suspense>
  )
}
