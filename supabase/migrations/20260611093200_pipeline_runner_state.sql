CREATE TABLE IF NOT EXISTS pipeline_runner_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  lease_holder TEXT,
  lease_acquired_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  last_run_summary JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
