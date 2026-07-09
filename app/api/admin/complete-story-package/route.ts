import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type StepStatus = 'updated' | 'skipped' | 'failed'

type PackageStep = {
  step: 'author' | 'narrator' | 'cover' | 'description' | 'prose'
  status: StepStatus
  message: string
  details?: Record<string, unknown>
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

function getOrigin(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  const host = req.headers.get('host')
  if (host) return `${proto}://${host}`
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://app.endless-tales.com'
}

function exactName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function descriptionFromScript(script: string) {
  const line = script.split('\n').find((entry) => entry.startsWith('DESCRIPTION:'))
  return line?.replace(/^DESCRIPTION:\s*/, '').trim() || ''
}

async function generateProse(script: string, title: string, author: string, genre: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const prompt = `Convert this audio drama script into clean readable prose for the "Read It" feature.

Title: ${title}
Author: ${author}
Genre: ${genre}

Rules:
- remove production directions, SFX cues, music cues, announcer framing, and meta commentary
- keep story meaning and dialogue
- format as readable paragraphs
- plain text only
- no markdown
- do not summarize
- do not introduce the output with phrases like "Here is the story" or similar
- begin immediately with the story text
- preserve the story

Script:
${script}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error?.type || `Anthropic prose generation failed: ${res.status}`)
  }

  const prose = String(data?.content?.[0]?.text || '').trim()
  if (!prose) throw new Error('Anthropic returned empty prose')

  return prose
}

async function updateStory(storyId: string, updates: Record<string, unknown>) {
  const { error } = await supabase.from('stories').update(updates).eq('id', storyId)
  if (error) throw new Error(error.message)
}

function storySummary(story: any) {
  return {
    title: story?.title || '',
    author: story?.author || '',
    genre: story?.genre || '',
    duration_mins: story?.duration_mins || null,
    created_at: story?.created_at || null,
    author_id: story?.author_id || null,
    narrator_voice_id: story?.narrator_voice_id || null,
    narrator_voice_name: story?.narrator_voice_name || null,
    cover_url_present: Boolean(story?.cover_url),
    description_present: Boolean(story?.description),
    prose_text_present: Boolean(story?.prose_text),
    audio_url_present: Boolean(story?.audio_url),
    story_audio_url_present: Boolean(story?.story_audio_url),
    status: story?.status || '',
    is_hidden: Boolean(story?.is_hidden),
  }
}

function missingReviewReadyFields(story: any) {
  const missing: string[] = []
  if (!String(story?.title || '').trim()) missing.push('title')
  if (!String(story?.author || '').trim()) missing.push('author')
  if (!String(story?.genre || '').trim()) missing.push('genre')
  if (!String(story?.description || '').trim()) missing.push('description')
  if (!Number(story?.duration_mins || 0)) missing.push('duration_mins')
  if (!String(story?.created_at || '').trim()) missing.push('created_at')
  if (!String(story?.audio_url || '').trim()) missing.push('audio_url')
  if (!String(story?.story_audio_url || '').trim()) missing.push('story_audio_url')
  if (!String(story?.cover_url || '').trim()) missing.push('cover_url')
  if (!String(story?.prose_text || '').trim()) missing.push('prose_text')
  if (!String(story?.author_id || '').trim()) missing.push('author_id')
  if (!String(story?.narrator_voice_id || '').trim()) missing.push('narrator_voice_id')
  if (!String(story?.narrator_voice_name || '').trim()) missing.push('narrator_voice_name')
  return missing
}

function blockingReason(failedSteps: PackageStep[], missingFields: string[]) {
  const reasons: string[] = []
  failedSteps.forEach(step => reasons.push(`${step.step}: ${step.message}`))
  if (missingFields.length > 0) reasons.push(`missing review-ready field(s): ${missingFields.join(', ')}`)
  return reasons.join('; ')
}

export async function POST(req: NextRequest) {
  const steps: PackageStep[] = []

  try {
    const body = await req.json().catch(() => ({}))
    const storyId = String(body.storyId || '').trim()
    const forceCover = Boolean(body.forceCover)
    const forceProse = Boolean(body.forceProse)

    if (!storyId) {
      return json({ success: false, error: 'storyId required', steps }, 400)
    }

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      return json({ success: false, error: storyError?.message || `Story not found: ${storyId}`, storyId, steps }, storyError?.code === 'PGRST116' ? 404 : 500)
    }

    if (!String(story.script || '').trim()) {
      return json({ success: false, error: 'Story script is required before package completion', storyId, steps, story: storySummary(story) }, 400)
    }

    let authorRow: any = null

    if (story.author_id) {
      steps.push({ step: 'author', status: 'skipped', message: 'Already linked' })
      const { data } = await supabase
        .from('authors')
        .select('id,name,narrator_id')
        .eq('id', story.author_id)
        .single()
      authorRow = data || null
    } else {
      const authorName = String(story.author || '').trim()
      if (!authorName) {
        steps.push({ step: 'author', status: 'failed', message: 'Story author is missing' })
      } else {
        const { data: authors, error } = await supabase
          .from('authors')
          .select('id,name,narrator_id')
          .eq('is_active', true)
          .ilike('name', authorName)

        if (error) {
          steps.push({ step: 'author', status: 'failed', message: error.message })
        } else {
          const exactMatches = (authors || []).filter((author: any) => exactName(author.name) === exactName(authorName))
          if (exactMatches.length === 1) {
            authorRow = exactMatches[0]
            await updateStory(storyId, { author_id: authorRow.id })
            story.author_id = authorRow.id
            steps.push({ step: 'author', status: 'updated', message: `Linked author ${authorRow.name}` })
          } else if (exactMatches.length > 1) {
            steps.push({ step: 'author', status: 'failed', message: `Multiple exact author matches for ${authorName}` })
          } else {
            steps.push({ step: 'author', status: 'failed', message: `Author not found: ${authorName}` })
          }
        }
      }
    }

    if (story.narrator_voice_id) {
      steps.push({ step: 'narrator', status: 'skipped', message: 'Already linked' })
    } else if (story.narrator_voice_name) {
      const narratorName = String(story.narrator_voice_name || '').trim()
      const { data: narrators, error } = await supabase
        .from('narrator_voices')
        .select('id,name,elevenlabs_voice_id')
        .ilike('name', narratorName)

      if (error) {
        steps.push({ step: 'narrator', status: 'failed', message: error.message })
      } else {
        const exactMatches = (narrators || []).filter((narrator: any) => exactName(narrator.name) === exactName(narratorName))
        if (exactMatches.length === 1 && exactMatches[0].elevenlabs_voice_id) {
          await updateStory(storyId, {
            narrator_voice_id: exactMatches[0].elevenlabs_voice_id,
            narrator_voice_name: exactMatches[0].name,
          })
          story.narrator_voice_id = exactMatches[0].elevenlabs_voice_id
          story.narrator_voice_name = exactMatches[0].name
          steps.push({ step: 'narrator', status: 'updated', message: `Linked narrator ${exactMatches[0].name}` })
        } else if (exactMatches.length > 1) {
          steps.push({ step: 'narrator', status: 'failed', message: `Multiple exact narrator matches for ${narratorName}` })
        } else {
          steps.push({ step: 'narrator', status: 'failed', message: `Narrator not found: ${narratorName}` })
        }
      }
    } else {
      const narratorRowId = authorRow?.narrator_id || null
      if (!narratorRowId) {
        steps.push({ step: 'narrator', status: 'failed', message: 'No narrator on story or author mapping' })
      } else {
        const { data: narrator, error } = await supabase
          .from('narrator_voices')
          .select('id,name,elevenlabs_voice_id')
          .eq('id', narratorRowId)
          .single()

        if (error || !narrator?.elevenlabs_voice_id) {
          steps.push({ step: 'narrator', status: 'failed', message: error?.message || `Narrator mapping not found: ${narratorRowId}` })
        } else {
          await updateStory(storyId, {
            narrator_voice_id: narrator.elevenlabs_voice_id,
            narrator_voice_name: narrator.name,
          })
          story.narrator_voice_id = narrator.elevenlabs_voice_id
          story.narrator_voice_name = narrator.name
          steps.push({ step: 'narrator', status: 'updated', message: `Linked narrator ${narrator.name}` })
        }
      }
    }

    if (story.cover_url && !forceCover) {
      steps.push({ step: 'cover', status: 'skipped', message: 'Already exists' })
    } else {
      const coverDiagnostics: Record<string, unknown> = { storyId }
      try {
        const coverEndpoint = `${getOrigin(req)}/api/asc3/regenerate-cover`
        coverDiagnostics.regenerateCoverEndpoint = coverEndpoint
        console.log('[complete-story-package] cover generation start', coverDiagnostics)

        const coverRes = await fetch(coverEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId, genre: story.genre || story.primary_genre || '' }),
        })
        const coverData = await coverRes.json().catch(() => ({}))
        coverDiagnostics.regenerateCoverStatus = coverRes.status
        coverDiagnostics.regenerateCoverOk = coverRes.ok
        coverDiagnostics.regenerateCoverSuccess = Boolean(coverData?.success)
        coverDiagnostics.returnedCoverImageUrl = coverData?.coverImageUrl || null
        coverDiagnostics.regenerateCoverError = coverData?.error || null
        console.log('[complete-story-package] cover generation response', coverDiagnostics)

        if (!coverRes.ok || !coverData?.success || !coverData?.coverImageUrl) {
          throw Object.assign(new Error(coverData?.error || 'Cover generation failed'), { details: coverDiagnostics })
        }
        const coverUrl = String(coverData.coverImageUrl || '').trim()
        const { error: coverUpdateError } = await supabase
          .from('stories')
          .update({ cover_url: coverUrl })
          .eq('id', storyId)
        coverDiagnostics.supabaseUpdateError = coverUpdateError?.message || null
        console.log('[complete-story-package] cover_url update result', coverDiagnostics)

        if (coverUpdateError) {
          throw Object.assign(new Error(`Cover URL persistence failed: ${coverUpdateError.message}`), { details: coverDiagnostics })
        }

        const { data: coverCheck, error: coverCheckError } = await supabase
          .from('stories')
          .select('cover_url')
          .eq('id', storyId)
          .single()
        coverDiagnostics.rereadError = coverCheckError?.message || null
        coverDiagnostics.rereadCoverUrl = coverCheck?.cover_url || null
        console.log('[complete-story-package] cover_url reread result', coverDiagnostics)

        if (coverCheckError) {
          throw Object.assign(new Error(`Cover URL verification failed: ${coverCheckError.message}`), { details: coverDiagnostics })
        }

        if (!String(coverCheck?.cover_url || '').trim()) {
          throw Object.assign(new Error('cover generation returned URL but cover_url was not persisted'), { details: coverDiagnostics })
        }

        story.cover_url = coverCheck.cover_url
        steps.push({ step: 'cover', status: 'updated', message: 'Generated unique cover' })
      } catch (err) {
        const details = (err && typeof err === 'object' && 'details' in err)
          ? (err as { details?: Record<string, unknown> }).details
          : coverDiagnostics
        console.error('[complete-story-package] cover step failed', details)
        steps.push({
          step: 'cover',
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
          details,
        })
      }
    }

    if (story.description) {
      steps.push({ step: 'description', status: 'skipped', message: 'Already exists' })
    } else {
      const description = descriptionFromScript(String(story.script || ''))
      if (!description) {
        steps.push({ step: 'description', status: 'failed', message: 'DESCRIPTION header not found in script' })
      } else {
        await updateStory(storyId, { description })
        story.description = description
        steps.push({ step: 'description', status: 'updated', message: description })
      }
    }

    if (story.prose_text && !forceProse) {
      steps.push({ step: 'prose', status: 'skipped', message: 'Already exists' })
    } else {
      try {
        const prose = await generateProse(
          String(story.script || ''),
          story.title || 'Untitled',
          story.author || 'Unknown',
          story.genre || 'Story'
        )
        await updateStory(storyId, { prose_text: prose })
        story.prose_text = prose
        steps.push({ step: 'prose', status: 'updated', message: `${prose.split(/\s+/).filter(Boolean).length} words` })
      } catch (err) {
        steps.push({ step: 'prose', status: 'failed', message: err instanceof Error ? err.message : String(err) })
      }
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from('stories')
      .select('title,author,genre,duration_mins,created_at,author_id,narrator_voice_id,narrator_voice_name,cover_url,description,prose_text,audio_url,story_audio_url,status,is_hidden')
      .eq('id', storyId)
      .single()

    if (refreshError || !refreshed) {
      return json({ success: false, error: refreshError?.message || 'Failed to reload story after package completion', storyId, steps }, 500)
    }

    const failedSteps = steps.filter((step) => step.status === 'failed')
    const skippedSteps = steps.filter((step) => step.status === 'skipped')
    const missingFields = missingReviewReadyFields(refreshed)
    if (failedSteps.length > 0 || missingFields.length > 0) {
      const reason = blockingReason(failedSteps, missingFields)
      return json({
        success: false,
        error: `Package incomplete. ${reason}`,
        blockingReason: reason,
        storyId,
        steps,
        failedSteps,
        skippedSteps,
        missingFields,
        story: storySummary(refreshed),
      }, 422)
    }

    await updateStory(storyId, {
      status: 'audio_ready',
      is_hidden: true,
      published_on: null,
    })

    let belleVariants: Record<string, unknown> = { success: false, skipped: true }
    try {
      const belleRes = await fetch(`${getOrigin(req)}/api/admin/generate-belle-variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const belleData = await belleRes.json().catch(() => ({}))
      belleVariants = {
        success: belleRes.ok && Boolean(belleData?.success),
        status: belleRes.status,
        count: belleData?.count || 0,
        error: belleData?.error || null,
      }
      if (!belleRes.ok || !belleData?.success) {
        console.warn('[complete-story-package] Belle variant generation failed', belleVariants)
      }
    } catch (err) {
      belleVariants = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
      console.warn('[complete-story-package] Belle variant generation threw', belleVariants)
    }

    const reviewReadyStory = {
      ...refreshed,
      status: 'audio_ready',
      is_hidden: true,
    }

    return json({
      success: true,
      storyId,
      steps,
      belleVariants,
      story: storySummary(reviewReadyStory),
    })
  } catch (err) {
    return json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to complete story package',
      steps,
    }, 500)
  }
}
