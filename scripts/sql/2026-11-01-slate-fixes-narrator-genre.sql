-- Slate fixes (2026-11-01 ~15:45 EST), flagged marc_required by Orion:
-- 1. Storm Season Vows failed: "Author Elena Marsh is missing narrator_id".
--    Assign Sage Wilder ("playful yet grounded — bright warmth"). Marc hears
--    and approves the cast before any recording (CAST-REVIEW-001).
-- 2. The Lake House Summer failed: "No active author for genre
--    Family/Heartwarming" — authors' primary_genre is "Heartwarming". Fix the
--    job's primaryGenre. Both jobs failed at create_story_row before any row
--    or spend, so re-queueing them is safe.
begin;

update authors set narrator_id = '76f37ec7-7736-4019-91d1-174b11fe1b6f', updated_at = now()
where name = 'Elena Marsh' and narrator_id is null;

update production_jobs
set status = 'queued', current_step = 'queued', error_json = null, locked_at = null, locked_by = null, updated_at = now()
where input_json->'queueItem'->>'id' = 'slate_2026_11_01_02_storm_season' and status = 'failed';

update production_jobs
set input_json = jsonb_set(input_json, '{queueItem,primaryGenre}', '"Heartwarming"'),
    status = 'queued', current_step = 'queued', error_json = null, locked_at = null, locked_by = null, updated_at = now()
where input_json->'queueItem'->>'id' = 'slate_2026_11_01_03_lake_house' and status = 'failed';

commit;

-- Check: expect Elena Marsh with a narrator, and both jobs queued.
select name, narrator_id from authors where name = 'Elena Marsh';
select input_json->'queueItem'->>'title' title, input_json->'queueItem'->>'primaryGenre' genre, status
from production_jobs where input_json->'queueItem'->>'id' in ('slate_2026_11_01_02_storm_season','slate_2026_11_01_03_lake_house');
