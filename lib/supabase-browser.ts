/**
 * supabase-browser.ts — Cookie-aware Supabase client for client components
 *
 * ⚠️  DO NOT CHANGE sameSite TO 'lax' — THIS WILL BREAK iOS PWA LOGIN ⚠️
 *
 * iOS PWA runs in an isolated cookie container separate from Safari.
 * sameSite:'none' + secure:true is the ONLY config that allows session cookies
 * to persist across the PWA/Safari boundary. Confirmed April 12 2026.
 *
 * DO NOT import in API routes or server components.
 */
import { createBrowserClient } from '@supabase/ssr'

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 365,
      // ⚠️  sameSite:'none' REQUIRED for iOS PWA — do not change to 'lax'
      sameSite: 'none',
      secure: true,
      path: '/',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  }
)
