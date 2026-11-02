-- The Lake House Summer (series 3aa78de5, job 26e8346e): the cast review
-- found voices of the wrong gender — HOLDEN (a 16-year-old boy) got "Mia",
-- ALMA (a grandmother) got a deep male voice, SIDNEY (male) got "Leandra".
-- Cause: CAST-GENDER-002 (episode 1's guide said "grandmother" / "his", not
-- "male"/"female"). Run only AFTER the webapp runs the commit with that fix.
-- Clears this series' cast (nothing has been recorded) and re-queues the job;
-- it re-casts every episode and sends a fresh cast review to Marc.
begin;
delete from character_voice_assignments where series_id = '3aa78de5-f4a1-4e73-9402-aeed06837ad6';
delete from series_character_roster where series_id = '3aa78de5-f4a1-4e73-9402-aeed06837ad6';
update production_jobs
set status = 'queued',
    state_json = state_json - 'castReview',
    error_json = null,
    locked_at = null,
    locked_by = null,
    updated_at = now()
where id = '26e8346e-a560-461c-83d7-519cb6ffde07'
  and status = 'waiting_for_external'
  and current_step = 'series_generate_voices'
  and coalesce((state_json->'castReview'->>'approvedAt'), '') = '';
commit;
select status, current_step, state_json ? 'castReview' as has_review,
  (select count(*) from series_character_roster where series_id = '3aa78de5-f4a1-4e73-9402-aeed06837ad6') as roster_rows
from production_jobs where id = '26e8346e-a560-461c-83d7-519cb6ffde07';
