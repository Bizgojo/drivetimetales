/**
 * Shared Mission Context
 *
 * Provides Hal, Orion, and Atlas with a shared understanding of:
 * - The active smoke-test mission
 * - Which stories are in scope
 * - Current pipeline state summary
 * - Open incidents and learning items
 *
 * Problem this solves (INC-011):
 * During the three-story autonomy smoke test, Hal did not know the active
 * mission, causing it to generate scripts that contradicted the mission
 * briefing. Agents must load this context at session start.
 *
 * Core rule: Any agent working on production stories must call
 * loadActiveMission() before beginning work. The result is the single
 * source of truth for "what are we doing right now."
 */

type SupabaseLike = {
  from: (table: string) => any
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MissionStatus = 'active' | 'paused' | 'complete' | 'draft'

export type MissionStory = {
  storyId: string
  seriesTitle: string
  episodeTitle: string
  episodeNumber: number
  jobId?: string | null
  trueState?: string | null // from pipelineTruth.ts
  safeResumePoint?: string | null
  marcRequired?: boolean
}

export type ActiveMission = {
  id: string
  mission_name: string
  mission_type: string    // 'smoke_test' | 'batch_production' | 'repair'
  status: MissionStatus
  stories: MissionStory[]
  objective: string
  success_criteria: string[]
  created_by: string      // 'orion' | 'marc' | 'atlas'
  created_at: string
  updated_at: string
  notes?: string | null
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load the currently active mission.
 * Returns null if no active mission exists.
 *
 * Agents should call this at session start and before any story work.
 */
export async function loadActiveMission(
  supabase: SupabaseLike,
): Promise<ActiveMission | null> {
  const { data, error } = await supabase
    .from('active_missions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[mission-context] Failed to load active mission:', error.message)
    return null
  }

  if (!data) return null

  const row = data as Record<string, unknown>
  const stories = Array.isArray(row.stories) ? (row.stories as MissionStory[]) : []

  return {
    id: String(row.id || ''),
    mission_name: String(row.mission_name || 'Unnamed Mission'),
    mission_type: String(row.mission_type || 'smoke_test'),
    status: (row.status as MissionStatus) || 'active',
    stories,
    objective: String(row.objective || ''),
    success_criteria: Array.isArray(row.success_criteria) ? row.success_criteria as string[] : [],
    created_by: String(row.created_by || 'unknown'),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    notes: row.notes ? String(row.notes) : null,
  }
}

/**
 * Load all missions, including complete and paused ones.
 * Used by Command Center history view.
 */
export async function loadAllMissions(
  supabase: SupabaseLike,
  limit = 10,
): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from('active_missions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[mission-context] Failed to load missions:', error.message)
    return []
  }

  return ((data as Record<string, unknown>[]) || []).map(row => ({
    id: String(row.id || ''),
    mission_name: String(row.mission_name || ''),
    mission_type: String(row.mission_type || 'smoke_test'),
    status: (row.status as MissionStatus) || 'active',
    stories: Array.isArray(row.stories) ? (row.stories as MissionStory[]) : [],
    objective: String(row.objective || ''),
    success_criteria: Array.isArray(row.success_criteria) ? row.success_criteria as string[] : [],
    created_by: String(row.created_by || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    notes: row.notes ? String(row.notes) : null,
  }))
}

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export type CreateMissionInput = {
  mission_name: string
  mission_type: string
  objective: string
  success_criteria: string[]
  stories?: MissionStory[]
  created_by: string
  notes?: string | null
}

/**
 * Create a new mission and pause any currently active ones.
 * Called by Orion when beginning a new production batch or smoke test.
 */
export async function createMission(
  supabase: SupabaseLike,
  input: CreateMissionInput,
): Promise<{ data: ActiveMission | null; error: Error | null }> {
  // Pause any currently active missions
  await supabase
    .from('active_missions')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('status', 'active')

  const payload = {
    mission_name: input.mission_name.trim(),
    mission_type: input.mission_type,
    status: 'active' as MissionStatus,
    stories: input.stories ?? [],
    objective: input.objective.trim(),
    success_criteria: input.success_criteria,
    created_by: input.created_by,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('active_missions')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  return { data: data as ActiveMission, error: null }
}

/**
 * Update mission status.
 * Called when smoke test completes, is paused, or fails.
 */
export async function updateMissionStatus(
  supabase: SupabaseLike,
  missionId: string,
  status: MissionStatus,
  notes?: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('active_missions')
    .update({
      status,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', missionId)

  return { error: error ? new Error(error.message) : null }
}

/**
 * Update the stories list on a mission.
 * Called when pipeline truth state is refreshed.
 */
export async function updateMissionStories(
  supabase: SupabaseLike,
  missionId: string,
  stories: MissionStory[],
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('active_missions')
    .update({ stories, updated_at: new Date().toISOString() })
    .eq('id', missionId)

  return { error: error ? new Error(error.message) : null }
}

// ---------------------------------------------------------------------------
// Format for agents
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable briefing for the active mission.
 * Agents should include this in their session context before story work.
 */
export function formatMissionBriefing(mission: ActiveMission): string {
  const lines: string[] = []
  lines.push(`🎯 ACTIVE MISSION: ${mission.mission_name}`)
  lines.push(`Type: ${mission.mission_type} | Status: ${mission.status}`)
  lines.push(`Objective: ${mission.objective}`)
  lines.push('')

  if (mission.stories.length > 0) {
    lines.push('📚 Stories in scope:')
    for (const s of mission.stories) {
      const state = s.trueState ? ` [${s.trueState}]` : ''
      const marc = s.marcRequired ? ' ⚠️ NEEDS MARC' : ''
      lines.push(`  • Ep${s.episodeNumber}: "${s.episodeTitle}" (${s.seriesTitle})${state}${marc}`)
      if (s.safeResumePoint) {
        lines.push(`    Resume at: ${s.safeResumePoint}`)
      }
    }
    lines.push('')
  }

  if (mission.success_criteria.length > 0) {
    lines.push('✅ Success criteria:')
    for (const c of mission.success_criteria) {
      lines.push(`  • ${c}`)
    }
    lines.push('')
  }

  if (mission.notes) {
    lines.push(`Notes: ${mission.notes}`)
  }

  lines.push(`Created by: ${mission.created_by} at ${mission.created_at}`)
  return lines.join('\n')
}
