import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { storyId, destinations } = body

    // Update story status to published
    const { error } = await supabase
      .from('stories')
      .update({
        status: 'published',
        publishing_destinations: destinations,
      })
      .eq('id', storyId)

    if (error) {
      console.error('Publish error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
