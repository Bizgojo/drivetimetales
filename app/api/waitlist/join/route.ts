import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, source, medium, campaign, referrer } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400, headers: CORS })
    }

    const { error } = await supabase.from('waitlist').insert({
      email: email.toLowerCase().trim(),
      source: source || 'direct',
      medium: medium || null,
      campaign: campaign || null,
      referrer: referrer || null,
      locked_price: 7.99,
    })

    if (error?.code === '23505') {
      return NextResponse.json({ already: true }, { headers: CORS })
    }

    if (error) {
      console.error('Waitlist insert error:', error)
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500, headers: CORS })
    }

    // Fire confirmation email (non-blocking)
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://drivetimetales.vercel.app'}/api/waitlist/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {})

    return NextResponse.json({ success: true }, { headers: CORS })
  } catch (err: any) {
    console.error('Waitlist join error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500, headers: CORS })
  }
}
