-- ============================================================
-- MIGRATION: 20261031233000
-- ET-TEST-ANON-TAG-20261031 (commission et-test-anon-tag-20261031, Marc 19:26 EDT)
-- ⚠️ NOT APPLIED ANYWHERE YET. Marc reviews + applies manually (standing DDL rule).
-- No agent applies DDL. REQUIRES Marc's explicit written authorization before running on prod.
--
-- PURPOSE: Amendment-1 Sec 6.4 says ad-test sessions carry et_test=<run_id> and
-- "test events land in Supabase flagged test". Authenticated test signups are
-- already flagged via users.is_test_account — but the ANONYMOUS /go sample
-- player (go_listen_events, no user id) has no test marker, so ad-test runs
-- pollute /api/admin/listen-report funnels. This adds a nullable et_test
-- column: NULL = genuine anonymous visit (kept in reports); non-NULL =
-- ad-test run id (excluded from reports).
--
-- CHANGES:
--   SECTION 1 — ADD COLUMN et_test (nullable, ≤64 chars, matches sanitizeEtTestId)
--   SECTION 2 — partial index on et_test WHERE NOT NULL (report exclusion scan)
--   SECTIONS 3-4 — RLS INSERT policies: add et_test bound ONLY.
--     Variant/event/position/utm/created_at filters are byte-identical to the
--     20260811 baseline (GATE-TRACK-001). The event list is NOT changed.
--
-- PRE-DDL SAFE: /api/go-listen sends et_test best-effort and retries without
-- it on undefined-column errors, so code ships before Marc applies this DDL
-- without breaking ingest. /api/admin/listen-report selects et_test
-- best-effort and excludes non-null rows when the column exists.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — et_test column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.go_listen_events
  ADD COLUMN IF NOT EXISTS et_test text
    CHECK (et_test IS NULL OR char_length(et_test) <= 64);

COMMENT ON COLUMN public.go_listen_events.et_test IS
  'ET-TEST-ANON-TAG-20261031: Amendment-1 ad-test run id (et_test=<run_id>). NULL = genuine anonymous visit, kept in listen-report. Non-NULL = ad-test session, excluded from listen-report. Written by /api/go-listen from the ?et_test= query param.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — partial index (report exclusion scan)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS go_listen_events_et_test_idx
  ON public.go_listen_events (et_test)
  WHERE et_test IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS INSERT policy: go_listen_events_insert_anon
-- Adds et_test bound only; all other filters identical to 20260811 baseline.
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
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND (utm_source   IS NULL OR char_length(utm_source)   <= 120)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 120)
    AND (et_test IS NULL OR char_length(et_test) <= 64)
    AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — RLS INSERT policy: "anon_insert_go_listen_events"
-- Adds et_test bound only; all other filters identical to 20260811 baseline.
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
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND char_length(utm_source)   <= 120
    AND char_length(utm_campaign) <= 120
    AND (et_test IS NULL OR char_length(et_test) <= 64)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   ALTER TABLE public.go_listen_events DROP COLUMN IF EXISTS et_test;
--   DROP INDEX IF EXISTS public.go_listen_events_et_test_idx;
--   SECTIONS 3-4: remove the et_test line from both policy WITH CHECKs.
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;
