-- 20260826000000_add_signup_session_id.sql
--
-- PURPOSE: Record the go_listen_events.session_id that was active when a user
-- submitted the Bell invitation gate (wall_submit event). This enables the
-- analytics routes to exclude test-account sessions from go_listen_events
-- dashboards via a join on signup_session_id <-> go_listen_events.session_id.
--
-- Without this column, is_test_account lives only on users and cannot be used
-- to filter go_listen_events rows (which carry only session_id, not user_id).
--
-- The column is written at signup time (app/api/go/invite-signup/route.ts) and
-- backfilled for existing users via scripts/backfill-signup-session-id.js.

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_session_id UUID;

-- Partial index — only non-NULL rows need to be indexed (most lookups are:
-- "give me all test-account session IDs" → WHERE is_test_account = true AND
-- signup_session_id IS NOT NULL). Sparse index keeps overhead minimal.
CREATE INDEX IF NOT EXISTS users_signup_session_id_idx
  ON users(signup_session_id)
  WHERE signup_session_id IS NOT NULL;
