import { createBrowserClient } from '@supabase/ssr'

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 365,
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
