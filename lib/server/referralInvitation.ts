import type { SupabaseClient, User } from '@supabase/supabase-js'
import { referralTrialEnd } from '@/lib/referralInvitation'

/** Called only after verifying the recipient's email token. Never extends a prior trial. */
export async function acceptReferralInvitation(admin: SupabaseClient, user: User, code: string) {
  if (!referralTrialEnd(user.created_at) || !user.email_confirmed_at) throw new Error('This free trial is for new, verified accounts. Please sign in to your existing account.')
  const name = String(user.user_metadata?.first_name || '').trim().slice(0, 100)
  const { error: profileError } = await admin.from('users').upsert({ id: user.id, email: user.email, first_name: name, display_name: name }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) throw new Error('Could not prepare your account. Please try again.')
  const { data: prior, error: priorError } = await admin.from('referrals').select('id,referrer_id,created_at').eq('referred_id', user.id).maybeSingle()
  if (priorError) throw priorError
  if (!prior) {
    const { data, error } = await admin.rpc('process_referral', { p_referrer_code: code, p_referred_user_id: user.id })
    if (error && error.code !== '23505') throw error
    if (!error && !data?.success && !/already referred/i.test(data?.error || '')) throw new Error(data?.error || 'Could not record your invitation.')
  }
  const { data: recorded, error: recordError } = await admin.from('referrals').select('created_at').eq('referred_id', user.id).single()
  if (recordError || !recorded) throw new Error('Could not confirm your invitation record. Please try again.')
  const trialEnd = new Date(Date.parse(recorded.created_at) + 14 * 86400000).toISOString()
  // The unique referred_id preserves attribution; signup is not a paid reward.
  const { error: statusError } = await admin.from('referrals').update({ status: 'signed_up', opened_at: recorded.created_at }).eq('referred_id', user.id).eq('status', 'completed').eq('referrer_credited', false).eq('referred_credited', false)
  if (statusError) throw statusError
  // Conditional update and fixed expiry make simultaneous/repeated accepts safe.
  const { error } = await admin.from('users').update({ plan: 'standard', subscription_type: 'active', subscription_ends_at: trialEnd, signup_source: 'referral-invitation' })
    .eq('id', user.id).is('subscription_ends_at', null).is('stripe_subscription_id', null).in('subscription_type', ['none', 'free'])
  if (error) throw error
  return trialEnd
}
