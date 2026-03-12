import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function handleUpdate(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      id,
      storyId,
      title,
      introText,
      outroText,
      status,
      music_volume,
      io_volume,
    } = body

    const storyIdentifier = id || storyId

    // Update story in Supabase
    const { error } = await supabase
      .from('stories')
      .update({
        ...(title && { title }),
        ...(introText && { intro_text: introText }),
        ...(outroText && { outro_text: outroText }),
        ...(status && { status }),
        ...(music_volume !== undefined && { music_volume }),
        ...(io_volume !== undefined && { io_volume }),
      })
      .eq('id', storyIdentifier)

    if (error) {
      console.error('Update error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) { return handleUpdate(req) }
export async function POST(req: NextRequest) { return handleUpdate(req) }
