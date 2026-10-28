import { normalizeReferralCode } from './referral'
export function referralInvitationPath(code: string) {
  return `/invite?ref=${encodeURIComponent(normalizeReferralCode(code) || '')}`
}
export function referralTrialEnd(createdAt: string, now = Date.now()): string | null {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created) || created > now || now - created > 7 * 86400000) return null
  return new Date(created + 14 * 86400000).toISOString()
}
export function smsInvitationHref(text: string, iphone: boolean) {
  return `sms:${iphone ? '&' : '?'}body=${encodeURIComponent(text)}`
}

/** Preserve remaining referral access; never start a second trial at checkout. */
export function referralCheckoutTrial(end: string | null | undefined, now = Date.now()): { trial_end?: number } {
  const seconds = end ? Math.floor(Date.parse(end) / 1000) : 0
  return Number.isFinite(seconds) && seconds > Math.floor(now / 1000) + 48 * 3600 ? { trial_end: seconds } : {}
}
