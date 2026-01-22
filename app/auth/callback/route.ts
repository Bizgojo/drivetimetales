import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Admin client for creating user profiles
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const next = requestUrl.searchParams.get('next');

  const supabase = createRouteHandlerClient({ cookies });

  if (code) {
    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin));
      }

      // PASSWORD RECOVERY: redirect to reset-password page
      if (type === 'recovery' || next === '/reset-password') {
        return NextResponse.redirect(new URL('/reset-password', requestUrl.origin));
      }

      // OAUTH: Check if new user needs profile created
      if (data.user) {
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', data.user.id)
          .single();

        if (!existingUser) {
          // Create user profile for OAuth user with 3 free credits
          await supabaseAdmin.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0],
            credits: 3,
            subscription_type: null,
            created_at: new Date().toISOString()
          });
          console.log('Created user profile for OAuth user:', data.user.id);
        }
      }

      // Redirect to home after successful OAuth
      return NextResponse.redirect(new URL('/home', requestUrl.origin));

    } catch (err) {
      console.error('Callback error:', err);
      return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin));
    }
  }

  // No code, redirect to signin
  return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin));
}
