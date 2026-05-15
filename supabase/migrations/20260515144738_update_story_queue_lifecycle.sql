ALTER TABLE public.story_queue_items
DROP CONSTRAINT IF EXISTS story_queue_items_status_check;

ALTER TABLE public.story_queue_items
ADD CONSTRAINT story_queue_items_status_check
CHECK (status IN (
  'queued',
  'in_v2',
  'ready_for_asc',
  'published',
  'dispatched',
  'producing',
  'complete',
  'failed',
  'archived'
));

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_jobs_one_active_per_queue_item
ON public.production_jobs(queue_item_id)
WHERE queue_item_id IS NOT NULL
  AND status IN ('queued', 'running', 'waiting_for_external');
