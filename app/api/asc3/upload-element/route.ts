import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ALLOWED_FIELDS = ['intro_audio_url','outro_audio_url','story_audio_url','background_music_url','intro_before_url','intro_after_url','guest_outro_url']
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const storyId = formData.get('storyId') as string
    const field   = formData.get('field') as string
    const file    = formData.get('file') as File
    if (!storyId || !field || !file) return NextResponse.json({ error: 'Missing storyId, field, or file' }, { status: 400 })
    if (!ALLOWED_FIELDS.includes(field)) return NextResponse.json({ error: `Invalid field: ${field}` }, { status: 400 })
    const fileName = `asc3/${storyId}/${field.replace('_url','')}_${Date.now()}.mp3`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage.from('audio').upload(fileName, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(fileName)
    const { error: dbError } = await supabase.from('stories').update({ [field]: publicUrl }).eq('id', storyId)
    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    return NextResponse.json({ success: true, url: publicUrl, field })
  } catch { return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}
