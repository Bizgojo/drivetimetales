-- AUTHOR-WRITTEN-EXEMPT-001 (Marc commission 2026-11-03)
-- Series-level author-written flag. Defaults false (today's behavior).
-- Set true on Sunset (e9f3ff76-9401-4bf5-bf5a-36d83b5398f7) only.
-- Scoped build only: apply on deploy approval, never ad hoc.

ALTER TABLE series
  ADD COLUMN IF NOT EXISTS author_written BOOLEAN NOT NULL DEFAULT false;

UPDATE series
  SET author_written = true
  WHERE id = 'e9f3ff76-9401-4bf5-bf5a-36d83b5398f7'::uuid;
