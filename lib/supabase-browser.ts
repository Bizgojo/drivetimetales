/**
 * supabase-browser.ts
 *
 * Cookie-aware Supabase client for browser/client components ONLY.
 * Uses @supabase/ssr createBrowserClient so sessions are stored in cookies
 * that middleware can read server-side.
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
      sameSite: 'lax',
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
