-- The Last Well (job ecf6c35f): all 7 episodes are written, but the series
-- continuity check failed on episode 2 after its 2 automatic rewrites:
-- the deed fight at the county land office is won in episode 2 AND staged
-- again from scratch in episode 3. The reviewer's fix is specific (episode 2
-- stops at "Merrick has the deed"; episode 3 resolves it for the first time).
-- This gives episode 2 one more automatic rewrite round (it and the later
-- episodes are rewritten with that fix list). No audio spend — writing only.
-- Marc approved re-running (Nov 1, 2026).
begin;
update production_jobs
set status = 'queued',
    error_json = null,
    locked_at = null,
    locked_by = null,
    state_json = jsonb_set(state_json, '{seriesRewrite,counts}', (state_json->'seriesRewrite'->'counts') - '2'),
    updated_at = now()
where id = 'ecf6c35f-ac60-452f-a8f8-9a097158e235'
  and status = 'failed'
  and current_step = 'score_validate_package';
commit;
select status, current_step, state_json->'seriesRewrite'->'counts' as rewrite_counts
from production_jobs where id = 'ecf6c35f-ac60-452f-a8f8-9a097158e235';
