-- ============================================================
-- MIGRATION: 20260804110000
-- BELL-CAST-002: Add ADRIAN to series_character_roster for
-- The Bell Beneath Falls Park.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-08-04
-- Ticket:  BELL-CAST-002
-- Approved: Marc Postlewaite 2026-08-04 (Item H ruling — Adrian
--           is a speaking character, voice confirmed in PV1/PV2)
-- Requires Marc apply word before running on prod.
--
-- Adrian Cross (voice ID KERejodymirUVJPEtErn):
--   - Found dying in tunnel below Falls Park, EP1.
--   - Poisoned. Lena's wrist pulse check misses faint life signs
--     in cold and dark. Adrian opens eyes: "Mara, the bell knows."
--     Dies immediately after. Medical examiner establishes true
--     time of death in EP2.
--   - Custom voice settings in PV renders: stability=0.25,
--     speaker_boost=false. Document that here for re-use.
--   - Token in his fist: "ASK WHO DROWNED" + date June 18, 1997
--     written on his palm.
--
-- Idempotency: ON CONFLICT DO NOTHING via existing unique index
-- uix_scr_series_char (series_id, canonical_name_normalized).
-- ============================================================

BEGIN;

-- ── Look up Bell series ID and insert ADRIAN ─────────────────
WITH bell AS (
  SELECT id FROM series WHERE title = 'The Bell Beneath Falls Park' LIMIT 1
)
INSERT INTO series_character_roster (
  series_id,
  canonical_name,
  canonical_name_normalized,
  aliases,
  voice_id,
  voice_name,
  description,
  gender,
  age,
  accent,
  first_appeared_episode,
  is_locked
)
SELECT
  b.id,
  'ADRIAN',
  'ADRIAN',
  ARRAY['ADRIAN CROSS'],
  'KERejodymirUVJPEtErn',
  'Adrian Cross',
  'Adrian Cross — found dying in tunnel below Falls Park EP1. Poisoned; '
  'Lena''s wrist pulse check misses life signs in cold/dark. Eyes open: '
  '"Mara, the bell knows." Dies immediately after. True time of death '
  'established by medical examiner in EP2. Voice settings: stability=0.25, '
  'speaker_boost=false (whisper, barely audible). '
  'Established PV1 (2026-07-28).',
  'male',
  'middle_aged',
  'american',
  1,            -- first_appeared_episode = 1
  true          -- is_locked: voice may not change without Marc approval
FROM bell b
ON CONFLICT DO NOTHING;

COMMIT;
