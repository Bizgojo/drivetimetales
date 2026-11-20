-- GO-LISTEN-VARIANT-001 — 2026-11-20
--
-- Adds the hook-story variant values to go_listen_events' value checks.
--
-- ADDITIVE ONLY. This migration adds new values to existing CHECK/RLS lists
-- and changes nothing else: no column is added, dropped or retyped, no row is
-- touched, and every value that was accepted before is still accepted.
--
-- Why: lib/landing.ts has served the hook variants (widow, rise, miami,
-- rerouted, home) since HOOK-LANDING-001, but go_listen_events only accepts
-- 'a' and 'b' (plus 'bare' and the ad-test arms). Every Miami ad visit was
-- therefore recorded as 'bare' — or rejected outright by the API whitelist —
-- so the Weekend Wife campaign's traffic could not be told apart from default
-- /go traffic. Marc, 2026-11-20: "go_listen_events records variant 'bare'
-- instead of 'miami'. Fix the label."
--
-- Safe to re-run: every statement is idempotent.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — table CHECK constraint on go_listen_events.variant
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'go_listen_events'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%variant%';

  IF con_name IS NULL THEN
    RAISE NOTICE 'GO-LISTEN-VARIANT-001: no variant CHECK constraint found — nothing to alter.';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.go_listen_events DROP CONSTRAINT %I', con_name);
  EXECUTE $sql$
    ALTER TABLE public.go_listen_events
      ADD CONSTRAINT go_listen_events_variant_check
      CHECK (variant IN (
        'a', 'b', 'bare',
        'widow', 'rise', 'miami', 'rerouted', 'home',
        'listen-arm1', 'listen-arm2', 'listen-arm3',
        'bell-arm1', 'bell-arm2', 'bell-arm3'
      ))
  $sql$;
  RAISE NOTICE 'GO-LISTEN-VARIANT-001: replaced variant CHECK constraint %.', con_name;
END $$;

COMMENT ON COLUMN public.go_listen_events.variant IS
  'Which story actually served: a | b (A/B variants) | widow | rise | miami | rerouted | home (hook variants) | bare (default/control story — bare /go or unknown ?v=) | listen-arm* / bell-arm* (ad-test arms).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — RLS INSERT policies: add the hook variants to the allowlist
-- Every other filter is identical to the 20261031 baseline.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY go_listen_events_insert_anon
  ON public.go_listen_events
  WITH CHECK (
    variant IN (
      'a', 'b', 'bare',
      'widow', 'rise', 'miami', 'rerouted', 'home',
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

ALTER POLICY "anon_insert_go_listen_events"
  ON public.go_listen_events
  WITH CHECK (
    variant IN (
      'a', 'b', 'bare',
      'widow', 'rise', 'miami', 'rerouted', 'home',
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
