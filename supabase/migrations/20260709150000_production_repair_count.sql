-- ATL-FOLLOWUP-002 (Marc ruling 2026-07-09): repair-bucket doctrine.
--
-- Doctrine: ONE technical repair pass per story. A story that has already
-- consumed its repair pass (production_repair_count >= 1) and production-fails
-- again goes straight to cold_storage with an audit reason
-- ("one repair pass only; second production failure = cold storage").
--
-- The counter increments only when a story leaves the production-holds bucket
-- (repair_queue / being_repaired) after a TECHNICAL REPAIR that changed the
-- story record. Pipeline-defect releases — our bugs, where a code fix
-- unblocked the story and the story record itself was never repaired — must
-- NOT increment the counter (see shouldIncrementRepairCount in
-- lib/workflowTransitions.ts).
--
-- NOTE (two-phase plan): the DB state value remains 'repair_queue' in this
-- work order; consoles display it as "Production Holds". The DB rename is a
-- later migration now that migration history is repaired (PIPE-AUDIT-001).

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS production_repair_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN stories.production_repair_count IS
  'Technical repair passes consumed. Incremented when the story leaves the production-holds bucket (repair_queue/being_repaired) after a repair that changed the story record; pipeline-defect releases (code fix unblocked it) do not count. Doctrine (Marc 2026-07-09): one repair pass only — count >= 1 plus another production failure => cold_storage.';
