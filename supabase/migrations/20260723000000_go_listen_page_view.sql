-- PAGE-VIEW-001 (Marc, 2026-07-23): add 'page_view' to go_listen_events event CHECK.
--
-- Purpose: enable first-party play-rate measurement. Before this migration the
-- only event fired before audio starts is cta_rendered (at ~45s). Sessions that
-- bounce without pressing play have zero rows in go_listen_events, making play
-- rate unmeasurable from our own data. With page_view fired on component mount,
-- play_rate = play_start ÷ page_view, same session_id, same definition.
-- Prerequisite for PLAY-RATE-001 / preview A-B testing.
--
-- Client-side code is already deployed (PRE-DDL SAFE pattern — API 202s unknown
-- event values until this migration runs). Run this migration to start receiving
-- page_view rows.
--
-- MARC AUTHORIZATION REQUIRED before applying (schema change per OPS-CHARTER-001-R1).

-- Drop and recreate the CHECK constraint to add 'page_view'.
-- The existing constraint name may vary — use DO block to handle both patterns.

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the event CHECK constraint name dynamically
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'go_listen_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%event%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE go_listen_events DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE go_listen_events
  ADD CONSTRAINT go_listen_events_event_check CHECK (
    event IN (
      'play_start',
      'sec_30',
      'pct_25',
      'pct_50',
      'pct_75',
      'complete',
      'cta_click',
      'preview_started',
      'preview_completed',
      'preview_unmuted',
      'preview_to_play',
      'preview_skipped',
      'cta_rendered',
      'page_view'        -- PAGE-VIEW-001: fired on component mount
    )
  );

-- Optional index to support play-rate queries efficiently:
--   SELECT session_id, COUNT(*) FILTER (WHERE event='play_start') AS played,
--          COUNT(*) FILTER (WHERE event='page_view') AS viewed
--   FROM go_listen_events WHERE created_at > now() - interval '7 days'
--   GROUP BY session_id;
CREATE INDEX IF NOT EXISTS go_listen_events_event_session_idx
  ON go_listen_events (event, session_id, created_at DESC);
