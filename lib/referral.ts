// lib/referral.ts
// REFERRAL-SIGNUP-001 (2026-09-19): "help a friend" referral capture + claim.
//
// ROOT CAUSE this fixes: invite links (/welcome?ref=CODE, /signup?ref=CODE)
// never delivered the code to the backend. /welcome bounced to /guest and
// dropped the query string; Google/magic-link signups go through
// /api/auth/* → provider → /auth/callback, which never carried ?ref; and the
// only code that tried to record a referral (app/signup) wrote to the
// `referrals` table directly through the anon data client — blocked by RLS /
// NOT NULL referred_id, so it silently failed. process_referral() was never
// called anywhere. Result: 0 referrals in ~8 months.
//
// FIX: capture ?ref= on ANY page load (ReferralCapture in the root layout)
// into localStorage + a first-party cookie, so it survives OAuth/magic-link
// round-trips and client redirects. Once the visitor is signed in, POST it to
// /api/referral/claim, which calls process_referral() server-side for the
// authenticated user. The stored code is cleared once the server gives a
// final answer (success, or a permanent rejection).

export const REFERRAL_STORAGE_KEY = 'et_ref'
export const REFERRAL_COOKIE = 'et_ref'
const REFERRAL_TTL_DAYS = 30

// Codes are generated uppercase alphanumeric (generate_referral_code()), and
// process_referral() compares against UPPER(input). Normalize the same way
// and reject anything that can't be a code (junk / injection-shaped values).
export function normalizeReferralCode(code: string | null | undefined): string | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.length < 3 || normalized.length > 20) return null
  return normalized
}

interface StoredReferral {
  code: string
  captured_at: number
}

function writeCookie(value: string, maxAgeSeconds: number) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
}

function readCookie(): string | null {
  const match = document.cookie.split('; ').find(c => c.startsWith(`${REFERRAL_COOKIE}=`))
  if (!match) return null
  try { return decodeURIComponent(match.slice(REFERRAL_COOKIE.length + 1)) } catch { return null }
}

// Called on every page load. Last-touch: a new ?ref= in the URL overwrites
// any earlier stored code; a page load without ?ref= is a no-op.
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'))
    if (!code) return
    const stored: StoredReferral = { code, captured_at: Date.now() }
    try { localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(stored)) } catch {}
    writeCookie(code, REFERRAL_TTL_DAYS * 24 * 60 * 60)
  } catch (err) {
    console.warn('[referral] capture failed:', err)
  }
}

// localStorage first, cookie as backup (localStorage can be unavailable in
// private mode / blocked storage). Expired entries are ignored.
export function readStoredReferral(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(REFERRAL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredReferral>
      const fresh = typeof parsed.captured_at === 'number' &&
        Date.now() - parsed.captured_at < REFERRAL_TTL_DAYS * 24 * 60 * 60 * 1000
      const code = normalizeReferralCode(parsed.code)
      if (fresh && code) return code
    }
  } catch {}
  try { return normalizeReferralCode(readCookie()) } catch { return null }
}

export function clearStoredReferral(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(REFERRAL_STORAGE_KEY) } catch {}
  try { writeCookie('', 0) } catch {}
}

export interface ReferralClaimResult {
  // true = server gave a final answer (success or permanent rejection):
  // stop retrying and clear the stored code.
  done: boolean
  success: boolean
  error?: string
}

let inFlight: Promise<ReferralClaimResult> | null = null

// Claims the stored referral for the signed-in user. Single-flight per tab:
// ReferralCapture (on auth change) and the signup page (before the Stripe
// handoff) may both call this at once — they share one request. The DB also
// enforces UNIQUE(referrals.referred_id), so a cross-tab race cannot double-credit.
export function claimStoredReferral(accessToken: string): Promise<ReferralClaimResult> {
  const code = readStoredReferral()
  if (!code) return Promise.resolve({ done: true, success: false, error: 'no_code' })
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch('/api/referral/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string; retry?: boolean }
      const done = res.ok || !data.retry
      if (done) clearStoredReferral()
      if (!data.success) console.warn('[referral] claim not applied:', data.error || res.status)
      return { done, success: Boolean(data.success), error: data.error }
    } catch (err) {
      console.warn('[referral] claim request failed (will retry):', err)
      return { done: false, success: false, error: 'network' }
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
