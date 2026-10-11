-- Atlas Gap-1 build (Marc decisions 2026-10-11 16:37 EDT)
--   gap1-blueprint-table-oct11-1637  -> NEW dedicated approval table
--   gap1-token-mint-oct11-1637       -> token reference recorded in SAME step as approval write
--   gap1-audit-table-oct11-1637      -> NEW dedicated audit table for story-less queue items
--
-- FEATURE BRANCH ONLY. NEVER applied to the production DB by this task.
-- Tier-2 note: this migration creates new tables on the feature branch;
-- production apply (Supabase, Marc/operator) happens only after independent
-- diff review + Lyra review + Marc explicit approval.
--
-- Table 1: story_blueprint_approvals
--   The approval record POST /api/admin/story-queue/dispatch verifies
--   server-side before authorizing any queue item. Replaces the B-1 stub.
-- Table 2: story_queue_dispatch_audit
--   Append-only audit for authorize/dispatch actions. Deliberately carries
--   NO foreign key to stories(id): story-less queue items (the common
--   Strategos case — no story row exists yet) must still get an audit row.
--   (Resolves Lyra D2: story_workflow_audit.story_id is NOT NULL, so it
--   cannot hold story-less rows. production_jobs.input_json remains the
--   basis-of-record copy; this table is the queryable audit trail.)
--
-- Access: service-role only (same as story_queue_items / production_jobs
-- dispatch path). No RLS policies: no anon/authenticated caller may read or
-- write these tables; all access goes through the bearer-gated admin routes
-- using SUPABASE_SERVICE_ROLE_KEY.

CREATE TABLE IF NOT EXISTS story_blueprint_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id     TEXT NOT NULL REFERENCES story_queue_items(id) ON DELETE CASCADE,
  series_id         UUID NULL,
  blueprint_ref     TEXT NOT NULL,
  blueprint_payload JSONB NULL,
  approved_by       TEXT NOT NULL,
  approved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'revoked', 'superseded')),
  -- Opaque reference to the minted service-token record (e.g. key id /
  -- vault pointer supplied by Marc at mint time). NEVER key material:
  -- the approval handler stores exactly the caller-supplied string and
  -- generates nothing. Marc mints STRATEGOS_SERVICE_TOKEN out-of-band.
  token_ref         TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active approval per (queue item, blueprint ref). History is preserved
-- via status transitions (revoked/superseded rows remain readable).
CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_approvals_one_active
  ON story_blueprint_approvals (queue_item_id, blueprint_ref)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_blueprint_approvals_ref
  ON story_blueprint_approvals (blueprint_ref, status);

CREATE INDEX IF NOT EXISTS idx_blueprint_approvals_queue_item
  ON story_blueprint_approvals (queue_item_id);

CREATE TABLE IF NOT EXISTS story_queue_dispatch_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL
    CHECK (action IN (
      'blueprint_approved',
      'token_recorded',
      'authorized',
      'dispatched',
      'dispatch_rejected',
      'approval_revoked'
    )),
  queue_item_id TEXT NOT NULL,
  blueprint_ref TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_queue_item
  ON story_queue_dispatch_audit (queue_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_action
  ON story_queue_dispatch_audit (action, created_at DESC);
