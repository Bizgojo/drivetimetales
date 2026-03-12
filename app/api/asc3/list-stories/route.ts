import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending'

    const query = supabase.from('stories').select('*').order('created_at', { ascending: false }).limit(100)
    if (status !== 'all') query.eq('status', status)
    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const BASE_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/audio`

    // Reconstruct storySegments from Supabase Storage for each story
    const storiesWithSegments = await Promise.all((data || []).map(async (row: any) => {
      // Parse character_guide if stored as JSON string
      let characterGuide: any[] = []
      if (row.character_guide) {
        try {
          characterGuide = typeof row.character_guide === 'string'
            ? JSON.parse(row.character_guide)
            : row.character_guide
        } catch {
          characterGuide = []
        }
      }

      const storyAudioUrl = row.audio_url || row.story_audio_url || ''

      // List segment files from storage to reconstruct multi-voice segments
      // IMPORTANT: Storage folder ID may differ from DB row ID — extract from audio URL
      const audioUrlForPath = row.story_audio_url || row.intro_audio_url || row.outro_audio_url || ''
      const storageIdMatch = audioUrlForPath.match(/asc3\/([^/]+)\//)
      const storageFolderId = storageIdMatch ? storageIdMatch[1] : row.id

      let storySegments: { audioUrl: string; speaker: string; index: number }[] = []
      try {
        const listRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/list/audio`,
          {
            method: 'POST',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prefix: `asc3/${storageFolderId}/`, limit: 200, sortBy: { column: 'name', order: 'asc' } }),
          }
        )
        if (listRes.ok) {
          const files: { name: string }[] = await listRes.json()
          const segmentFiles = files
            .filter(f => f.name.match(/^segment_\d+\.mp3$/))
            .sort((a, b) => a.name.localeCompare(b.name))

          if (segmentFiles.length > 0) {
            // Try to match speakers from character_guide
            storySegments = segmentFiles.map((f, i) => {
              const speaker = characterGuide[i]?.character || `Part ${i + 1}`
              return {
                audioUrl: `${BASE_STORAGE}/asc3/${storageFolderId}/${f.name}`,
                speaker,
                index: i,
              }
            })
          }
        }
      } catch (e) {
        // Storage list failed — fall back to single URL
      }

      return {
        id: row.id,
        title: row.title,
        primaryGenre: row.primary_genre || row.genre || '',
        wordCount: row.word_count || 0,
        series: row.series_id || '',
        episode: row.episode_number?.toString() || '',
        concept: row.description || '',
        tone: row.tone || '',
        authorName: row.author || '',
        authorStyle: row.author_style || '',
        targetDestination: row.target_destination || 'App Library',
        status: row.status || 'pending',
        createdAt: row.created_at,
        generatedScript: row.script || '',
        introAudioUrl: row.intro_audio_url || `${BASE_STORAGE}/asc3/${storageFolderId}/intro.mp3`,
        storyAudioUrl,
        storyAudioUrls: storySegments.length ? storySegments.map(s => s.audioUrl) : (storyAudioUrl ? [storyAudioUrl] : []),
        storySegments,
        characterGuide,
        outroAudioUrl: row.outro_audio_url || `${BASE_STORAGE}/asc3/${storageFolderId}/outro.mp3`,
        backgroundMusicUrl: '',
        coverImageUrl: row.cover_url || row.cover_image_url || '',
        sfxMetadata: [],
        introText: row.intro_text || '',
        outroText: row.outro_text || '',
        music_volume: row.music_volume ?? 0.30,
        io_volume: row.io_volume ?? 0.18,
      }
    }))

    return NextResponse.json({ success: true, stories: storiesWithSegments })
  } catch (err) {
    console.error('list-stories error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
