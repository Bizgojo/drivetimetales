import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
const ADMIN_EMAILS = new Set(['marc@endless-tales.com', 'hello.endlesstales@gmail.com', 'williampostlewaite@icloud.com', 'm.postlewaite@gmail.com'])
export async function authorized() {
  const c = cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => c.getAll(), setAll: () => {} } })
  const { data: { user } } = await auth.auth.getUser()
  return user && ADMIN_EMAILS.has((user.email || '').toLowerCase()) ? user : null
}
export function client() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) }
