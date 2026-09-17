/**
 * scripts/cfo-report/hal-status.ts
 * Queries Supabase for active production pipeline status.
 * Returns series with episodes currently in-flight or needing attention.
 *
 * Credentials: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

export interface EpisodeStatus {
  episodeNumber: number
  title: string
  workflowState: string
  needsAttention: boolean
  updatedAt: string
  eta?: string
  blocker?: string
}

export interface SeriesStatus {
  seriesTitle: string
  seriesId: string
  episodes: EpisodeStatus[]
}

export interface HalStatusData {
  series: SeriesStatus[]
  totalActive: number
  totalNeedsAttention: number
  stale: false
  fetchedAt: string
}

export interface HalStatusStale {
  stale: true
  reason: string
}

function getWorkflowLabel(state: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    scripted: 'Scripted',
    voice_generation: 'Voice Gen',
    sfx_generation: 'SFX Gen',
    mixing: 'Mixing',
    review: 'Review',
    approved: 'Approved',
    rendering: 'Rendering',
    ready_to_publish: 'Ready to Publish',
    published: 'Published',
    cold_storage: 'Cold Storage',
    queued: 'Queued',
    in_progress: 'In Progress',
    failed: 'Failed',
    blocked: 'Blocked',
    needs_revision: 'Needs Revision',
  }
  return labels[state] || state
}

export async function fetchHalStatus(): Promise<HalStatusData | HalStatusStale> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return { stale: true, reason: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' }
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase
      .from('stories')
      .select(`
        id,
        episode_number,
        title,
        workflow_state,
        needs_attention,
        updated_at,
        series_id,
        series:series_id (
          id,
          title
        )
      `)
      .or('workflow_state.not.in.(published,cold_storage),needs_attention.eq.true')
      .order('episode_number', { ascending: true })

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`)
    }

    if (!data || data.length === 0) {
      return {
        series: [],
        totalActive: 0,
        totalNeedsAttention: 0,
        stale: false,
        fetchedAt: new Date().toISOString(),
      }
    }

    // Group by series
    const seriesMap = new Map<string, SeriesStatus>()

    for (const story of data) {
      const seriesId = story.series_id || 'standalone'
      const seriesData = story.series as unknown as { id: string; title: string } | null
      const seriesTitle = seriesData?.title || 'Standalone'

      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          seriesTitle,
          seriesId,
          episodes: [],
        })
      }

      const entry = seriesMap.get(seriesId)!
      entry.episodes.push({
        episodeNumber: story.episode_number || 0,
        title: story.title || '(untitled)',
        workflowState: getWorkflowLabel(story.workflow_state || 'unknown'),
        needsAttention: story.needs_attention || false,
        updatedAt: story.updated_at || '',
        blocker: story.needs_attention ? '⚠️ Needs attention' : undefined,
      })
    }

    // Sort episodes within each series
    for (const series of seriesMap.values()) {
      series.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)
    }

    const allSeries = Array.from(seriesMap.values() as Iterable<SeriesStatus>).sort((a, b) =>
      a.seriesTitle.localeCompare(b.seriesTitle)
    )

    const totalActive = data.length
    const totalNeedsAttention = data.filter(s => s.needs_attention).length

    return {
      series: allSeries,
      totalActive,
      totalNeedsAttention,
      stale: false,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[cfo/hal-status] Fetch failed:', reason)
    return { stale: true, reason }
  }
}

// CLI entry point
if (require.main === module) {
  ;(async () => {
    const result = await fetchHalStatus()
    console.log(JSON.stringify(result, null, 2))
  })()
}
