/**
 * supabase-browser.ts
 * 
 * Cookie-aware Supabase client for use in browser/client components ONLY.
 * Uses @supabase/ssr's createBrowserClient so that auth sessions are stored
 * in cookies — which the middleware can then read server-side.
 * 
 * ⚠️  DO NOT import this in API routes or server components.
 *     Use lib/supabase.ts for server-side usage.
 */
import { createBrowserClient } from '@supabase/ssr'

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
