-- ============================================================
-- MIGRATION: 20260811000000
-- GATE-TRACK-001 — Bell Invitation Gate tracking
-- Ticket: GATE-TRACK-001
-- Author: Atlas (Endless Tales engineering)
-- Date:   2026-08-11
--
-- CODE AUDIT RESULT (atlas-migration-audit-001):
--   GoInvitationContent.tsx applies EVENT_MAP before any fetch to
--   /api/go-listen. The DB never receives spec event names.
--   Exact mapping confirmed at lines 130-139 / 141-143:
--
--     listen_start     → play_start   (line 194)  — already in event_check
--     progress_25      → pct_25       (line 212)  — already in event_check
--     progress_50      → pct_50       (line 216)  — already in event_check
--     progress_75      → pct_75       (line 220)  — already in event_check
--     continue_pressed → cta_click    (line 264)  — already in event_check
--     page_view        → page_view    (line 162)  — already in event_check
--     wall_shown       → wall_shown   (lines 245,253) — already in event_check
--     wall_submit      → wall_submit  (line 302)  — already in event_check
--
--   route.ts (invite-signup) also sends event: 'wall_submit'  (line 133)
--   and variant: `bell-arm${armNum}` (line 130).
--
-- CHANGES IN THIS MIGRATION:
--   SECTION 1 — go_listen_events_variant_check
--     ADD: bell-arm1, bell-arm2, bell-arm3
--     (code at GoInvitationContent.tsx line 145 sends `bell-arm${arm}`)
--
--   SECTION 2 — go_listen_events_event_check
--     NO new events required — all 8 emitted DB event strings are
--     already in the production-verified allowlist. Constraint is
--     reconstructed from Marc's verified production values only.
--     Previous draft incorrectly added spec names; this corrects that.
--
--   SECTIONS 3-4 — RLS INSERT policies
--     Align variant filter with the new constraint (add bell-arm1/2/3).
--     Align event filter with production values only (remove spec names
--     that were incorrectly present in the prior draft).
--
-- REQUIRES Marc's explicit written authorization before running on prod.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — variant CHECK constraint
-- Production baseline: 'a', 'b', 'bare', 'listen-arm1/2/3'
-- Adding: 'bell-arm1', 'bell-arm2', 'bell-arm3'
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_variant_check;

ALTER TABLE public.go_listen_events
  ADD CONSTRAINT go_listen_events_variant_check
  CHECK (variant IN (
    -- original variants
    'a', 'b', 'bare',
    'listen-arm1', 'listen-arm2', 'listen-arm3',
    -- GATE-TRACK-001: Bell invitation gate variants (GoInvitationContent.tsx line 145)
    'bell-arm1', 'bell-arm2', 'bell-arm3'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — event CHECK constraint
-- Audit result: no new events needed.
-- All events emitted by code are already in the production allowlist
-- via EVENT_MAP translation. Reconstructing with exactly the 18
-- production-verified values — no spec names added.
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
    'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit'
    -- NOTE: listen_start/progress_25/50/75/continue_pressed are NOT added here.
    -- CODE AUDIT confirmed these spec names are mapped client-side to existing
    -- DB-valid names (play_start/pct_25/50/75/cta_click) before any insert.
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS INSERT policy: go_listen_events_insert_anon
-- Adds bell-arm1/2/3 to variant filter; aligns event filter with
-- production-verified values only (spec names removed from prior draft).
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
    AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — RLS INSERT policy: "anon_insert_go_listen_events"
-- Adds bell-arm1/2/3 to variant filter; aligns event filter with
-- production-verified values only (spec names removed from prior draft).
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
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   SECTION 1: Restore variant CHECK to: 'a','b','bare','listen-arm1/2/3'
--   SECTION 2: No rollback needed (event constraint unchanged from production)
--   SECTIONS 3-4: Remove 'bell-arm1/2/3' from variant filter in both policies
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;
