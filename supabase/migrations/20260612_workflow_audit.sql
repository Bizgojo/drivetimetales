-- Migration: workflow state audit trail
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS workflow_state_changed_by   TEXT,
  ADD COLUMN IF NOT EXISTS workflow_state_changed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_state_change_reason TEXT;

-- Transition audit log (append-only)
CREATE TABLE IF NOT EXISTS story_workflow_audit (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  from_state      TEXT,
  to_state        TEXT NOT NULL,
  changed_by      TEXT NOT NULL,  -- 'orion', 'atlas', 'admin', 'pipeline', 'system'
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT,
  session_context TEXT           -- optional: agent session id or job id for traceability
);

CREATE INDEX IF NOT EXISTS idx_story_workflow_audit_story_id ON story_workflow_audit(story_id);
CREATE INDEX IF NOT EXISTS idx_story_workflow_audit_changed_at ON story_workflow_audit(changed_at DESC);
