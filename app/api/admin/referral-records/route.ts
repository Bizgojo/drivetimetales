import { NextResponse } from 'next/server'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import { accountAdmin } from '@/lib/server/accountUser'
export const dynamic = 'force-dynamic'
export async function GET() {
  if (!await feedbackAdmin()) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const { data, error } = await accountAdmin().from('referrals').select('id,status,created_at,referrer_credited,referred_credited,referrer:users!referrals_referrer_id_fkey(first_name,email),friend:users!referrals_referred_id_fkey(first_name,email,subscription_ends_at,signup_source)').order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Could not load referral records.' }, { status: 503 })
  return NextResponse.json({ records: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}
