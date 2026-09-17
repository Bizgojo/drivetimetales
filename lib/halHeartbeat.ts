// lib/halHeartbeat.ts
// Called by HAL at the START and END of every subagent session.
// Also called once per script written.
//
// HAL subagent brief MUST include at minimum:
//   import { writeHalHeartbeat } from '@/lib/halHeartbeat'
//   await writeHalHeartbeat({ event: 'session_start', halSession: '<session_id>' })
//   ... work ...
//   await writeHalHeartbeat({ event: 'session_complete', halSession: '<session_id>' })
//
// Requires env vars:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

export type HalEvent =
  | 'session_start'
  | 'session_complete'
  | 'script_written'
  | 'heartbeat'
  | 'dispatch_pending'
  | 'dispatch_acknowledged'
  | 'restart_attempt'

export async function writeHalHeartbeat(params: {
  event: HalEvent
  halSession?: string
  storyId?: string
  seriesId?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await sb.from('hal_heartbeat').insert({
    event: params.event,
    hal_session: params.halSession ?? null,
    story_id: params.storyId ?? null,
    series_id: params.seriesId ?? null,
    meta: params.meta ?? {},
  })
  if (error) {
    // Non-fatal — never let a heartbeat write failure crash HAL's actual work
    console.error('[halHeartbeat] write failed:', error.message)
  }
}

export async function getLastHalHeartbeat(): Promise<{
  lastEventAt: Date | null
  lastEvent: string | null
  silentMs: number
}> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await sb
    .from('hal_heartbeat')
    .select('event, created_at')
    // Only real HAL activity counts — exclude watchdog meta-events
    .not('event', 'in', '("restart_attempt","dispatch_pending")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return { lastEventAt: null, lastEvent: null, silentMs: Infinity }
  const lastEventAt = new Date(data.created_at)
  return {
    lastEventAt,
    lastEvent: data.event,
    silentMs: Date.now() - lastEventAt.getTime(),
  }
}
