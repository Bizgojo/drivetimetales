import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const storyId = String(body.storyId || '').trim()
    const script = String(body.script || '').trim()

    if (!storyId) return bad('storyId required')
    if (!script) return bad('script required')

    const { data: existing, error: loadError } = await supabase
      .from('stories')
      .select('script_json')
      .eq('id', storyId)
      .single()

    if (loadError) return bad(loadError.message, 500)

    const existingScriptJson = existing?.script_json && typeof existing.script_json === 'object'
      ? existing.script_json
      : {}

    const { data, error } = await supabase
      .from('stories')
      .update({
        script,
        script_json: {
          ...existingScriptJson,
          raw_script: script,
        },
        status: 'script_revised',
        validator_report: null,
      })
      .eq('id', storyId)
      .select('id,title,status,script')
      .single()

    if (error) return bad(error.message, 500)

    return NextResponse.json({
      success: true,
      story: data,
    })
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
