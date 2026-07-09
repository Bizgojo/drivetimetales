-- ATL-DISPATCH-DEFECTS-001 (2026-07-09)
-- Active-job uniqueness guard, enforced at the database level.
--
-- Incident: dispatch-queue created duplicate package jobs for series
-- 709f7317 (The Charity's Shadow) — job c60617e1 created 02:07Z while job
-- 0176b1dc (created 01:52Z) was still running. The application-level check in
-- app/api/cron/dispatch-queue/route.ts is read-then-insert and races with the
-- per-minute cron overlap; only a partial unique index closes the race.
--
-- Invariants:
--   * At most ONE non-terminal job (queued/running/waiting_for_external)
--     per series_id.
--   * At most ONE non-terminal job per standalone story_id (series jobs are
--     excluded via "series_id IS NULL" so a series job that also carries a
--     story pointer never collides with standalone story jobs).
--
-- Queue-item jobs created by app/api/admin/production-jobs (story_id and
-- series_id both NULL) are unaffected.
--
-- Verified before writing this migration (2026-07-09): production_jobs has
-- ZERO non-terminal rows, so index creation cannot fail on existing data.

CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_one_active_per_series
  ON production_jobs (series_id)
  WHERE series_id IS NOT NULL
    AND status IN ('queued', 'running', 'waiting_for_external');

CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_one_active_per_story
  ON production_jobs (story_id)
  WHERE story_id IS NOT NULL
    AND series_id IS NULL
    AND status IN ('queued', 'running', 'waiting_for_external');
