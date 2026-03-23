import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('subscription_status', ['active', 'trialing', 'cancelling'])

    if (error) throw error

    const total = count ?? 0
    const price = total < 500 ? 2.99 : 7.99
    const spotsLeft = Math.max(0, 500 - total)
    const foundingAvailable = total < 500

    return NextResponse.json({ count: total, price, spotsLeft, foundingAvailable })
  } catch (err) {
    console.error('[subscriber-count]', err)
    return NextResponse.json({ count: 0, price: 2.99, spotsLeft: 500, foundingAvailable: true })
  }
}
