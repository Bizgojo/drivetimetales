-- PIPE-AUDIT-001 item 4: per-story dispatch retry-cap reset with audit trail.
-- When a human clears a needs_attention flag through the sanctioned
-- content-approval clear_needs_attention action, dispatch_failure_reset_at is
-- stamped and the dispatch-queue retry cap ignores failed jobs older than it.
-- This prevents infra-era failures (whose causes are already fixed) from
-- re-blocking stories for the remainder of the 7-day window.

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS dispatch_failure_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_failure_reset_by TEXT;

COMMENT ON COLUMN stories.dispatch_failure_reset_at IS
  'Failed production_jobs at/before this time are excluded from the dispatch retry cap. Set only via content-approval clear_needs_attention.';
COMMENT ON COLUMN stories.dispatch_failure_reset_by IS
  'Actor that performed the retry-cap reset (audit trail).';
