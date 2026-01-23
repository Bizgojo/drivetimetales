import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next')

  if (error) {
    return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
  }

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    try {
      const { data, error: authError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (authError) {
        console.error('Auth error:', authError)
        return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
      }

      if (type === 'recovery' || next === '/reset-password') {
        return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
      }
      
      if (data.user) {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', data.user.id)
          .single()

        if (!existingUser) {
          await supabaseAdmin.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
            credits: 2,
            plan: 'free'
          })
        }
      }
      
      return NextResponse.redirect(new URL('/home', requestUrl.origin))
    } catch (err) {
      console.error('Callback error:', err)
      return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
}
