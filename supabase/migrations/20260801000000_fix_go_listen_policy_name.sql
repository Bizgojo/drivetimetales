-- ATL-CI-001 (2026-08-01): Fix go_listen_events RLS policy name inconsistency.
--
-- Root cause: GVL-EAVESDROP-001 migration (20260726) created a new policy named
-- "anon_insert_go_listen_events" instead of dropping and recreating the canonical
-- policy name "go_listen_events_insert_anon". This left two INSERT policies on the
-- table: the old canonical one and the new wrongly-named one. It also caused the
-- CI smoke test to fail because Check 1 compares the RLS policy content against a
-- hardcoded list — a list that hadn't been updated with the 4 new eavesdrop events.
--
-- This migration:
--   1. Drops both policies (no-op if either is already gone).
--   2. Recreates the canonical go_listen_events_insert_anon with the full 18-event
--      list (original 14 + eavesdrop_pressed/ep_complete/wall_shown/wall_submit).
--   3. Also adds the listen-arm1/2/3 variants from GVL-EAVESDROP-001.
--
-- After applying: run scripts/smoke-go-listen-migration.js to confirm Check 1 passes.

BEGIN;

-- Drop both the correct-named and the wrongly-named policy (IF EXISTS = safe to re-run)
DROP POLICY IF EXISTS go_listen_events_insert_anon ON public.go_listen_events;
DROP POLICY IF EXISTS "anon_insert_go_listen_events" ON public.go_listen_events;

-- Recreate under the canonical name expected by the smoke test and README.
CREATE POLICY go_listen_events_insert_anon ON public.go_listen_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    variant IN ('a', 'b', 'bare', 'listen-arm1', 'listen-arm2', 'listen-arm3')
    AND event IN (
      -- Original events (2026-07-18 through 2026-07-24):
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
      -- GVL-EAVESDROP-001 (2026-07-26):
      'eavesdrop_pressed',
      'ep_complete',
      'wall_shown',
      'wall_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND (utm_source IS NULL OR char_length(utm_source) <= 120)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 120)
  );

COMMIT;
