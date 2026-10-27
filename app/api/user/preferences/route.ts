import { NextRequest, NextResponse } from 'next/server'
import { accountUser, accountAdmin } from '@/lib/server/accountUser'
import { cleanListeningPreferences } from '@/lib/listeningPreferences'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const user = await accountUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  try {
    const preferences = cleanListeningPreferences(await req.json())
    const { error } = await accountAdmin().auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, listening_preferences: preferences },
    })
    if (error) throw error
    return NextResponse.json({ preferences })
  } catch { return NextResponse.json({ error: 'Could not save your preferences. Please try again.' }, { status: 500 }) }
}
