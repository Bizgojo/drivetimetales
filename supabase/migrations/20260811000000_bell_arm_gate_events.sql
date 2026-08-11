-- ============================================================
-- MIGRATION: 20260811000000
-- GATE-TRACK-001 — Bell Invitation Gate tracking
--
-- Adds bell-arm1/2/3 variants and listen_start/progress_25/progress_50/
-- progress_75/continue_pressed events to go_listen_events CHECK constraint
-- and both RLS INSERT policies.
--
-- CONTEXT:
--   This migration is OPTIONAL for the initial launch.
--   Without it, GoInvitationContent.tsx falls back to mapping:
--     bell-arm{n}      → listen-arm{n}   (already valid)
--     listen_start     → play_start      (already valid)
--     progress_25/50/75→ pct_25/50/75    (already valid)
--     continue_pressed → cta_click       (already valid)
--   All 8 tracking events land in the DB immediately using the
--   existing mapping. Apply this migration only when you want
--   dedicated bell-arm* variant rows or explicit event name columns.
--
-- REQUIRES Marc's explicit written authorization before running on prod.
-- Author: Atlas (Endless Tales engineering)
-- Date:   2026-08-11
-- Ticket: GATE-TRACK-001
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — variant CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_variant_check;

ALTER TABLE public.go_listen_events
  ADD CONSTRAINT go_listen_events_variant_check
  CHECK (variant IN (
    'a', 'b', 'bare',
    'listen-arm1', 'listen-arm2', 'listen-arm3',
    -- GATE-TRACK-001: Bell invitation gate variants
    'bell-arm1', 'bell-arm2', 'bell-arm3'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — event CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_event_check;

ALTER TABLE public.go_listen_events
  ADD CONSTRAINT go_listen_events_event_check
  CHECK (event IN (
    -- original (2026-07-18)
    'play_start', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click',
    -- INSTRUM-001 (2026-07-19)
    'sec_30',
    -- CTA-INSTRUMENTATION-001 (2026-07-22)
    'cta_rendered',
    -- GO-PREVIEW-001 (2026-07-22)
    'preview_started', 'preview_completed', 'preview_unmuted',
    'preview_to_play', 'preview_skipped',
    -- PAGE-VIEW-001 (2026-07-23)
    'page_view',
    -- GVL-EAVESDROP-001 (2026-07-26)
    'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
    -- ARM-C-EVENTS-001 (2026-08-05)
    'arm_c_interim_click', 'arm_c_email_submit',
    -- GATE-TRACK-001 (2026-08-11): Bell invitation gate events
    'listen_start',      -- "Listen in…" button pressed
    'progress_25',       -- audio reached 25% of duration
    'progress_50',       -- audio reached 50% of duration
    'progress_75',       -- audio reached 75% of duration
    'continue_pressed'   -- Arm C "Continue →" button pressed
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS INSERT policy: go_listen_events_insert_anon
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY go_listen_events_insert_anon
  ON public.go_listen_events
  WITH CHECK (
    variant IN (
      'a', 'b', 'bare',
      'listen-arm1', 'listen-arm2', 'listen-arm3',
      'bell-arm1', 'bell-arm2', 'bell-arm3'
    )
    AND event IN (
      'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click',
      'preview_started', 'preview_completed', 'preview_unmuted',
      'preview_to_play', 'preview_skipped',
      'cta_rendered', 'page_view',
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
      'arm_c_interim_click', 'arm_c_email_submit',
      -- GATE-TRACK-001
      'listen_start', 'progress_25', 'progress_50', 'progress_75', 'continue_pressed'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND (utm_source   IS NULL OR char_length(utm_source)   <= 120)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 120)
    AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — RLS INSERT policy: "anon_insert_go_listen_events"
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY "anon_insert_go_listen_events"
  ON public.go_listen_events
  WITH CHECK (
    variant IN (
      'a', 'b', 'bare',
      'listen-arm1', 'listen-arm2', 'listen-arm3',
      'bell-arm1', 'bell-arm2', 'bell-arm3'
    )
    AND event IN (
      'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click',
      'preview_started', 'preview_completed', 'preview_unmuted',
      'preview_to_play', 'preview_skipped',
      'cta_rendered', 'page_view',
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
      'arm_c_interim_click', 'arm_c_email_submit',
      -- GATE-TRACK-001
      'listen_start', 'progress_25', 'progress_50', 'progress_75', 'continue_pressed'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND char_length(utm_source)   <= 120
    AND char_length(utm_campaign) <= 120
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Code note (not SQL)
-- ─────────────────────────────────────────────────────────────────────────────
-- After applying this migration:
--   a) In lib/goListenEventList.ts, add:
--      'listen_start', 'progress_25', 'progress_50', 'progress_75', 'continue_pressed'
--   b) In app/api/go-listen/route.ts VALID_VARIANTS, add:
--      'bell-arm1', 'bell-arm2', 'bell-arm3'
--   c) In GoInvitationContent.tsx EVENT_MAP, update variant to `bell-arm${arm}`
--      and map listen_start/progress_*/continue_pressed to their own names.
-- Until then, the existing alias mapping in GoInvitationContent.tsx routes
-- all events to the existing DB-valid names (100% data coverage from day 1).

-- ROLLBACK:
--   Restore previous variant CHECK (without bell-arm*).
--   Restore previous event CHECK (without listen_start/progress_*/continue_pressed).
--   ALTER POLICY statements to remove the new values from both policies.

COMMIT;
