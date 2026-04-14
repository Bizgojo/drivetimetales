import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('id, title, author, audio_url, story_audio_url, is_hidden, created_at')
      .order('created_at', { ascending: true })
    if (error) throw error

    const groups: Record<string, any[]> = {}
    for (const s of stories || []) {
      const key = s.title + '|||' + s.author
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }

    const duplicates: string[] = []
    const kept: any[] = []

    for (const [key, rows] of Object.entries(groups)) {
      if (rows.length <= 1) continue
      const withAudio = rows.filter(r => r.audio_url)
      const keeper = withAudio.length > 0 ? withAudio[withAudio.length - 1] : rows[rows.length - 1]
      kept.push({ title: keeper.title, author: keeper.author, id: keeper.id, hasAudio: !!keeper.audio_url })
      for (const r of rows) {
        if (r.id !== keeper.id) duplicates.push(r.id)
      }
    }

    if (duplicates.length > 0) {
      const { error: delError } = await supabase.from('stories').delete().in('id', duplicates)
      if (delError) throw delError
    }

    return NextResponse.json({ success: true, deleted: duplicates.length, deletedIds: duplicates, kept })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
