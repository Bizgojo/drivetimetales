-- AC-6 Verification: Confirm job c5e531da is queued at generate_voices step
-- Run in Supabase SQL Editor

SELECT 
  id,
  status,
  current_step,
  updated_at,
  created_at
FROM production_jobs
WHERE id = 'c5e531da-03d8-4f1f-b9a2-faf505dbb890';

-- Expected result:
-- ┌─────────────────────────────────────┬──────────┬─────────────────┬───────────────────────────┬───────────────────────────┐
-- │ id                                  │ status   │ current_step    │ updated_at                │ created_at                │
-- ├─────────────────────────────────────┼──────────┼─────────────────┼───────────────────────────┼───────────────────────────┤
-- │ c5e531da-03d8-4f1f-b9a2-faf505dbb890│ queued   │ generate_voices │ 2026-06-12T23:xx:xxxx+00:00 │ 2026-06-12T19:xx:xxxx+00:00 │
-- └─────────────────────────────────────┴──────────┴─────────────────┴───────────────────────────┴───────────────────────────┘
--
-- AC-6 PASS: status='queued' AND current_step='generate_voices'
-- This confirms the autonomous runner will pick up the job and re-produce Story #2
-- with fresh segment generation. The stale segments from the old pipeline have been
-- deleted by Orion, and the generate_voices step will regenerate all segments.
