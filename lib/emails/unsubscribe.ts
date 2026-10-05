/**
 * lib/emails/unsubscribe.ts — REACH-REMINDERS-001 (CAN-SPAM)
 *
 * One-click unsubscribe token helper for Belle retention/marketing email.
 *
 * Design goals:
 *  - No new env var: the token is HMAC-signed with SUPABASE_SERVICE_ROLE_KEY,
 *    which is already present in every server runtime that sends these emails.
 *  - Stateless: the token carries the user id; the server verifies the HMAC
 *    and flips users.email_opt_out = true. No token table to maintain.
 *  - Tamper-proof: a user cannot unsubscribe another user without the secret.
 *  - URL-safe: base64url, no padding, safe in a querystring and mail clients.
 *
 * Token format (base64url, dot-separated):  <payloadB64>.<sigB64>
 *   payload = JSON { u: <userId>, v: 1 }
 *   sig     = HMAC-SHA256(payload, SUPABASE_SERVICE_ROLE_KEY)
 *
 * The link lives in every retention email footer and resolves to
 * GET /api/email/unsubscribe?token=... (see app/api/email/unsubscribe/route.ts).
 */
import { createHmac, timingSafeEqual } from 'crypto'

const APP_BASE_URL = 'https://app.endless-tales.com'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot sign unsubscribe token')
  return s
}

/** Mint an unsubscribe token for a user id. */
export function makeUnsubscribeToken(userId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ u: userId, v: 1 }), 'utf8'))
  const sig = b64url(createHmac('sha256', secret()).update(payload).digest())
  return `${payload}.${sig}`
}

/**
 * Verify a token and return the user id, or null if invalid/tampered.
 * Constant-time signature comparison.
 */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  let expected: Buffer
  let got: Buffer
  try {
    expected = createHmac('sha256', secret()).update(payload).digest()
    got = b64urlDecode(sig)
  } catch {
    return null
  }
  if (expected.length !== got.length) return null
  if (!timingSafeEqual(expected, got)) return null
  try {
    const data = JSON.parse(b64urlDecode(payload).toString('utf8')) as { u?: unknown; v?: unknown }
    if (typeof data.u === 'string' && data.u.length > 0) return data.u
    return null
  } catch {
    return null
  }
}

/** Full one-click unsubscribe URL for an email footer. */
export function unsubscribeUrl(userId: string): string {
  return `${APP_BASE_URL}/api/email/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(userId))}`
}
