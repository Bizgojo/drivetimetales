-- Add stories_in_queue to workflow_state check constraint
ALTER TABLE stories DROP CONSTRAINT stories_workflow_state_check;

ALTER TABLE stories ADD CONSTRAINT stories_workflow_state_check 
  CHECK (workflow_state IN ('cold_storage', 'ready_for_review', 'approved_ready', 'published', 'repair_queue', 'stories_in_queue'));
