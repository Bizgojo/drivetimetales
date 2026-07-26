-- GVL-EAVESDROP-001 (2026-07-26)
-- Adds listen-arm1/2/3 variants and eavesdrop_pressed/ep_complete/wall_shown/wall_submit events
-- to go_listen_events CHECK constraint and RLS INSERT policy.
--
-- Apply before /listen goes live in production.
-- Smoke test: send a listen-arm1 page_view + eavesdrop_pressed event after applying.

BEGIN;

-- 1. Update the variant CHECK constraint
ALTER TABLE go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_variant_check;

ALTER TABLE go_listen_events
  ADD CONSTRAINT go_listen_events_variant_check
  CHECK (variant IN ('a', 'b', 'bare', 'listen-arm1', 'listen-arm2', 'listen-arm3'));

-- 2. Update the event CHECK constraint
ALTER TABLE go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_event_check;

ALTER TABLE go_listen_events
  ADD CONSTRAINT go_listen_events_event_check
  CHECK (event IN (
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
    'page_view',
    -- GVL-EAVESDROP-001 new events:
    'eavesdrop_pressed',
    'ep_complete',
    'wall_shown',
    'wall_submit'
  ));

-- 3. Update the RLS INSERT policy to allow the new variants and events
-- (Drop and recreate the anon insert policy with expanded allowlists)
DROP POLICY IF EXISTS "anon_insert_go_listen_events" ON go_listen_events;

CREATE POLICY "anon_insert_go_listen_events" ON go_listen_events
  FOR INSERT
  TO anon
  WITH CHECK (
    variant IN ('a', 'b', 'bare', 'listen-arm1', 'listen-arm2', 'listen-arm3')
    AND event IN (
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
      'page_view',
      'eavesdrop_pressed',
      'ep_complete',
      'wall_shown',
      'wall_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND char_length(utm_source) <= 120
    AND char_length(utm_campaign) <= 120
  );

COMMIT;
