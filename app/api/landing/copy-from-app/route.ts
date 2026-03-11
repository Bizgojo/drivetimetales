/**
 * POST /api/landing/copy-from-app
 * Copies a story from the App Library into the landing_stories table.
 * The copy shares the original's audio segments but gets its own
 * intro/outro text (pre-filled with landing-page CTA defaults).
 *
 * Body: { storyId: string, landingPage?: string }
 * Returns: { success, landingStoryId, introText, outroText }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { storyId, landingPage = 'main' } = await req.json()
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    // Fetch the source story from App Library
    const { data: story, error: fetchErr } = await supabase
      .from('stories')
      .select('id, title, author, genre, duration_mins, cover_url, audio_url, story_audio_url, intro_text, outro_text, intro_audio_url, outro_audio_url')
      .eq('id', storyId)
      .single()

    if (fetchErr || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

    // Build default landing page intro (same as app intro to start — user will customise)
    const introText = story.intro_text ||
      `Welcome to Endless Tales.\n\nToday's story: "${story.title}" by ${story.author}.\n\nLet's begin.`

    // Default landing page outro with CTA
    const outroText = story.outro_text ||
      `That was "${story.title}" by ${story.author} on Endless Tales.\n\nIf you enjoyed this story, your fourteen-day free trial is waiting above. No credit card, no catch. Just great stories.`

    // Check if already copied (avoid duplicates)
    const { data: existing } = await supabase
      .from('landing_stories')
      .select('id')
      .eq('story_id', storyId)
      .eq('active', false)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, landingStoryId: existing.id, introText, outroText, alreadyExists: true })
    }

    // Create landing_stories record (starts in library: active=false, slot=null)
    const { data: inserted, error: insertErr } = await supabase
      .from('landing_stories')
      .insert({
        story_id: storyId,
        title: story.title,
        author: story.author,
        genre: story.genre,
        duration_mins: story.duration_mins,
        cover_url: story.cover_url,
        audio_url: story.audio_url,         // will be replaced after re-render
        intro_text: introText,
        outro_text: outroText,
        intro_audio_url: story.intro_audio_url || null,
        outro_audio_url: story.outro_audio_url || null,
        active: false,
        slot: null,
      })
      .select('id')
      .single()

    if (insertErr) throw new Error(`Insert error: ${insertErr.message}`)

    return NextResponse.json({
      success: true,
      landingStoryId: inserted.id,
      introText,
      outroText,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('copy-from-app error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
