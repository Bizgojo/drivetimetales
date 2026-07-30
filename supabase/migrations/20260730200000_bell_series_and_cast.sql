-- ============================================================
-- MIGRATION: 20260730200000
-- BELL-CAST-001 (revised v2): Bell Beneath Falls Park series
-- record + permanent cast in series_character_roster.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-07-30
-- Ticket:  BELL-CAST-001
-- Approved: Marc Postlewaite 2026-07-30 (option a)
-- Requires Marc apply word before running on prod.
--
-- Idempotency guarantee
-- ----------------------
-- series.title has no unique index (78 rows; not checked for
-- duplicates — do not add one here). A bare INSERT ... RETURNING
-- would create a second Bell row on re-run, giving it a new
-- series_id, then inserting 6 more roster rows against it
-- silently (ON CONFLICT would not fire — different series_id).
--
-- Fix: lookup-or-insert CTE (Marc pattern 2026-07-30).
--   existing  — finds the row if it already exists.
--   ins       — inserts only when existing is empty.
--   bell_series — resolves to whichever path returned the id.
-- Result: always one Bell series row, always 6 roster rows
-- (ON CONFLICT DO NOTHING suppresses re-run duplicates there
-- because series_id + canonical_name_normalized is now unique).
--
-- Dropped from rejected draft
-- -----------------------------
--   series_character_roster.series_name column — unnecessary;
--     all lookups use series_id now that a real record exists.
--   Partial index WHERE series_id IS NULL — column is NOT NULL,
--     predicate indexes zero rows.
--   Partial index WHERE series_id IS NOT NULL — IS NOT NULL on
--     a NOT NULL column adds nothing; replaced with plain unique.
--
-- What is kept
-- -------------
--   Plain UNIQUE index on (series_id, canonical_name_normalized).
--   Marc verified 0 existing duplicates — index builds cleanly.
-- ============================================================

BEGIN;

-- ── 1. Unique cast index ─────────────────────────────────────
-- Create first so any accidental duplicate in step 3 fails
-- loudly rather than silently succeeding.

CREATE UNIQUE INDEX IF NOT EXISTS uix_scr_series_char
  ON series_character_roster (series_id, canonical_name_normalized);


-- ── 2. Series record — lookup-or-insert ──────────────────────
-- total_episodes = 20: the planned 20-episode arc as users see
--   it ("Episode X of 20"). 15–25 range; 20 is the committed
--   number. Not 7 — that was only the number of episodes with
--   defined spine summaries, not the series total.
-- author = 'Iris Fontaine': confirmed on canonical roster,
--   is_active = true, author_id 9ce131ea, DB since 2026-04-03.

WITH existing AS (
  SELECT id
  FROM   series
  WHERE  title = 'The Bell Beneath Falls Park'
  LIMIT  1
),
ins AS (
  INSERT INTO series (title, description, author, total_episodes, category, is_complete)
  SELECT
    'The Bell Beneath Falls Park',
    'Mara Vance investigates her mother''s disappearance through a brass token, a buried cassette recording, and a tunnel network beneath Greenville''s Reedy River.',
    'Iris Fontaine',
    20,
    'Mystery',
    false
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
),
bell_series AS (
  SELECT id FROM ins
  UNION ALL
  SELECT id FROM existing
),

-- ── 3. Cast entries ──────────────────────────────────────────
-- All 6 characters established across PV1 / PV2 / PV3.
-- is_locked = true — only Marc changes a voice assignment.
-- first_appeared_episode = 0 (promo-only; Ep1 not yet produced).
-- ON CONFLICT DO NOTHING — safe to re-run.

cast_rows (canonical_name, canonical_name_normalized, aliases,
           voice_id, voice_name, description,
           gender, age, accent, first_appeared_episode) AS (
  VALUES
    (
      'MARA',          'MARA',
      ARRAY['MARA VANCE'],
      'ovUpRQCoNYADjai0c9kP', 'Mara Vance',
      'Mara Vance — protagonist and narrator. Hospital administrator drawn into her mother''s disappearance. First-person mystery. Established PV1 (2026-07-28).',
      'female', 'middle_aged', 'american', 0
    ),
    (
      'ELI',           'ELI',
      ARRAY['ELI MERCER'],
      'mErDxl2A0Sa7BbP8XhMx', 'Eli Mercer',
      'Eli Mercer — local historian. Scholarly, measured, observant. Established PV1 (2026-07-28).',
      'male', 'middle_aged', 'american', 0
    ),
    (
      'LENA',          'LENA',
      ARRAY['DETECTIVE LENA', 'DETECTIVE LENA ORTIZ'],
      '9oUQOEEPHVmXK5XBUirv', 'Detective Lena Ortiz',
      'Detective Lena Ortiz — Greenville PD. Authoritative, clipped. Established PV1 (2026-07-28).',
      'female', 'middle_aged', 'american', 0
    ),
    (
      'CLAIRE ON CASSETTE', 'CLAIRE ON CASSETTE',
      ARRAY['CLAIRE VANCE', 'CLAIRE'],
      's4qOXUa0rOmoEFvukAR9', 'Claire Vance',
      'Claire Vance — Mara''s mother, heard only on cassette recording. Warm, intimate, slightly distant. Established PV2 (2026-07-29).',
      'female', 'middle_aged', 'american', 0
    ),
    (
      'JUNE',          'JUNE',
      ARRAY['JUNE (THROUGH PHONE)', 'JUNE BELL', 'JUNE ON PHONE'],
      'aIu5oHglU5AHNc2x0AZu', 'Jane Hackett',
      'June Bell — retired local investigator, helped Claire Vance research the Palmetto Hotel 12 years ago. Appears on phone under duress. ATL-HEADPHONE-001 applies. Permanent voice approved Marc 2026-07-30.',
      'female', 'old', 'american', 0
    ),
    (
      'UNKNOWN MAN',   'UNKNOWN MAN',
      ARRAY['UNKNOWN MAN (THROUGH PHONE)', 'UNKNOWN CALLER'],
      'lKf2tqVafNW1nVb7CgwC', 'Frank',
      'Unknown caller — controlled, cold. Identity unconfirmed. Series constraint (Marc 2026-07-30): if caller revealed as Silas Crowe, Crowe inherits this voice. Not canon until Marc declares it. ATL-HEADPHONE-001 applies. Permanent voice approved Marc 2026-07-30.',
      'male', 'middle_aged', 'american', 0
    )
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
  c.canonical_name,
  c.canonical_name_normalized,
  c.aliases,
  c.voice_id,
  c.voice_name,
  c.description,
  c.gender,
  c.age,
  c.accent,
  c.first_appeared_episode,
  true
FROM cast_rows c
CROSS JOIN bell_series b
ON CONFLICT DO NOTHING;

COMMIT;
