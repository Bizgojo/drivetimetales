import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`

export async function POST(req: NextRequest) {
  try {
    const { localStoryId, uuidStoryId } = await req.json()
    const storyBodyUrl = `${BASE}/asc3/${localStoryId}/story_body.mp3`
    const finalMixUrl = `${BASE}/asc3/${localStoryId}/final_mix.mp3`
    const { error } = await supabase.from('stories').update({
      audio_url: finalMixUrl,
      story_audio_url: storyBodyUrl,
      is_hidden: false
    }).eq('id', uuidStoryId)
    if (error) throw error
    return NextResponse.json({ success: true, audio_url: finalMixUrl, story_audio_url: storyBodyUrl })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
