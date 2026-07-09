import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { personalizationPublishBlockers } from '@/lib/personalization/publishGuard'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function clean(value: unknown) {
  return String(value || '').trim()
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function effectiveWorkflowState(story: any): string {
  const workflowState = clean(story.workflow_state)
  if (workflowState === 'approved_ready' || workflowState === 'cold_storage' || workflowState === 'unpublished_library' || workflowState === 'repair_queue' || workflowState === 'being_repaired') return workflowState
  if (story.status === 'published' && story.is_hidden === false) return 'published'
  if (story.status === 'published' && story.is_hidden === true) return 'unpublished_library'
  if (workflowState) return workflowState
  if (story.review_status === 'approved') return 'approved_ready'
  if (story.review_status === 'not_approved') return 'cold_storage'
  return 'ready_for_review'
}

function publishMissingFields(story: any) {
  const missing: string[] = []
  if (!clean(story.title)) missing.push('title')
  if (!clean(story.author)) missing.push('author')
  if (!clean(story.genre)) missing.push('genre')
  if (!clean(story.audio_url)) missing.push('audio_url')
  if (!clean(story.cover_url)) missing.push('cover_url')
  if (!clean(story.description)) missing.push('description')
  if (!numberOrNull(story.duration_mins)) missing.push('duration_mins')
  return missing
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const storyId = String(body.storyId || '').trim()
    const seriesId = String(body.seriesId || body.series_id || '').trim()
    const queueId = String(body.queueId || '').trim()
    const title = String(body.title || '').trim()
    const author = String(body.author || '').trim()
    const genre = String(body.genre || '').trim()
    const audio_url = String(body.audio_url || '').trim()
    const cover_url = String(body.cover_url || '').trim()
    const description = String(body.description || '').trim()
    const duration_mins = Number(body.duration_mins || 0)
    const is_free = Boolean(body.is_free)

    if (seriesId) {
      const publishedOn = new Date().toISOString()
      const changedBy = clean(body.changedBy || body.changed_by) || 'admin'

      const { data: episodes, error: fetchError } = await supabase
        .from('stories')
        .select('id,title,author,genre,audio_url,cover_url,description,duration_mins,status,is_hidden,review_status,workflow_state,episode_number,series_number,announcement_url,announcement_text,script')
        .eq('series_id', seriesId)

      if (fetchError) {
        return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
      }
      if (!episodes || episodes.length === 0) {
        return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 })
      }

      const blocked = episodes.map((episode: any) => {
        const missing = publishMissingFields(episode)
        const workflowState = effectiveWorkflowState(episode)
        const reasons = [
          ...missing.map((field) => `missing ${field}`),
          ...(workflowState === 'approved_ready' ? [] : [`workflow_state is ${workflowState}, expected approved_ready`]),
          // PERS-FIX-002: publish-time personalization guard — no episode may
          // ship with a NULL announcement_url or a legacy [LISTENER_NAME] token.
          ...personalizationPublishBlockers(episode),
        ]
        return reasons.length === 0 ? null : {
          storyId: episode.id,
          title: episode.title || `Episode ${episode.episode_number || episode.series_number || '?'}`,
          episodeNumber: episode.episode_number || episode.series_number || null,
          reasons,
        }
      }).filter(Boolean)

      if (blocked.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Series publish aborted; one or more episodes are not publishable.',
          seriesId,
          blocked,
        }, { status: 400 })
      }

      const payload = {
        status: 'published',
        workflow_state: 'published',
        is_hidden: false,
        published_on: publishedOn,
        workflow_state_changed_by: changedBy,
        workflow_state_changed_at: publishedOn,
        workflow_state_change_reason: clean(body.reason || body.change_reason) || 'Published series to app',
      }

      const { data, error } = await supabase
        .from('stories')
        .update(payload)
        .eq('series_id', seriesId)
        .select('id,title,status,is_hidden,published_on,workflow_state')

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      const updatedCount = data?.length || 0
      if (updatedCount !== episodes.length) {
        return NextResponse.json({
          success: false,
          error: `Series publish count mismatch: updated ${updatedCount} of ${episodes.length} episodes`,
          seriesId,
          updatedCount,
          expectedCount: episodes.length,
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        seriesId,
        updatedCount,
        publishedOn,
        stories: data || [],
      })
    }

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    }

    const { data: existingStory, error: existingError } = await supabase
      .from('stories')
      .select('id, title, author, genre, audio_url, cover_url, description, duration_mins, announcement_url, announcement_text, script')
      .eq('id', storyId)
      .single()

    if (existingError || !existingStory) {
      return NextResponse.json(
        { success: false, error: existingError?.message || `Story not found: ${storyId}` },
        { status: existingError?.code === 'PGRST116' ? 404 : 500 }
      )
    }

    const effectiveTitle = title || String(existingStory.title || '').trim()
    const effectiveAuthor = author || String(existingStory.author || '').trim()
    const effectiveGenre = genre || String(existingStory.genre || '').trim()
    const effectiveAudioUrl = audio_url || String(existingStory.audio_url || '').trim()
    const effectiveCoverUrl = cover_url || String(existingStory.cover_url || '').trim()
    const effectiveDescription = description || String(existingStory.description || '').trim()
    const effectiveDurationMins = duration_mins || Number(existingStory.duration_mins || 0)

    const missing: string[] = []
    if (!effectiveTitle) missing.push('title')
    if (!effectiveAuthor) missing.push('author')
    if (!effectiveGenre) missing.push('genre')
    if (!effectiveAudioUrl) missing.push('audio_url')
    if (!effectiveCoverUrl) missing.push('cover_url')
    if (!effectiveDescription) missing.push('description')
    if (!effectiveDurationMins) missing.push('duration_mins')

    if (missing.length) {
      return NextResponse.json(
        { success: false, error: `Missing required publish field(s): ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // PERS-FIX-002: publish-time personalization guard. "Weight of the Water"
    // shipped with a legacy [LISTENER_NAME] intro and announcement_url = NULL,
    // which hard-disabled personalized playback (PERS-DIAG-001). Blocking.
    const personalizationBlockers = personalizationPublishBlockers(existingStory as any)
    if (personalizationBlockers.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Personalization publish guard: ${personalizationBlockers.join('; ')}`,
          personalizationBlockers,
        },
        { status: 400 }
      )
    }

    const payload: Record<string, any> = {
      title: effectiveTitle,
      author: effectiveAuthor,
      genre: effectiveGenre,
      audio_url: effectiveAudioUrl,
      cover_url: effectiveCoverUrl,
      description: effectiveDescription,
      duration_mins: effectiveDurationMins,
      is_free,
      status: 'published',
      workflow_state: 'published',
      is_hidden: false,
      published_on: new Date().toISOString(),
      workflow_state_changed_by: clean(body.changedBy || body.changed_by) || 'admin',
      workflow_state_changed_at: new Date().toISOString(),
      workflow_state_change_reason: clean(body.reason || body.change_reason) || 'Published story to app',
    }

    const { data, error } = await supabase
      .from('stories')
      .update(payload)
      .eq('id', storyId)
      .select('id, title, author, genre, audio_url, cover_url, description, duration_mins, is_free, status, is_hidden, published_on')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (queueId) {
      const { error: queueError } = await supabase
        .from('story_queue_items')
        .update({
          story_id: storyId,
          status: 'published',
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId)

      if (queueError) {
        return NextResponse.json(
          { success: false, error: `Story published, but failed to update queue item: ${queueError.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      story: data,
      queueId: queueId || null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to publish story' },
      { status: 500 }
    )
  }
}
