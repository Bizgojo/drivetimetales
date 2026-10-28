import { NextRequest } from 'next/server'
import { POST as start } from '@/app/api/referral/start/route'
import { POST as accept } from '@/app/api/referral/accept/route'
import { GET as records } from '@/app/api/admin/referral-records/route'
import { acceptReferralInvitation } from '@/lib/server/referralInvitation'

let allowed = true
let duplicate = false
let mismatch = false
const rows = [{ id: 'ref1', status: 'signed_up', friend: { first_name: 'Jo', email: 'jo@example.com' } }]
jest.mock('@/lib/server/accountUser', () => ({ accountAdmin: () => ({
  from: () => { const chain: any = { select: () => chain, ilike: () => chain, order: () => chain, limit: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: { id: 'referrer' }, error: null }) }; return chain },
  auth: { admin: { createUser: jest.fn(async () => duplicate ? { data: { user: null }, error: { code: 'email_exists' } } : { data: { user: { id: 'friend', email: 'jo@example.com', created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() } }, error: null }), generateLink: jest.fn(async () => ({ data: { user: { id: mismatch ? 'other-account' : 'friend' }, properties: { hashed_token: 'private-verification-token-123' } }, error: null })) } },
}) }))
jest.mock('@/lib/server/feedbackAdmin', () => ({ feedbackAdmin: async () => allowed ? { id: 'admin' } : null }))
jest.mock('@/lib/server/referralInvitation', () => ({ acceptReferralInvitation: jest.fn(async () => '2026-11-11') }))
jest.mock('@supabase/ssr', () => ({ createServerClient: (_a: any, _b: any, options: any) => ({ auth: { verifyOtp: async () => {
  options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'verified-session', options: {} }])
  return { data: { user: { id: 'friend', email: 'jo@example.com', email_confirmed_at: '2026-10-28' }, session: { access_token: 'verified' } }, error: null }
} } }) }))
function jsonRequest(email: string, ip: string) {
  return new NextRequest('http://localhost:3000/api/referral/start', { method: 'POST', headers: { origin: 'https://app.endless-tales.com', 'x-forwarded-host': 'app.endless-tales.com', 'x-forwarded-proto': 'https', 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'MARC12', firstName: 'Jo', email }) })
}
beforeEach(() => { allowed = true; duplicate = false; mismatch = false; jest.clearAllMocks() })
it('creates a new account and opens a cookie session without email or returning a token', async () => {
  const response = await start(jsonRequest('jo@example.com', 'one'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, redirectTo: '/home' })
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('verified-session')
  expect(acceptReferralInvitation).toHaveBeenCalled()
})
it('existing email cannot open another account or receive a new trial', async () => {
  duplicate = true
  const response = await start(jsonRequest('existing@example.com', 'two'))
  expect(response.status).toBe(409)
  expect((await response.json()).signIn).toBe(true)
  expect(response.cookies.getAll()).toHaveLength(0)
  expect(acceptReferralInvitation).not.toHaveBeenCalled()
})
it('refuses a generated token for a different identity', async () => {
  mismatch = true
  const response = await start(jsonRequest('new@example.com', 'three'))
  expect(response.status).toBe(503)
  expect(response.cookies.getAll()).toHaveLength(0)
})
it('accepts only a verified POST, writes session cookies and redirects to Home', async () => {
  const body = new FormData(); body.set('code', 'MARC12'); body.set('token_hash', 'private-verification-token-123')
  const response = await accept(new NextRequest('https://app.endless-tales.com/api/referral/accept', { method: 'POST', headers: { origin: 'https://app.endless-tales.com' }, body }))
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe('https://app.endless-tales.com/home')
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('verified-session')
  expect(acceptReferralInvitation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email_confirmed_at: '2026-10-28' }), 'MARC12')
})
it('returns recorded referrals to Admin and blocks other users', async () => {
  expect((await records()).status).toBe(200)
  expect(await (await records()).json()).toEqual({ records: rows })
  allowed = false
  expect((await records()).status).toBe(403)
})
it('rejects a different website before sending or activating anything', async () => {
  const request = new NextRequest('https://app.endless-tales.com/api/referral/accept', { method: 'POST', headers: { origin: 'https://other.example' } })
  expect((await accept(request)).status).toBe(403)
  expect(acceptReferralInvitation).not.toHaveBeenCalled()
})
