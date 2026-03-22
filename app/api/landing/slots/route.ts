import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get active slots (slot 1-3)
    const { data: slots, error: slotsErr } = await supabase
      .from('landing_stories')
      .select('*')
      .eq('active', true)
      .order('slot', { ascending: true })

    if (slotsErr) throw slotsErr

    // Get library (inactive stories) — order by id desc as fallback (added_at may not exist)
    const { data: library, error: libErr } = await supabase
      .from('landing_stories')
      .select('*')
      .eq('active', false)
      .order('id', { ascending: false })

    if (libErr) throw libErr

    return NextResponse.json({ success: true, slots: slots || [], library: library || [] }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
