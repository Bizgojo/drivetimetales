-- HAL heartbeat / dead-man alarm
-- Each row = one HAL session check-in
-- PROPOSED — do NOT run without Marc's explicit OK
CREATE TABLE IF NOT EXISTS hal_heartbeat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event         text NOT NULL,       -- 'session_start' | 'session_complete' | 'script_written' | 'heartbeat' | 'dispatch_pending' | 'dispatch_acknowledged' | 'restart_attempt'
  hal_session   text,                -- OpenClaw session key, if available
  story_id      uuid REFERENCES stories(id),
  series_id     uuid REFERENCES series(id),
  meta          jsonb,               -- freeform context
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hal_heartbeat_created_idx ON hal_heartbeat (created_at DESC);
CREATE INDEX IF NOT EXISTS hal_heartbeat_event_idx   ON hal_heartbeat (event, created_at DESC);
COMMENT ON TABLE hal_heartbeat IS 'HAL dead-man switch: HAL writes here on every session start/script-complete. Alarm fires when last row is >2h old AND stories_in_queue > 0.';
