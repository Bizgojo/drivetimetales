import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Delete from users table first
    await supabaseAdmin.from('users').delete().eq('id', userId)

    // Delete the auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('[User Delete] Auth delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[User Delete] Cleaned up orphaned user:', userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[User Delete] Error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
