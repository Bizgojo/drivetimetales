-- 20261005180000_add_reach_reminder_and_email_opt_out.sql
-- REACH-REMINDERS-001 (Marc GO, 2026-10-05)
--
-- PURPOSE: Two additive columns on `users` to support the EP2-reach reminder
-- emails extended into app/api/cron/trial-emails:
--
--   1. last_reach_reminder_at  — timestamp of the most recent reach-reminder
--      send. Gates re-sends (idempotency / no-double-send on cron retry) and
--      doubles as the attribution window anchor ("reached within 48h of a
--      reach email"). NULL = never sent a reach reminder.
--
--   2. email_opt_out — CAN-SPAM unsubscribe flag. When true, the user is
--      suppressed from ALL Belle marketing/retention email (the new reach
--      reminders AND the existing trial day-1/2/5/6 sends). Set true by the
--      one-click unsubscribe endpoint (app/api/email/unsubscribe) and honored
--      by app/api/cron/trial-emails on every send path.
--
-- PRE-DDL-SAFETY: the cron (app/api/cron/trial-emails/route.ts) is written so
-- that if either column is absent at runtime (migration not yet applied), it
-- logs and skips the affected behavior WITHOUT crashing the live trial/day-1
-- sends. This migration therefore RIDES the PR and is designed to be applied
-- AFTER merge. Follows the idempotent pattern of
-- 20260826000000_add_signup_session_id.sql.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reach_reminder_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;

-- Partial index — reach-reminder cohort queries filter on the small set of
-- rows that have actually been reminded (WHERE last_reach_reminder_at IS NOT
-- NULL). Sparse index keeps write overhead negligible for the common NULL case.
CREATE INDEX IF NOT EXISTS users_last_reach_reminder_at_idx
  ON users(last_reach_reminder_at)
  WHERE last_reach_reminder_at IS NOT NULL;

-- Partial index — suppression lookups ("is this user opted out?") and the
-- rare "list opted-out users" admin query. Only the opted-out minority is
-- indexed; the default-false majority stays out of the index.
CREATE INDEX IF NOT EXISTS users_email_opt_out_idx
  ON users(email_opt_out)
  WHERE email_opt_out = true;
