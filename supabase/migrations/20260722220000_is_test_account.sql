-- ATL-TESTUSER-001 (Marc, 2026-07-22): permanently flag Marc's test/own
-- accounts so they never pollute conversion analytics or funnel metrics.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

-- Index: analytics queries that exclude test accounts benefit from a partial index
CREATE INDEX IF NOT EXISTS idx_users_not_test
  ON users (id)
  WHERE is_test_account = FALSE;

-- Flag Marc's three known accounts
UPDATE users
SET is_test_account = TRUE
WHERE email IN (
  'marc@endless-tales.com',
  'm.postlewaite@gmail.com',
  'm.postlewaite+t1@gmail.com'
);
