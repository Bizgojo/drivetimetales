import { createHash } from 'crypto'
import { grantReferralSubscriptionDays } from '@/lib/referralSubscriptionDays'
function setup(options: { failSave?: boolean; cancel?: boolean } = {}) {
  const sub: any = { id: 'sub1', status: 'active', current_period_end: 2000000000, metadata: {}, cancel_at_period_end: !!options.cancel }
  let update: any
  const save = jest.fn(async () => ({ error: options.failSave ? new Error('write failed') : null }))
  const db: any = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { stripe_subscription_id: 'sub1' } }) }) }), update: (value: any) => { update = value; return { eq: save } } }) }
  const stripe: any = { subscriptions: { retrieve: jest.fn(async () => sub), update: jest.fn(async (_: any, patch: any) => { Object.assign(sub, patch); return sub }) } }
  return { sub, db, stripe, getUpdate: () => update }
}
it('extends the actual billing date by 14 days and preserves cancellation', async () => {
  const x = setup({ cancel: true })
  await grantReferralSubscriptionDays(x.db, x.stripe, 'user1', 14, 'reward1')
  const patch = x.stripe.subscriptions.update.mock.calls[0][1]
  expect(patch.trial_end).toBe(2000000000 + 14 * 86400)
  expect(patch.proration_behavior).toBe('none')
  expect(patch.cancel_at).toBe(patch.trial_end)
  expect(x.getUpdate().subscription_ends_at).toBe(new Date(patch.trial_end * 1000).toISOString())
})
it('does not extend twice after Stripe succeeds but local saving fails', async () => {
  const x = setup({ failSave: true })
  await expect(grantReferralSubscriptionDays(x.db, x.stripe, 'user1', 14, 'reward1')).rejects.toThrow()
  await expect(grantReferralSubscriptionDays(x.db, x.stripe, 'user1', 14, 'reward1')).rejects.toThrow()
  expect(x.stripe.subscriptions.update).toHaveBeenCalledTimes(1)
  const key = `reward_${createHash('sha256').update('reward1').digest('hex').slice(0,24)}`
  expect(x.sub.metadata[key]).toBeTruthy()
})
