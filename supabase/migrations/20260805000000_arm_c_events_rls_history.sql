-- ============================================================
-- MIGRATION: 20260805000000
-- ARM-C-EVENTS-001 — Add arm_c_interim_click + arm_c_email_submit
--   to go_listen_events CHECK constraint and both RLS INSERT policies.
--
-- ALSO: Documents the 2026-07-24 RLS-FIX-001 state that was applied
--   to production without a migration file, so migration history
--   matches prod.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-08-05
-- Ticket:  ARM-C-EVENTS-001
-- Requires Marc apply word before running on prod.
-- DO NOT APPLY without Marc's explicit written authorization.
--
-- ── SECTION 0 — History: 2026-07-24 RLS-FIX-001 (NO DDL, comment only)
-- ── SECTION 1 — go_listen_events event CHECK constraint
-- ── SECTION 2 — RLS policy: go_listen_events_insert_anon
-- ── SECTION 3 — RLS policy: "anon_insert_go_listen_events"
-- ── SECTION 4 — lib/goListenEventList.ts reminder (code change, not SQL)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 — HISTORY: 2026-07-24 RLS-FIX-001 (COMMENT ONLY, NO DDL)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- On 2026-07-24, an RLS policy update was applied directly to production
-- without a migration file (RLS-FIX-001). This section documents what was
-- applied so migration history matches prod.
--
-- Evidence basis (all three sources agree):
--   (a) goListenEventList.ts history comment: "2026-07-24 — RLS-FIX-001: RLS
--       policy synced with full list"
--   (b) app/api/go-listen/route.ts comment: "RLS-FIX-001 (2026-07-24): RLS
--       policy synced with full event list. All events are now in both CHECK
--       constraint and RLS INSERT policy."
--   (c) Empirical: 206 go_listen_events rows with variant='listen-arm1' AND
--       utm_source IS NULL confirm the policy allows listen-arm variants with
--       the IS-NULL guard (see SECTION 2 notes below).
--
-- What RLS-FIX-001 applied (reconstructed from evidence):
--   • Policy name:  go_listen_events_insert_anon  (unchanged from original)
--   • TO:           anon, authenticated
--   • WITH CHECK updated to include:
--       - 14 events (added preview_*, cta_rendered, page_view vs. previous 8)
--       - listen-arm1, listen-arm2, listen-arm3 added to variant allowlist
--       - (utm_source IS NULL OR char_length <= 120) guard preserved
--       - created_at ±1 minute guard preserved
--
-- The July 26 GVL-EAVESDROP-001 migration (20260726000000_gvl_eavesdrop_events.sql)
-- subsequently added a SECOND policy "anon_insert_go_listen_events" covering the
-- 4 new eavesdrop events and listen-arm variants. It dropped itself (no-op) and
-- created it fresh, leaving the original go_listen_events_insert_anon intact.
-- Prod currently has TWO permissive INSERT policies (see ATL-CI-001 history).
-- This is not fixed here; both are updated to add the arm_c events.
--
-- The removed 20260801000000_fix_go_listen_policy_name.sql is NOT recreated here
-- (DROP+CREATE to rename was blocked per Marc Aug 1). The naming discrepancy is
-- tracked separately.
--
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — event CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DROP + ADD inside a transaction is atomic: the old constraint is dropped and
-- the new one is created under the same transaction lock. There is no window
-- in which rows could violate the old constraint before the new one is in place.
-- All existing rows pass (checks apply on INSERT only; no revalidation of old rows
-- for a simple DROP+ADD in PostgreSQL).
--
-- Current constraint (from 20260726000000_gvl_eavesdrop_events.sql):
--   18 events: play_start sec_30 pct_25 pct_50 pct_75 complete cta_click
--              preview_started preview_completed preview_unmuted
--              preview_to_play preview_skipped cta_rendered page_view
--              eavesdrop_pressed ep_complete wall_shown wall_submit
--
-- After this migration: 20 events (adds arm_c_interim_click, arm_c_email_submit).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_event_check;

