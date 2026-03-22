import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (error || !user?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://drivetimetales.vercel.app'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/account/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error('Error creating portal session:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Keep GET for backward compatibility (redirects to login if no userId)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }
  // Redirect through a POST-equivalent by forwarding to POST handler logic
  try {
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!user?.stripe_customer_id) {
      return NextResponse.redirect(new URL('/account/billing?error=no_customer', request.url))
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://drivetimetales.vercel.app'
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/account/billing`,
    })

    return NextResponse.redirect(portalSession.url)
  } catch (error) {
    return NextResponse.redirect(new URL('/account/billing?error=portal_failed', request.url))
  }
}
