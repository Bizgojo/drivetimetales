import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { slug, eventType, userId, sessionId } = await req.json()
    if (!slug || !eventType) return NextResponse.json({ error: 'Missing slug or eventType' }, { status: 400 })

    // Find partner
    const { data: partner } = await supabase
      .from('partners')
      .select('id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

    // For scans — dedupe by session_id (one per device/session)
    if (eventType === 'scan' && sessionId) {
      const { data: existing } = await supabase
        .from('partner_events')
        .select('id')
        .eq('partner_id', partner.id)
        .eq('event_type', 'scan')
        .eq('session_id', sessionId)
        .single()
      if (existing) return NextResponse.json({ success: true, dedupe: true })
    }

    // Get current agreement for rate
    const { data: agreement } = await supabase
      .from('partner_agreements')
      .select('scan_rate, trial_rate, sub_rate, sub_payout_type, sub_payout_months')
      .eq('partner_id', partner.id)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()

    let amountOwed = 0
    if (agreement) {
      if (eventType === 'scan') amountOwed = Number(agreement.scan_rate)
      if (eventType === 'trial') amountOwed = Number(agreement.trial_rate)
      if (eventType === 'subscription') amountOwed = Number(agreement.sub_rate)
    }

    await supabase.from('partner_events').insert({
      partner_id: partner.id,
      event_type: eventType,
      user_id: userId || null,
      session_id: sessionId || null,
      amount_owed: amountOwed,
      sub_month: 1,
    })

    return NextResponse.json({ success: true, amountOwed })
  } catch (err) {
    console.error('[partner/track]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