ALTER TABLE public.go_listen_events
  ADD CONSTRAINT go_listen_events_event_check
  CHECK (event IN (
    -- original events (2026-07-18)
    'play_start',
    'pct_25',
    'pct_50',
    'pct_75',
    'complete',
    'cta_click',
    -- INSTRUM-001 (2026-07-19)
    'sec_30',
    -- CTA-INSTRUMENTATION-001 (2026-07-22)
    'cta_rendered',
    -- GO-PREVIEW-001 (2026-07-22)
    'preview_started',
    'preview_completed',
    'preview_unmuted',
    'preview_to_play',
    'preview_skipped',
    -- PAGE-VIEW-001 (2026-07-23)
    'page_view',
    -- GVL-EAVESDROP-001 (2026-07-26)
    'eavesdrop_pressed',
    'ep_complete',
    'wall_shown',
    'wall_submit',
    -- ARM-C-EVENTS-001 (2026-08-05) — arm C dual-conversion tracking
    'arm_c_interim_click',   -- mid-content CTA click (first arm C conversion)
    'arm_c_email_submit'     -- terminal email wall submit (second arm C conversion)
  ));


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — RLS INSERT policy: go_listen_events_insert_anon
-- ─────────────────────────────────────────────────────────────────────────────
--
-- APPROACH: ALTER POLICY (not DROP+CREATE).
-- ALTER POLICY replaces the WITH CHECK expression atomically with no gap.
-- The policy continues to exist during the ALTER; no concurrent session can
-- insert a row that would have been blocked before the ALTER completes.
--
-- This policy covers: anon + authenticated roles, includes IS NULL OR guard
-- on utm columns, includes created_at ±1 minute guard.
--
-- Full event list after this migration: 20 events (18 existing + 2 arm_c).
-- Full variant list: a, b, bare, listen-arm1, listen-arm2, listen-arm3
--   (listen-arm-a/b/c tokens NOT added here — see migration comment in
--    20260804120000_listen_arm_label.sql Section 2 for planned renaming).
--
-- NOTE: if this policy does not exist (e.g. fresh DB or prior rename), the
-- ALTER will fail with "policy does not exist". In that case, replace with:
--   DROP POLICY IF EXISTS go_listen_events_insert_anon ON public.go_listen_events;
--   CREATE POLICY go_listen_events_insert_anon ON public.go_listen_events
--     FOR INSERT TO anon, authenticated
--     WITH CHECK (...same expression...);
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY go_listen_events_insert_anon
  ON public.go_listen_events
  WITH CHECK (
    variant IN ('a', 'b', 'bare', 'listen-arm1', 'listen-arm2', 'listen-arm3')
    AND event IN (
      'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click',
      'preview_started', 'preview_completed', 'preview_unmuted',
      'preview_to_play', 'preview_skipped',
      'cta_rendered',
      'page_view',
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
      -- ARM-C-EVENTS-001 (2026-08-05)
      'arm_c_interim_click',
      'arm_c_email_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND (utm_source   IS NULL OR char_length(utm_source)   <= 120)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 120)
    AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS INSERT policy: "anon_insert_go_listen_events"
-- ─────────────────────────────────────────────────────────────────────────────
--
-- APPROACH: ALTER POLICY (not DROP+CREATE). Same reasoning as Section 2.
-- This policy was created by 20260726000000_gvl_eavesdrop_events.sql and
-- covers the anon role only (not authenticated).
--
-- KNOWN BUG IN THIS POLICY (do not fix here — out of scope):
--   utm_source and utm_campaign checks use `char_length(col) <= 120` without
--   an IS NULL guard. char_length(NULL) = NULL; NULL <= 120 = NULL (not TRUE);
--   so rows with NULL utm_source or utm_campaign are rejected by this policy.
--   In practice, all eavesdrop rows with NULL utm pass via go_listen_events_insert_anon
--   (which has the IS NULL guard), so no data is lost today. The bug should be
--   fixed in a separate migration with explicit Marc authorization (it requires
--   adding IS NULL guards, which is a functional change to this policy).
--
-- Adding arm_c events here ensures arm C events are covered by BOTH policies,
-- consistent with belt-and-braces approach used throughout this table.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY "anon_insert_go_listen_events"
  ON public.go_listen_events
  WITH CHECK (
    variant IN ('a', 'b', 'bare', 'listen-arm1', 'listen-arm2', 'listen-arm3')
    AND event IN (
      'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click',
      'preview_started', 'preview_completed', 'preview_unmuted',
      'preview_to_play', 'preview_skipped',
      'cta_rendered',
      'page_view',
      'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
      -- ARM-C-EVENTS-001 (2026-08-05)
      'arm_c_interim_click',
      'arm_c_email_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND char_length(utm_source)   <= 120
    AND char_length(utm_campaign) <= 120
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Code changes required AFTER this migration is applied
-- (not SQL — listed here for review completeness)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- a) lib/goListenEventList.ts — add 'arm_c_interim_click' and 'arm_c_email_submit'
--    to the GO_LISTEN_EVENTS array. This makes them valid in the route's
--    VALID_EVENTS whitelist and visible to the CI smoke test.
--    Per the file's own rule: "When adding a new event: (a) Add it here. (b) Write
--    a migration... (c) Run the smoke test after applying the migration."
--
-- b) app/listen/EavesdropClient.tsx — add client-side emit logic for the two events:
--    - arm_c_interim_click: fire when arm=3 user taps the mid-content CTA
--      (that CTA does not yet exist in the current UI — requires a new UI component)
--    - arm_c_email_submit: fire alongside/instead of wall_submit for arm=3, OR
--      differentiate from wall_submit by arm value
--
-- c) app/api/listen/signup/route.ts — ensure listen_arm_label is written at signup:
--    add `listen_arm_label: armNum === 1 ? 'A' : armNum === 2 ? 'B' : 'C'`
--    to the users upsert payload (both the new-user and existing-user paths).
--    The column was added by 20260804120000_listen_arm_label.sql but is never
--    written by the route today (see Part 2 gap in diagnostic report).
--
-- ROLLBACK PLAN:
--   ALTER POLICY go_listen_events_insert_anon ON public.go_listen_events
--     WITH CHECK (... same expression without arm_c_interim_click and arm_c_email_submit ...);
--   ALTER POLICY "anon_insert_go_listen_events" ON public.go_listen_events
--     WITH CHECK (... same expression without arm_c events ...);
--   ALTER TABLE public.go_listen_events DROP CONSTRAINT go_listen_events_event_check;
--   ALTER TABLE public.go_listen_events ADD CONSTRAINT go_listen_events_event_check
--     CHECK (event IN (... 18 events without arm_c ...));
--   Existing rows are unaffected (CHECK applies to INSERT only).
--
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;
