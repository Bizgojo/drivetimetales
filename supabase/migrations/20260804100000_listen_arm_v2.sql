-- ============================================================
-- MIGRATION: 20260804100000
-- LISTEN-ARM-V2: Replace SMALLINT arm (1/2/3) with TEXT arm (A/B/C)
-- Add Arm C dual-conversion tracking events to go_listen_events.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-08-04
-- Ticket:  LISTEN-ARM-V2-001
-- Approved: Marc Postlewaite 2026-08-04 (verbal ruling)
-- Requires Marc apply word before running on prod.
--
-- Arm structure (A/B/C):
--   A = short promo (~85s, PV1) — one conversion point: signup
--   B = medium promo (~187s, PV2) — one conversion point: signup
--   C = long promo (~270s, PV3 class) — TWO conversion points:
--         1. arm_c_interim_click  (mid-content CTA click)
--         2. arm_c_email_submit   (email entry at terminal wall)
--
-- Replaces:
--   supabase/migrations/20260727200000_add_listen_arm_to_users.sql
--   (SMALLINT with values 1/2/3 = arm lengths — wrong spec)
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS
-- ============================================================

BEGIN;

-- ── 1. Remove old SMALLINT listen_arm column ─────────────────
-- The Jul 27 migration added SMALLINT(1/2/3=arm-length) which is
-- the wrong spec. Drop it so the new column stands alone.
ALTER TABLE users DROP COLUMN IF EXISTS listen_arm;

-- ── 2. Add correct TEXT listen_arm column (A/B/C) ────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS listen_arm TEXT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_listen_arm;

ALTER TABLE users
  ADD CONSTRAINT chk_listen_arm
  CHECK (listen_arm IN ('A', 'B', 'C'));

COMMENT ON COLUMN users.listen_arm IS
  'Acquisition funnel arm assignment: A=short-promo (~85s), '
  'B=medium-promo (~187s), C=long-promo (two-step conversion). '
  'Written at /listen entry point. NULL = direct traffic.';

-- ── 3. Add Arm C conversion variants to go_listen_events ─────
-- New variant tokens for Arm C tracking (keep old arm1/2/3 for
-- backward compat with any existing rows; add arm-a/b/c for new).
ALTER TABLE go_listen_events
  DROP CONSTRAINT IF EXISTS go_listen_events_variant_check;

ALTER TABLE go_listen_events
  ADD CONSTRAINT go_listen_events_variant_check
  CHECK (variant IN (
    'a', 'b', 'bare',
    -- legacy arm tokens (keep for existing rows):
    'listen-arm1', 'listen-arm2', 'listen-arm3',
    -- canonical arm tokens (A/B/C):
    'listen-arm-a', 'listen-arm-b', 'listen-arm-c'
  ));

-- ── 4. Add arm_c_interim_click + arm_c_email_submit events ───
-- Arm C has TWO conversion points that must be tracked independently:
--   arm_c_interim_click  — user clicks mid-content CTA (first conversion)
--   arm_c_email_submit   — user submits email at terminal wall (second conversion)
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
    -- GVL-EAVESDROP-001 (2026-07-26):
    'eavesdrop_pressed',
    'ep_complete',
    'wall_shown',
    'wall_submit',
    -- LISTEN-ARM-V2-001 (2026-08-04): Arm C dual-conversion tracking
    'arm_c_interim_click',   -- Arm C first conversion: mid-content CTA click
    'arm_c_email_submit'     -- Arm C second conversion: email entry at terminal wall
  ));

-- ── 5. Rebuild RLS INSERT policy with full updated allowlists ─
DROP POLICY IF EXISTS "anon_insert_go_listen_events" ON go_listen_events;

CREATE POLICY "anon_insert_go_listen_events" ON go_listen_events
  FOR INSERT
  TO anon
  WITH CHECK (
    variant IN (
      'a', 'b', 'bare',
      'listen-arm1', 'listen-arm2', 'listen-arm3',
      'listen-arm-a', 'listen-arm-b', 'listen-arm-c'
    )
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
      'wall_submit',
      'arm_c_interim_click',
      'arm_c_email_submit'
    )
    AND position_seconds BETWEEN 0 AND 21600
    AND char_length(utm_source) <= 120
    AND char_length(utm_campaign) <= 120
  );

COMMIT;
