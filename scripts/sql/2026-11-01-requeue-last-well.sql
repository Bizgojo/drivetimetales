-- Re-queue The Last Well after CAST-GUIDE-COMMA-001 (job ecf6c35f failed at
-- EP4: speaker WEAVER not found in the CHARACTER GUIDE after 3 drafts, nothing
-- saved, no audio spend). Episodes 1-3 are kept; writing resumes at EP4.
-- Run only AFTER the webapp is rebuilt and restarted on the commit with the fix.
begin;
update stories set needs_attention = false, needs_attention_reason = null
where series_id = '9bdbe491-4f1b-4a4d-b821-7e9b4b4bb3ff' and episode_number = 4
  and needs_attention_reason like 'WRITER-SELF-CHECK-001%';
update production_jobs
set status = 'queued', error_json = null, locked_at = null, locked_by = null, updated_at = now()
where id = 'ecf6c35f-ac60-452f-a8f8-9a097158e235' and status = 'failed' and current_step = 'generate_episode_script';
commit;
select status, current_step from production_jobs where id = 'ecf6c35f-ac60-452f-a8f8-9a097158e235';
