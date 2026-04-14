import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { storyId } = await req.json()
  const { data: files } = await supabase.storage.from('audio').list('asc3/' + storyId, { limit: 500 })
  if (!files) return NextResponse.json({ error: 'No files' })
  const segments = files.filter(f => f.name.startsWith('segment_')).sort((a,b) => a.name.localeCompare(b.name))
  const intro = files.find(f => f.name.startsWith('intro_'))
  const outro = files.find(f => f.name.startsWith('outro_'))
  const music = files.find(f => f.name === 'background_music.mp3')
  return NextResponse.json({
    total: files.length,
    segments: segments.length,
    segmentNames: segments.map(f => f.name),
    hasIntro: !!intro,
    hasOutro: !!outro,
    hasMusic: !!music,
  })
}
