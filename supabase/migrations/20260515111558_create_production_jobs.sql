CREATE TABLE IF NOT EXISTS production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id TEXT NULL REFERENCES story_queue_items(id) ON DELETE SET NULL,
  story_id UUID NULL REFERENCES stories(id) ON DELETE SET NULL,
  series_id UUID NULL,
  episode_story_id UUID NULL REFERENCES stories(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL DEFAULT 'single',
  status TEXT NOT NULL DEFAULT 'queued',
  current_step TEXT NOT NULL DEFAULT 'queued',
  step_index INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json JSONB,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT production_jobs_status_check
    CHECK (status IN ('queued', 'running', 'waiting_for_external', 'failed', 'complete', 'cancelled')),
  CONSTRAINT production_jobs_step_index_check
    CHECK (step_index >= 0),
  CONSTRAINT production_jobs_total_steps_check
    CHECK (total_steps >= 0),
  CONSTRAINT production_jobs_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_production_jobs_status_updated
  ON production_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_jobs_current_step
  ON production_jobs(current_step);

CREATE INDEX IF NOT EXISTS idx_production_jobs_queue_item_id
  ON production_jobs(queue_item_id);

CREATE INDEX IF NOT EXISTS idx_production_jobs_story_id
  ON production_jobs(story_id);

CREATE INDEX IF NOT EXISTS idx_production_jobs_series_id
  ON production_jobs(series_id);

CREATE INDEX IF NOT EXISTS idx_production_jobs_locked_at
  ON production_jobs(locked_at)
  WHERE locked_at IS NOT NULL;

CREATE OR REPLACE FUNCTION set_production_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_production_jobs_updated_at ON production_jobs;

CREATE TRIGGER trg_production_jobs_updated_at
BEFORE UPDATE ON production_jobs
FOR EACH ROW
EXECUTE FUNCTION set_production_jobs_updated_at();
