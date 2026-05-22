-- Add workflow_state to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS workflow_state TEXT;

-- Populate from existing review_status + is_hidden + status
UPDATE stories SET workflow_state =
  CASE
    WHEN status = 'published' AND is_hidden = false THEN 'published'
    WHEN status = 'published' AND is_hidden = true  THEN 'unpublished_library'
    WHEN review_status = 'approved'                 THEN 'approved_ready'
    WHEN review_status = 'not_approved'             THEN 'cold_storage'
    ELSE 'ready_for_review'
  END
WHERE workflow_state IS NULL;

-- Add repair_checklist for storing selected repair items
ALTER TABLE stories ADD COLUMN IF NOT EXISTS repair_checklist JSONB;

-- Add repair_notes for repair-specific notes
ALTER TABLE stories ADD COLUMN IF NOT EXISTS repair_notes TEXT;

-- Add workflow constraint
ALTER TABLE stories ADD CONSTRAINT stories_workflow_state_check
  CHECK (workflow_state IN (
    'ready_for_review',
    'approved_ready',
    'repair_queue',
    'being_repaired',
    'unpublished_library',
    'cold_storage',
    'published'
  ));
