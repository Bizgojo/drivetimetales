import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBelleBVoiceId } from '@/lib/voiceConstants'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { narrator_id, elevenlabs_voice_id } = await req.json()

    if (!narrator_id || !elevenlabs_voice_id) {
      return NextResponse.json({ success: false, error: 'narrator_id and elevenlabs_voice_id are required' }, { status: 400 })
    }

    if (isBelleBVoiceId(elevenlabs_voice_id)) {
      return NextResponse.json({ success: false, error: 'Belle B is reserved for announcer use only' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('narrator_voices')
      .select('id,elevenlabs_voice_id')
      .eq('id', narrator_id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ success: false, error: existingError?.message || 'Narrator not found' }, { status: 404 })
    }

    if (isBelleBVoiceId(existing.elevenlabs_voice_id)) {
      return NextResponse.json({ success: false, error: 'Belle B narrator row is locked' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('narrator_voices')
      .update({ elevenlabs_voice_id })
      .eq('id', narrator_id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, narrator: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin/narrator-voices/update] Error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
