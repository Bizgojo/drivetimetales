-- ============================================================
-- PROPOSED MIGRATION: cfo_reports table
-- Status: PROPOSAL — DO NOT RUN without Marc's explicit approval
-- PR: feat/cfo-morning-report
-- Purpose: Stores daily CFO Morning Report JSON for dashboard access
--          and idempotent delivery tracking
-- ============================================================

-- Create the cfo_reports table
CREATE TABLE IF NOT EXISTS cfo_reports (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date   date          NOT NULL UNIQUE,
  report_json   jsonb         NOT NULL,
  delivered_at  timestamptz,
  created_at    timestamptz   DEFAULT now()
);

-- Index for fast date-based lookups
CREATE INDEX IF NOT EXISTS cfo_reports_report_date_idx ON cfo_reports (report_date DESC);

-- Row-level security: service role can read/write, authenticated admin users can read
ALTER TABLE cfo_reports ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for automated report storage)
CREATE POLICY "service_role_full_access" ON cfo_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read reports (admin check done at API/page level)
CREATE POLICY "authenticated_read" ON cfo_reports
  FOR SELECT
  TO authenticated
  USING (true);

-- Comment
COMMENT ON TABLE cfo_reports IS 'Daily CFO Morning Reports — JSON blob per day, delivered to Marc via Telegram at 7am ET';
COMMENT ON COLUMN cfo_reports.report_date IS 'Calendar date of the report (UNIQUE — one per day)';
COMMENT ON COLUMN cfo_reports.report_json IS 'Full structured report JSON from compile.ts';
COMMENT ON COLUMN cfo_reports.delivered_at IS 'When the Telegram message was sent — NULL means not yet delivered';
