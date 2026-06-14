-- Active Missions table
-- Tracks the current smoke-test or production batch mission.
-- Shared context for Hal, Orion, and Atlas so all agents know what they're doing.
-- Fixes INC-011: Hal did not know the active smoke-test mission.

CREATE TABLE IF NOT EXISTS active_missions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_name      TEXT NOT NULL,
  mission_type      TEXT NOT NULL DEFAULT 'smoke_test',  -- smoke_test | batch_production | repair
  status            TEXT NOT NULL DEFAULT 'active',       -- active | paused | complete | draft
  stories           JSONB NOT NULL DEFAULT '[]',          -- MissionStory[] — story_id, series_title, episode_title, etc.
  objective         TEXT NOT NULL DEFAULT '',
  success_criteria  JSONB NOT NULL DEFAULT '[]',          -- string[]
  created_by        TEXT NOT NULL DEFAULT 'orion',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_missions_status
  ON active_missions(status);

CREATE INDEX IF NOT EXISTS idx_active_missions_created_at
  ON active_missions(created_at DESC);

COMMENT ON TABLE active_missions IS
  'Shared mission context for Hal, Orion, and Atlas. All agents must load the active mission before beginning production work.';

COMMENT ON COLUMN active_missions.stories IS
  'Array of MissionStory objects: {storyId, seriesTitle, episodeTitle, episodeNumber, jobId?, trueState?, safeResumePoint?, marcRequired?}';

-- Seed the three-story autonomy smoke test mission
INSERT INTO active_missions (
  mission_name,
  mission_type,
  status,
  stories,
  objective,
  success_criteria,
  created_by,
  notes
) VALUES (
  'Three-Story Autonomy Smoke Test v1',
  'smoke_test',
  'active',
  '[]'::jsonb,
  'Get three stories through the full production pipeline to ready_for_review without Marc intervention. Each failure must produce a learning event or excellence lesson.',
  '["All three stories reach ready_for_review state", "Zero Marc interventions required", "Every failure produces a structured learning event", "No failure recurs more than once", "Command Center shows true job state for all three stories"]'::jsonb,
  'orion',
  'Seeded by Atlas learning system migration 2026-06-13. Stories to be associated by Orion on session start.'
) ON CONFLICT DO NOTHING;
