import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      id,
      title,
      introText,
      outroText,
      status,
    } = body

    // Update story in Supabase
    const { error } = await supabase
      .from('stories')
      .update({
        ...(title && { title }),
        ...(introText && { intro_text: introText }),
        ...(outroText && { outro_text: outroText }),
        ...(status && { status }),
      })
      .eq('id', id)

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
