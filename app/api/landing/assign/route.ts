import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: assign a library story to a slot
// Body: { libraryId: string, slot: 1 | 2 | 3 }
// If the slot is occupied, the existing story is moved to the library.
export async function POST(req: NextRequest) {
  try {
    const { libraryId, slot } = await req.json()

    if (!libraryId || ![1, 2, 3].includes(slot)) {
      return NextResponse.json({ success: false, error: 'libraryId and slot (1-3) required' }, { status: 400 })
    }

    // Find any story currently occupying this slot
    const { data: existing } = await supabase
      .from('landing_stories')
      .select('id')
      .eq('active', true)
      .eq('slot', slot)
      .single()

    // If slot is occupied, bump it to the library
    if (existing) {
      const { error: bumpErr } = await supabase
        .from('landing_stories')
        .update({ active: false, slot: null, sort_order: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (bumpErr) throw bumpErr
    }

    // Activate the library story into this slot
    const { error: assignErr } = await supabase
      .from('landing_stories')
      .update({
        active: true,
        slot,
        sort_order: slot,
        updated_at: new Date().toISOString()
      })
      .eq('id', libraryId)

    if (assignErr) throw assignErr

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
