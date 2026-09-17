// lib/halDispatchAck.ts
// When Orion dispatches a task to HAL, it registers a pending acknowledgement.
// HAL must write an ack within HAL_ACK_TIMEOUT_MS.
// If no ack: task status = 'BLOCKED (HAL not responding)' — never 'dispatched'.
//
// USAGE (Orion side — when dispatching to HAL):
//   import { registerHalDispatch, checkDispatchAck } from '@/lib/halDispatchAck'
//   const taskId = crypto.randomUUID()
//   await registerHalDispatch({ taskId, taskDescription: 'Render episode 3', seriesId: '...' })
//   // ... later, poll or check via cron ...
//   const status = await checkDispatchAck(taskId)
//   // 'pending' | 'acknowledged' | 'timed_out'
//
// USAGE (HAL side — at the very start of its session):
//   import { acknowledgeHalDispatch } from '@/lib/halDispatchAck'
//   await acknowledgeHalDispatch(taskId, halSessionKey)
//
// Requires env vars:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

const HAL_ACK_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes

export type DispatchAckStatus = 'pending' | 'acknowledged' | 'timed_out'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Orion calls this immediately after spawning a HAL subagent.
 * Records the dispatch so the watchdog can track whether HAL woke up.
 */
export async function registerHalDispatch(params: {
  taskId: string              // caller-generated unique ID (use crypto.randomUUID())
  taskDescription: string
  seriesId?: string
  storyIds?: string[]
}): Promise<void> {
  const sb = supabase()
  const { error } = await sb.from('hal_heartbeat').insert({
    event: 'dispatch_pending',
    meta: {
      taskId: params.taskId,
      taskDescription: params.taskDescription,
      seriesId: params.seriesId ?? null,
      storyIds: params.storyIds ?? [],
      dispatchedAt: new Date().toISOString(),
      ackDeadline: new Date(Date.now() + HAL_ACK_TIMEOUT_MS).toISOString(),
      ackStatus: 'pending',
    },
  })
  if (error) console.error('[halDispatchAck] registerHalDispatch failed:', error.message)
}

/**
 * HAL calls this at the very start of its subagent session.
 * Without this call, the dispatch remains 'pending' and will time out.
 */
export async function acknowledgeHalDispatch(taskId: string, halSession: string): Promise<void> {
  const sb = supabase()
  const { error } = await sb.from('hal_heartbeat').insert({
    event: 'dispatch_acknowledged',
    hal_session: halSession,
    meta: {
      taskId,
      acknowledgedAt: new Date().toISOString(),
    },
  })
  if (error) console.error('[halDispatchAck] acknowledgeHalDispatch failed:', error.message)
}

/**
 * Check whether a dispatched task has been acknowledged by HAL.
 * Returns:
 *   'acknowledged' — HAL wrote an ack row
 *   'pending'      — deadline not yet passed
 *   'timed_out'    — deadline passed with no ack
 */
export async function checkDispatchAck(taskId: string): Promise<DispatchAckStatus> {
  const sb = supabase()

  // Check for acknowledgement first
  const { data: ack } = await sb
    .from('hal_heartbeat')
    .select('created_at')
    .eq('event', 'dispatch_acknowledged')
    .contains('meta', { taskId })
    .limit(1)
    .single()
  if (ack) return 'acknowledged'

  // Check if pending dispatch exists and whether it's timed out
  const { data: pending } = await sb
    .from('hal_heartbeat')
    .select('meta, created_at')
    .eq('event', 'dispatch_pending')
    .contains('meta', { taskId })
    .limit(1)
    .single()
  if (!pending) return 'timed_out'

  const deadline = new Date((pending.meta as { ackDeadline: string }).ackDeadline)
  return Date.now() > deadline.getTime() ? 'timed_out' : 'pending'
}
