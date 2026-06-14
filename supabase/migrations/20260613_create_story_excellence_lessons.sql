-- Story Excellence Ledger
-- Records creative lessons from Marc's story rejections and review feedback.
-- Every rejection must produce a durable lesson so future stories improve.
-- Distinct from production_learning_events (pipeline/technical failures).

CREATE TABLE IF NOT EXISTS story_excellence_lessons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          UUID REFERENCES stories(id) ON DELETE SET NULL,
  series_id         UUID,
  series_title      TEXT,
  episode_title     TEXT,
  rejected_by       TEXT NOT NULL DEFAULT 'marc',
  lesson_category   TEXT NOT NULL,  -- belle_quality | story_resolution | hook | cliffhanger | ending_satisfaction | pacing | cover_art | narrator_character | dialogue_quality | script_structure | genre_fidelity | personalization | other
  lesson_text       TEXT NOT NULL,  -- What was wrong — must be specific
  prevention_rule   TEXT,           -- Matches format: contains:<text> or word:<word>
  applies_to_future BOOLEAN NOT NULL DEFAULT true,
  confidence        NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_story_id
  ON story_excellence_lessons(story_id);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_series_id
  ON story_excellence_lessons(series_id);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_category
  ON story_excellence_lessons(lesson_category);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_applies_to_future
  ON story_excellence_lessons(applies_to_future)
  WHERE applies_to_future = true;

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_created_at
  ON story_excellence_lessons(created_at DESC);

COMMENT ON TABLE story_excellence_lessons IS
  'Creative lessons from story rejections. Read by Hal before script generation. Updated by Orion/Atlas on Marc rejection.';

COMMENT ON COLUMN story_excellence_lessons.prevention_rule IS
  'Preflight-compatible rule: "contains:<text>" or "word:<word>". If matched in a future script, Hal is warned before voice generation.';
