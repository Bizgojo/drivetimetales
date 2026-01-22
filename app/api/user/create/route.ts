import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, email, firstName } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (existing) {
      return NextResponse.json({ success: true, message: 'User already exists' })
    }

    const { error } = await supabaseAdmin.from('users').insert({
      id: userId,
      email: email,
      first_name: firstName,
      display_name: firstName,
      credits: 0,
      subscription_status: 'none'
    })

    if (error) {
      console.error('User create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
