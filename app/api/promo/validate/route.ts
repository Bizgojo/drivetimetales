// GET /api/promo/validate?code=X — ATL-PROMO-UI-001
// Lightweight, public, read-only promo check used by the signup page to
// display the real trial length. Returns { valid, days }.
//
// Uses the EXACT same criteria as checkout (app/api/checkout/route.ts):
//   is_active && (max_uses === null || uses_count < max_uses)
// via the shared helpers in lib/promo.ts. Does NOT increment uses_count or
// mutate anything — display only. Checkout remains the enforcement point.
//
// Failure policy: any error (bad DB, missing row, exception) returns
// { valid: false, days: null } with 200 — the signup page must never break
// or show an error because validation is down.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePromoCode } from '@/lib/utm'
import { evaluatePromo } from '@/lib/promo'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const code = normalizePromoCode(req.nextUrl.searchParams.get('code'))
    if (!code) return NextResponse.json({ valid: false, days: null })

    const { data: promo, error } = await supabase
      .from('promo_codes')
      .select('code, is_active, max_uses, uses_count, subscription_days')
      .eq('code', code)
      .single()

    if (error || !promo) return NextResponse.json({ valid: false, days: null })
    return NextResponse.json(evaluatePromo(promo))
  } catch (err) {
    console.error('[promo/validate] failed (fail-quiet):', err)
    return NextResponse.json({ valid: false, days: null })
  }
}
