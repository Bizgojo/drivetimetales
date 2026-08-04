-- ============================================================
-- MIGRATION: 20260804120000
-- LISTEN-ARM-V2-001 (revised): Add listen_arm_label TEXT (A/B/C)
-- alongside existing listen_arm SMALLINT. No drop.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-08-04
-- Ticket:  LISTEN-ARM-V2-001 (revised per Marc 2026-08-04)
-- Requires Marc apply word before running on prod.
--
-- Two sections. Marc must review both before applying.
-- ============================================================

BEGIN;

-- ── SECTION 1: users.listen_arm_label ────────────────────────
--
-- Adds a new TEXT column alongside the existing listen_arm SMALLINT
-- (added 2026-07-27 via 20260727200000_add_listen_arm_to_users.sql).
-- The SMALLINT column is NOT dropped — stays until the new TEXT column
-- is verified in production and a separate drop migration is issued.
--
-- Column design:
--   A = short-promo arm (~85s, PV1 / Bell arm A)
--   B = medium-promo arm (~187s, PV2 / Bell arm B)
--   C = long-promo arm (two conversion points: interim click + email)
--   NULL = direct traffic (not arm-assigned)
--
-- Arm C tracking: see Section 2 (go_listen_events events).
--
-- EXACT SQL (for Marc review):
--
--   ALTER TABLE users
--     ADD COLUMN IF NOT EXISTS listen_arm_label TEXT;
--
--   ALTER TABLE users
--     DROP CONSTRAINT IF EXISTS chk_listen_arm_label;
--
--   ALTER TABLE users
--     ADD CONSTRAINT chk_listen_arm_label
--     CHECK (listen_arm_label IN ('A', 'B', 'C'));
--
--   COMMENT ON COLUMN users.listen_arm_label IS
--     'Acquisition funnel arm: A=short-promo (~85s), B=medium-promo (~187s), '
--     'C=long-promo (two-step: interim click + email). '
--     'NULL = direct traffic. Replaces listen_arm SMALLINT once verified.';
--
-- ROLLBACK PLAN:
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_listen_arm_label;
--   ALTER TABLE users DROP COLUMN IF EXISTS listen_arm_label;
--   (SMALLINT column unaffected — rollback is safe and non-destructive)
--
-- LOCALHOST VERIFIED: syntax checked against production DB 2026-08-04.
-- Column does not yet exist; listen_arm SMALLINT exists with 0 rows set.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS listen_arm_label TEXT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_listen_arm_label;

ALTER TABLE users
  ADD CONSTRAINT chk_listen_arm_label
  CHECK (listen_arm_label IN ('A', 'B', 'C'));

COMMENT ON COLUMN users.listen_arm_label IS
  'Acquisition funnel arm: A=short-promo (~85s), B=medium-promo (~187s), '
  'C=long-promo (two-step: interim click + email). '
  'NULL = direct traffic. Replaces listen_arm SMALLINT once verified on prod.';


-- ── SECTION 2: go_listen_events — Arm C dual-conversion events ─
--
-- Arm C has TWO conversion points that must be tracked independently:
--   arm_c_interim_click  — mid-content CTA click (first conversion)
--   arm_c_email_submit   — email entry at terminal wall (second conversion)
--
-- EXACT SQL Marc must review before this section runs:
--
-- Step A: Update event CHECK constraint:
--
--   ALTER TABLE go_listen_events
--     DROP CONSTRAINT IF EXISTS go_listen_events_event_check;
--
--   ALTER TABLE go_listen_events
--     ADD CONSTRAINT go_listen_events_event_check
--     CHECK (event IN (
--       'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75',
--       'complete', 'cta_click',
--       'preview_started', 'preview_completed', 'preview_unmuted',
--       'preview_to_play', 'preview_skipped',
--       'cta_rendered', 'page_view',
--       'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
--       'arm_c_interim_click',
--       'arm_c_email_submit'
--     ));
--
-- Step B: Update variant CHECK (add arm-a/b/c tokens; keep legacy arm1/2/3):
--
--   ALTER TABLE go_listen_events
--     DROP CONSTRAINT IF EXISTS go_listen_events_variant_check;
--
--   ALTER TABLE go_listen_events
--     ADD CONSTRAINT go_listen_events_variant_check
--     CHECK (variant IN (
--       'a', 'b', 'bare',
--       'listen-arm1', 'listen-arm2', 'listen-arm3',
--       'listen-arm-a', 'listen-arm-b', 'listen-arm-c'
--     ));
--
-- Step C: Rebuild RLS INSERT policy with updated allowlists:
--
--   DROP POLICY IF EXISTS "anon_insert_go_listen_events" ON go_listen_events;
--
--   CREATE POLICY "anon_insert_go_listen_events" ON go_listen_events
--     FOR INSERT
--     TO anon
--     WITH CHECK (
--       variant IN (
--         'a', 'b', 'bare',
--         'listen-arm1', 'listen-arm2', 'listen-arm3',
--         'listen-arm-a', 'listen-arm-b', 'listen-arm-c'
--       )
--       AND event IN (
--         'play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75',
--         'complete', 'cta_click',
--         'preview_started', 'preview_completed', 'preview_unmuted',
--         'preview_to_play', 'preview_skipped',
--         'cta_rendered', 'page_view',
--         'eavesdrop_pressed', 'ep_complete', 'wall_shown', 'wall_submit',
--         'arm_c_interim_click',
--         'arm_c_email_submit'
--       )
--       AND position_seconds BETWEEN 0 AND 21600
--       AND char_length(utm_source) <= 120
--       AND char_length(utm_campaign) <= 120
--     );
--
-- ROLLBACK PLAN (go_listen_events section):
--   1. DROP POLICY "anon_insert_go_listen_events" ON go_listen_events;
--   2. Recreate policy without arm_c events (copy from 20260726000000_gvl_eavesdrop_events.sql)
--   3. DROP and recreate event CHECK without arm_c events (same source)
--   4. DROP and recreate variant CHECK without arm-a/b/c tokens (same source)
--   Existing rows are not affected by CHECK constraint changes (checks apply on INSERT only).
--
-- ── NOTE: Section 2 SQL is shown above as comments for Marc's review.
-- ── Uncomment and apply on Marc's explicit word (separate from Section 1).
-- ── Section 2 is intentionally NOT executed in this migration file.
-- ── Add arm_c_interim_click + arm_c_email_submit to lib/goListenEventList.ts
-- ── AFTER Section 2 is applied and smoke test passes.

COMMIT;
