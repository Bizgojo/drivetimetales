import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { storyId, destinations } = body

    // Update story: published + visible in library
    const { error, data } = await supabase
      .from('stories')
      .update({ status: 'published', is_hidden: false, published_on: new Date().toISOString() })
      .eq('id', storyId)
      .select('id, title')

    if (error) {
      console.error('Publish error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: `Story not found: ${storyId}` }, { status: 404 })
    }

    console.log(`✅ Published: "${data[0].title}" (${storyId})`)
    return NextResponse.json({ success: true, title: data[0].title })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
