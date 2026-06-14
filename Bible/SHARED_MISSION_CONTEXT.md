# Shared Mission Context

**Effective:** 2026-06-13  
**Owner:** Orion (creates missions), Hal/Atlas (reads missions)  
**Core Rule:** Every agent must load and confirm the active mission before beginning production work.

---

## What Is a Mission?

A mission is a shared briefing for Hal, Orion, and Atlas. It answers:

- **What are we doing right now?** (e.g., "Three-story autonomy smoke test")
- **Which stories are in scope?** (e.g., Story A, Story B, Story C)
- **What does success look like?** (e.g., "All three reach ready_for_review")
- **What constraints are active?** (e.g., "No Marc interventions allowed")

---

## Missions in the System

### Three-Story Autonomy Smoke Test (Active)

**Objective:** Get three stories through the full production pipeline to ready_for_review without Marc intervention.

**Stories in scope:**
- Bridges of Bad Blood, Episode 2
- The Leland Hall Case (M-1 Story 1)
- [Third story — TBD by Orion]

**Success criteria:**
1. All three stories reach ready_for_review state
2. Zero Marc interventions required
3. Every failure produces a structured learning event
4. No failure recurs more than once
5. Command Center shows true job state for all three stories

**Status:** Active (started 2026-06-13)

---

## For Hal: Load the Mission at Session Start

```typescript
import { loadActiveMission } from '@/lib/missionContext'

// In your session startup:
const mission = await loadActiveMission(supabase)
if (!mission) {
  console.error('No active mission found. Ask Orion.')
  process.exit(1)
}

console.log(mission.mission_name)           // "Three-Story Autonomy Smoke Test v1"
console.log(mission.objective)              // The goal
console.log(mission.stories)                // The story IDs and episodes in scope
console.log(mission.success_criteria)       // What must happen
```

**Do this BEFORE you do any story work.**

---

## For Orion: Create a New Mission

```typescript
import { createMission } from '@/lib/missionContext'

const mission = await createMission(supabase, {
  mission_name: 'Three-Story Autonomy Smoke Test v1',
  mission_type: 'smoke_test',
  objective: 'Get three stories through production to ready_for_review without Marc intervention.',
  success_criteria: [
    'All three stories reach ready_for_review',
    'Zero Marc interventions',
    'Every failure produces a learning event',
    'No failure recurs > once',
  ],
  stories: [
    { storyId: 'story-123', seriesTitle: 'Bridges', episodeTitle: 'Bad Blood Ep 2', episodeNumber: 2 },
    { storyId: 'story-456', seriesTitle: 'M-1', episodeTitle: 'Leland Hall', episodeNumber: 1 },
    { storyId: 'story-789', seriesTitle: '...', episodeTitle: '...', episodeNumber: 1 },
  ],
  created_by: 'orion',
  notes: 'Seeded baseline three-story smoke test. Validate that Atlas learning system prevents known failures.',
})
```

This **pauses any currently active missions** and starts this one.

---

## For Atlas: Update Mission State During Production

As the pipeline runner advances, update the mission with true state:

```typescript
import { updateMissionStories, classifyTrueState } from '@/lib/missionContext'

// Fetch the active mission
const mission = await loadActiveMission(supabase)

// Get the three production jobs
const jobs = await fetchProductionJobs(supabase, mission.stories.map(s => s.storyId))

// Classify true state for each job
const truthStates = jobs.map(job => classifyTrueState(job))

// Update mission stories with true state
const updatedStories = mission.stories.map((story, i) => ({
  ...story,
  trueState: truthStates[i].trueState,
  safeResumePoint: truthStates[i].safeResumePoint,
  marcRequired: truthStates[i].marcRequired,
}))

await updateMissionStories(supabase, mission.id, updatedStories)
```

This keeps all agents synchronized on **true job state**, not just `status` field.

---

## Integration Points

- **lib/missionContext.ts** — Load, create, update missions
- **HAL_LEARNING_LOOP.md** — Hal loads mission at phase 0
- **lib/pipelineTruth.ts** — Atlas classifies true state and updates mission
- **Production Console** — Shows active mission + story states
- **Command Center** — Active mission briefing on load

---

## Rules

1. **Load before work:** No agent begins story work without calling `loadActiveMission()`
2. **Confirm with Marc:** If mission is unclear, ask for confirmation before proceeding
3. **Update on state change:** Whenever a story's true state changes, update the mission
4. **One active mission:** Only one mission can be `status='active'` at a time
5. **Archive on completion:** Mark mission `status='complete'` when smoke test succeeds

---

## Example: The Three-Story Smoke Test Flow

1. **Orion creates mission** → 2026-06-13T10:00Z
   - Three stories identified
   - Mission briefed to Hal, Atlas, Orion

2. **Hal loads mission** at session start
   - Reads three story IDs from mission
   - Confirms the objective: "No Marc interventions"
   - Starts working on story scripts

3. **Autonomous runner starts**
   - Picks up three production jobs
   - Advances stories through pipeline steps

4. **Atlas updates mission state** every 15 min
   - Classifies true state of each job (ACTIVE / ZOMBIE / FAILED_NEEDS_MARC / etc.)
   - Updates mission.stories[].trueState

5. **Command Center shows live mission briefing**
   - Story 1: Ep2 [ACTIVE] — on generate_voices step
   - Story 2: Ep1 [FAILED_NEEDS_MARC] — narrator_mismatch, safe resume at voice_preflight
   - Story 3: Ep1 [ACTIVE] — on generate_music step

6. **A failure occurs** → Story 2 narrator_mismatch
   - Error_json.kind = 'narrator_mismatch'
   - Repair playbook recommends: "Update script NARRATOR header to match DB narrator_voice_name"
   - Hal or Atlas applies the fix
   - Job re-queued
   - Mission state updates: Story 2 returns to [ACTIVE]

7. **All three stories reach ready_for_review**
   - Mission success_criteria[0] ✅
   - Update mission status to 'complete'

---

**Next review:** Weekly with Orion + Atlas
