-- PLAY-EVENTS-SERIES-001 backfill. RUN ONLY WITH MARC'S OK (data change on production).
-- Fills series_id / episode_id on existing play_events rows from the stories table.
-- Only touches rows where both are empty and the story belongs to a series.
-- Dry run first: the SELECT shows how many rows would change.

select count(*) as rows_to_fill
from play_events pe join stories s on s.id = pe.story_id
where pe.series_id is null and pe.episode_id is null and s.series_id is not null;

-- update play_events pe
-- set series_id = s.series_id, episode_id = pe.story_id
-- from stories s
-- where s.id = pe.story_id
--   and pe.series_id is null and pe.episode_id is null
--   and s.series_id is not null;
