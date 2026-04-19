import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://app.endless-tales.com'
}

async function callClaude(prompt: string, max_tokens = 300): Promise<string> {
  const baseUrl = getBaseUrl()
  const res = await fetch(`${baseUrl}/api/claude-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens
    })
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok || !data?.success || !data?.text) {
    throw new Error(data?.error || 'Claude generation failed')
  }

  return String(data.text).trim()
}

async function generateDescription(script: string, title: string, genre: string) {
  return callClaude(
    `Write a compelling 1-2 sentence hook for the Endless Tales app library.

Title: ${title}
Genre: ${genre}
Story script excerpt:
${script.slice(0, 2500)}

Requirements:
- intriguing
- no spoilers
- for commuters and audio drama listeners
- plain text only
- max 45 words`,
    120
  )
}

async function generateProse(script: string, title: string, author: string, genre: string) {
  return callClaude(
    `Convert this audio drama script into clean readable prose for the "Read It" feature.

Title: ${title}
Author: ${author}
Genre: ${genre}

Rules:
- remove production directions, SFX cues, music cues, and announcer framing
- keep story meaning and dialogue
- format as readable paragraphs
- plain text only
- no markdown
- do not summarize
- preserve the story

Script:
${script}`,
    4000
  )
}

async function resolveAuthorId(authorName: string): Promise<string | null> {
  if (!authorName?.trim()) return null

  const firstToken = authorName.split(' ')[0]
  const { data } = await supabase
    .from('authors')
    .select('id, name')
    .ilike('name', `%${firstToken}%`)
    .limit(5)

  const exact = data?.find(a => String(a.name).toLowerCase() === authorName.toLowerCase())
  if (exact?.id) return exact.id

  return data?.[0]?.id || null
}

async function resolveNarratorVoice(story: any): Promise<{ voiceId: string | null; voiceName: string | null }> {
  if (story.narrator_voice_id) {
    return { voiceId: story.narrator_voice_id, voiceName: story.narrator_voice_name || null }
  }

  if (story.narrator_voice_name) {
    const { data } = await supabase
      .from('narrator_voices')
      .select('elevenlabs_voice_id, name')
      .eq('name', story.narrator_voice_name)
      .single()

    return {
      voiceId: data?.elevenlabs_voice_id || null,
      voiceName: data?.name || story.narrator_voice_name
    }
  }

  return { voiceId: null, voiceName: null }
}

export async function POST(request: NextRequest) {
  try {
    const { storyId } = await request.json()

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'Missing storyId' }, { status: 400 })
    }

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 })
    }

    const steps: Record<string, { status: 'done' | 'error' | 'skipped'; message: string }> = {}
    const updates: Record<string, any> = {}

    if (!story.script?.trim()) {
      return NextResponse.json({ success: false, error: 'Story has no script to publish' }, { status: 400 })
    }

    if (!story.description?.trim()) {
      try {
        const description = await generateDescription(story.script, story.title || 'Untitled', story.genre || 'Story')
        updates.description = description
        steps.description = { status: 'done', message: description.slice(0, 80) }
      } catch (e) {
        steps.description = { status: 'error', message: String(e) }
      }
    } else {
      steps.description = { status: 'skipped', message: 'Already exists' }
    }

    if (!story.prose_text?.trim()) {
      try {
        const prose = await generateProse(
          story.script,
          story.title || 'Untitled',
          story.author || 'Unknown',
          story.genre || 'Story'
        )
        updates.prose_text = prose
        steps.prose = { status: 'done', message: `${prose.split(/\s+/).length} words` }
      } catch (e) {
        steps.prose = { status: 'error', message: String(e) }
      }
    } else {
      steps.prose = { status: 'skipped', message: 'Already exists' }
    }

    if (!story.cover_url?.trim()) {
      try {
        const baseUrl = getBaseUrl()
        const coverRes = await fetch(`${baseUrl}/api/asc3/regenerate-cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId })
        })

        const coverData = await coverRes.json().catch(() => ({}))

        if (!coverRes.ok || !coverData?.success || !coverData?.coverImageUrl) {
          throw new Error(coverData?.error || 'Cover generation failed')
        }

        updates.cover_url = coverData.coverImageUrl
        updates.cover_image_url = coverData.coverImageUrl
        steps.cover = { status: 'done', message: coverData.coverImageUrl }
      } catch (e) {
        steps.cover = { status: 'error', message: String(e) }
      }
    } else {
      steps.cover = { status: 'skipped', message: 'Already exists' }
    }

    if (!story.author_id && story.author) {
      try {
        const id = await resolveAuthorId(story.author)
        if (id) {
          updates.author_id = id
          steps.author = { status: 'done', message: story.author }
        } else {
          steps.author = { status: 'error', message: `Author not found: ${story.author}` }
        }
      } catch (e) {
        steps.author = { status: 'error', message: String(e) }
      }
    } else {
      steps.author = { status: 'skipped', message: story.author_id ? 'Already linked' : 'No author name' }
    }

    if (!story.narrator_voice_id && !story.narrator_voice_name) {
      steps.narrator = { status: 'skipped', message: 'No narrator on story' }
    } else if (!story.narrator_voice_id) {
      try {
        const n = await resolveNarratorVoice(story)
        if (n.voiceId) {
          updates.narrator_voice_id = n.voiceId
          if (n.voiceName) updates.narrator_voice_name = n.voiceName
          steps.narrator = { status: 'done', message: n.voiceName || n.voiceId }
        } else {
          steps.narrator = { status: 'error', message: `Narrator not found: ${story.narrator_voice_name}` }
        }
      } catch (e) {
        steps.narrator = { status: 'error', message: String(e) }
      }
    } else {
      steps.narrator = { status: 'skipped', message: 'Already linked' }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('stories')
        .update(updates)
        .eq('id', storyId)

      if (updateError) {
        return NextResponse.json(
          { success: false, error: `Failed to save packaging fields: ${updateError.message}`, steps, updates },
          { status: 500 }
        )
      }
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single()

    if (refreshError || !refreshed) {
      return NextResponse.json({ success: false, error: 'Failed to reload story after packaging', steps }, { status: 500 })
    }

    if (!refreshed.audio_url) {
      return NextResponse.json(
        {
          success: false,
          error: 'Story is missing audio_url. Run final audio rendering before publishing.',
          steps,
          storyId
        },
        { status: 400 }
      )
    }

    if (!refreshed.cover_url) {
      return NextResponse.json(
        {
          success: false,
          error: 'Story is missing cover_url after packaging.',
          steps,
          storyId
        },
        { status: 400 }
      )
    }

    if (!refreshed.description) {
      return NextResponse.json(
        {
          success: false,
          error: 'Story is missing description after packaging.',
          steps,
          storyId
        },
        { status: 400 }
      )
    }

    if (!refreshed.prose_text) {
      return NextResponse.json(
        {
          success: false,
          error: 'Story is missing prose_text after packaging.',
          steps,
          storyId
        },
        { status: 400 }
      )
    }

    const publishUpdate = {
      status: 'production_ready',
      is_hidden: false,
      published_on: new Date().toISOString()
    }

    const { error: publishError } = await supabase
      .from('stories')
      .update(publishUpdate)
      .eq('id', storyId)

    if (publishError) {
      return NextResponse.json(
        { success: false, error: `Failed to finalize publish: ${publishError.message}`, steps },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      storyId,
      description: refreshed.description,
      cover_url: refreshed.cover_url,
      audio_url: refreshed.audio_url,
      prose_text_ready: !!refreshed.prose_text,
      steps
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
