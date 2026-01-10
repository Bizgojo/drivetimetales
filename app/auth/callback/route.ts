import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/home'
  const error = requestUrl.searchParams.get('error')

  // If there's an error, redirect to signin
  if (error) {
    return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
  }

  // If there's a code, exchange it for a session
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
      
      if (data.user) {
        // Use service role for database operations
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        // Check if user profile exists
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', data.user.id)
          .single()
        
        if (!existingUser) {
          // Create user profile for OAuth user
          await supabaseAdmin.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
            credits: 3, // Give new OAuth users 3 free credits
            subscription_type: null,
            created_at: new Date().toISOString()
          })
        }
      }
      
      // Redirect to home after successful OAuth
      return NextResponse.redirect(new URL('/home', requestUrl.origin))
    } catch (err) {
      console.error('Callback error:', err)
      return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
    }
  }

  // No code, redirect to signin
  return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
}
