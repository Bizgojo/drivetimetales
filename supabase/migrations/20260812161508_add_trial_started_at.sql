-- GATE-PROTECT-001 (2026-08-12)
-- Tracks when each user first started their free trial.
-- The invite-signup route uses trial_started_at to detect whether an existing
-- user has already consumed their one free trial (case b) before granting a
-- new one. Without this column the gate overwrote subscription_type/ends_at
-- unconditionally, risking downgrade of active (paying) subscribers.
--
-- DO NOT RUN directly — Marc runs all migrations.
-- File written by Orion subagent, reviewed by Marc before execution.

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- Backfill: any user who already has subscription_ends_at set has had a trial.
-- Use created_at as the best available approximation for when the trial started.
-- This prevents existing lapsed users from being granted a second trial through
-- the gate after the migration runs.
--
-- Row count query (run before executing to confirm scope):
--   SELECT count(*) FROM users WHERE subscription_ends_at IS NOT NULL AND trial_started_at IS NULL;
--
-- Expected: covers all current trial/lapsed/active users (approx 81 rows total
-- as of 2026-08-12; exact count depends on how many have subscription_ends_at set).

UPDATE users
SET trial_started_at = created_at
WHERE subscription_ends_at IS NOT NULL
  AND trial_started_at IS NULL;
