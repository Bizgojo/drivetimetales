import { hasValidRequestOrigin } from '@/lib/requestOrigin'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { accountUser, accountAdmin } from '@/lib/server/accountUser'
export async function POST(req: NextRequest) {
  if (!hasValidRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const user = await accountUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  try {
    const admin = accountAdmin()
    const { data, error } = await admin.from('users').select('referral_code').eq('id', user.id).single()
    if (error) throw error
    let code = data.referral_code
    if (!code) {
      const candidate = randomBytes(6).toString('hex').toUpperCase()
      const { error: writeError } = await admin.from('users').update({ referral_code: candidate }).eq('id', user.id).is('referral_code', null)
      if (writeError) throw writeError
      const { data: saved, error: readError } = await admin.from('users').select('referral_code').eq('id', user.id).single()
      if (readError || !saved?.referral_code) throw readError || new Error('No referral code')
      code = saved.referral_code
    }
    return NextResponse.json({ code })
  } catch { return NextResponse.json({ error: 'Could not load your invitation. Please try again.' }, { status: 500 }) }
}
