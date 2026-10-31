import 'server-only'
import { NextResponse } from 'next/server'
import { feedbackAdmin } from '@/lib/server/feedbackAdmin'
import { hasValidRequestOrigin } from '@/lib/requestOrigin'

// Always validate identity with Auth, never session contents or editable user metadata.
export async function adminAccess(request?: Request) {
  try {
    if (request && !['GET','HEAD'].includes(request.method) && !hasValidRequestOrigin(request))
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    if (!await feedbackAdmin()) return NextResponse.json({ error: 'Administrator sign-in required' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Authorization unavailable; access denied' }, { status: 503 })
  }
}
