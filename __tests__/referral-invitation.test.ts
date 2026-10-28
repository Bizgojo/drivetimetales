import { referralInvitationPath, referralTrialEnd, smsInvitationHref, referralCheckoutTrial } from '@/lib/referralInvitation'
import { acceptReferralInvitation } from '@/lib/server/referralInvitation'
import { isEntitled } from '@/lib/entitlement'

const now = Date.parse('2026-10-28T12:00:00Z')
it('uses one recipient form for QR and sharing', () => {
  expect(referralInvitationPath('Marc12')).toBe('/invite?ref=MARC12')
})
it('keeps iPhone SMS payloads and remote links intact', () => {
  expect(smsInvitationHref('Try https://app.endless-tales.com/invite?ref=MARC12', true)).toMatch(/^sms:&body=Try%20https/)
  expect(smsInvitationHref('hello', false)).toBe('sms:?body=hello')
})
it('expires after 14 days and cannot extend the deadline on a repeat', () => {
  const end = referralTrialEnd('2026-10-28T12:00:00Z', now)!
  expect(end).toBe('2026-11-11T12:00:00.000Z')
  expect(referralTrialEnd('2026-10-28T12:00:00Z', now + 86400000)).toBe(end)
  expect(isEntitled('active', end, new Date(now))).toBe(true)
  expect(isEntitled('active', end, new Date(end))).toBe(false)
  expect(referralTrialEnd('2025-01-01', now)).toBeNull()
})
it('does not grant a second Stripe trial after the free access expires', () => {
  expect(referralCheckoutTrial('2026-10-27', now)).toEqual({})
  expect(referralCheckoutTrial('2026-11-11', now)).toEqual({ trial_end: Date.parse('2026-11-11') / 1000 })
})
function fakeAdmin(prior = false) {
  const calls: any[] = []
  const admin: any = { from: (table: string) => {
    const chain: any = {}
    for (const method of ['upsert', 'select', 'eq', 'is', 'in', 'update']) chain[method] = (...args: any[]) => { calls.push([table, method, ...args]); return chain }
    chain.single = async () => ({ data: { created_at: new Date().toISOString() }, error: null })
    chain.maybeSingle = async () => ({ data: prior ? { id: 'referral' } : null, error: null })
    chain.then = (resolve: any) => Promise.resolve({ error: null }).then(resolve)
    return chain
  }, rpc: jest.fn(async () => ({ data: { success: true }, error: null })) }
  return { admin, calls }
}
it('records the referral before granting access, without awarding paid rewards', async () => {
  const { admin, calls } = fakeAdmin()
  const user: any = { id: 'friend', email: 'friend@example.com', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), user_metadata: { first_name: 'Jo' } }
  await acceptReferralInvitation(admin, user, 'MARC12')
  expect(admin.rpc).toHaveBeenCalledWith('process_referral', { p_referrer_code: 'MARC12', p_referred_user_id: 'friend' })
  expect(calls).toContainEqual(['referrals', 'update', { status: 'signed_up' }])
  expect(calls).toContainEqual(['users', 'is', 'subscription_ends_at', null])
  expect(calls).toContainEqual(['users', 'is', 'stripe_subscription_id', null])
  expect(calls.some(c => c[1] === 'update' && c[2].referrer_credited === true)).toBe(false)
})
it('retry retains recorded attribution and rejects old/unverified recipients before writes', async () => {
  const { admin, calls } = fakeAdmin(true)
  const user: any = { id: 'friend', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), user_metadata: {} }
  await acceptReferralInvitation(admin, user, 'OTHER123')
  expect(admin.rpc).not.toHaveBeenCalled()
  calls.length = 0
  await expect(acceptReferralInvitation(admin, { ...user, email_confirmed_at: null }, 'MARC12')).rejects.toThrow('verified')
  expect(calls).toEqual([])
})
