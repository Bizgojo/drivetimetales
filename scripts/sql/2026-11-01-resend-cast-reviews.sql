-- CAST-REVIEW-LINKS-001: the cast reviews for The Last Well (ecf6c35f) and
-- The Lake House Summer (26e8346e) reached nobody (TELEGRAM_BOT_TOKEN not set
-- on the server). Run AFTER the webapp runs the commit with CAST-REVIEW-LINKS-001.
-- Re-queues each job that is still waiting for approval; the cast itself is
-- kept (same voices). The review re-runs, saves every clip in storage, and the
-- read-back below then lists one link per voice under each story's title.
begin;
update production_jobs
set status = 'queued',
    state_json = state_json - 'castReview',
    error_json = null,
    locked_at = null,
    locked_by = null,
    updated_at = now()
where id in ('ecf6c35f-ac60-452f-a8f8-9a097158e235', '26e8346e-a560-461c-83d7-519cb6ffde07')
  and status = 'waiting_for_external'
  and current_step = 'series_generate_voices'
  and coalesce(state_json->'castReview'->>'approvedAt', '') = '';
commit;
select id, status, current_step from production_jobs
where id in ('ecf6c35f-ac60-452f-a8f8-9a097158e235', '26e8346e-a560-461c-83d7-519cb6ffde07');
-- After each job parks again (a few minutes), list the links per story:
-- select state_json->'castReview'->>'seriesTitle' as story, i->>'n' as n, i->>'name' as character, i->>'voiceName' as voice, i->>'clipUrl' as clip
-- from production_jobs, jsonb_array_elements(state_json->'castReview'->'items') i
-- where id in ('ecf6c35f-ac60-452f-a8f8-9a097158e235', '26e8346e-a560-461c-83d7-519cb6ffde07') order by 1, (i->>'n')::int;
