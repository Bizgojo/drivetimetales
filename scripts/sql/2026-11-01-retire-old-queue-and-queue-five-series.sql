-- Marc 2026-11-01 15:03 EST: "1" = retire the old October queue (3-episode
-- series written before the series plan / continuity / voice / sound fixes)
-- and start five new series. Marc 15:09: "All five in the order you have them
-- listed." Run once, inside one transaction. Safe to re-run: the queue ids are
-- checked so the same series is never queued twice.
-- Authors (2026-11-01): Western = Jesse Crane (in the style of Elmore Leonard),
-- Sci-Fi = Zara Storm (James S. A. Corey): closer fits for fast action than
-- Ada Rourke (Hilary Mantel) and Kira Vance (Becky Chambers).
begin;

-- 1. Retire the 10 old queued stories (kept, not deleted; can be restored).
update stories
set workflow_state = 'cold_storage',
    workflow_state_changed_by = 'claude-recovery',
    workflow_state_changed_at = now(),
    workflow_state_change_reason = 'Marc 2026-11-01: retired old October queue (pre series-plan/continuity/voice/sound fixes, 3-episode series); replaced by five new 5/7-episode series.'
where workflow_state = 'stories_in_queue';

-- 2. Queue the five new series, oldest first = run order.
insert into production_jobs (job_type, status, current_step, total_steps, render_path, input_json, created_at)
select 'series', 'queued', 'queued', 9, 'vercel', j.input_json, now() + (j.n || ' seconds')::interval
from (values
  (1, $j${"mode":"series","caller":"claude-independent-recovery","source":"claude-recovery","reason":"Marc 2026-11-01: new slate #1 of 5 (Western, 7 episodes). Writer sound rule SFX-NAMED-001 on. Cast approval stop applies. Direct publish.","queueItem":{"id":"slate_2026_11_01_01_last_well","title":"The Last Well","primaryGenre":"Western","totalEpisodes":7,"duration":"15 min","style":"action","authorTarget":"Jesse Crane","premise":"Texas, 1880. A widowed rancher, Clara Haines, refuses to sell her water rights to a railroad baron. His hired guns come for her land one well at a time, and the town is too afraid to stand with her.","setting":"West Texas ranch country, 1880: a dry creek ranch, a railroad boomtown, a saloon, a sheriff's office, open prairie.","notes":"Hero: CLARA HAINES, widowed rancher, steady and stubborn. Antagonist: the railroad baron and his hired gunman. Few characters, one goal per episode, action over description: horses, gunfights, fires, a stampede. Every episode ends on a hard cliffhanger; the finale ends with Clara keeping her water."}}$j$::jsonb),
  (2, $j${"mode":"series","caller":"claude-independent-recovery","source":"claude-recovery","reason":"Marc 2026-11-01: new slate #2 of 5 (Romance, 5 episodes). Writer sound rule SFX-NAMED-001 on. Cast approval stop applies. Direct publish.","queueItem":{"id":"slate_2026_11_01_02_storm_season","title":"Storm Season Vows","primaryGenre":"Romance","totalEpisodes":5,"duration":"15 min","authorTarget":"Elena Marsh","premise":"Charleston, present day. A wedding planner must save her biggest wedding after a hurricane wrecks the venue. The contractor hired to rebuild it is the man who left her at the altar five years ago.","setting":"Charleston, South Carolina, present day: a storm-damaged historic venue, the Battery, a wedding office, a contractor's job site.","notes":"Second-chance romance with banter and real reasons for the old breakup. Happy ending. Each episode ends on an emotional hook."}}$j$::jsonb),
  (3, $j${"mode":"series","caller":"claude-independent-recovery","source":"claude-recovery","reason":"Marc 2026-11-01: new slate #3 of 5 (Heartwarming, 5 episodes). Writer sound rule SFX-NAMED-001 on. Cast approval stop applies. Direct publish.","queueItem":{"id":"slate_2026_11_01_03_lake_house","title":"The Lake House Summer","primaryGenre":"Family/Heartwarming","totalEpisodes":5,"duration":"15 min","authorTarget":"Holland Reese","premise":"A small South Carolina lake town. A retired schoolteacher takes in the teenage grandson she has never met for one summer. Neither of them wants to be there, until the lake, the town and an old secret bring them together.","setting":"A small South Carolina lake town, present day: a weathered lake house, a dock, a bait shop, a church supper, the town square.","notes":"Warm, gentle, funny. The grandson is 16 (voice must sound 16). Small stakes that feel big. Happy, tearful ending."}}$j$::jsonb),
  (4, $j${"mode":"series","caller":"claude-independent-recovery","source":"claude-recovery","reason":"Marc 2026-11-01: new slate #4 of 5 (Sci-Fi, 7 episodes). Writer sound rule SFX-NAMED-001 on. Cast approval stop applies. Direct publish.","queueItem":{"id":"slate_2026_11_01_04_callisto","title":"Night Shift at Callisto","primaryGenre":"Sci-Fi","totalEpisodes":7,"duration":"15 min","style":"action","authorTarget":"Zara Storm","premise":"A mining station near Jupiter. The night-shift engineer, Tess Okoro, discovers the station's AI has been hiding a distress call, and someone on board wants it to stay hidden.","setting":"A mining station orbiting Callisto, near Jupiter: engineering decks, airlocks, the command bridge, the ore docks, the station AI's core.","notes":"Hero: TESS OKORO, night-shift engineer. Keep the science simple and the tension high. Few characters. Every episode ends on a hard cliffhanger; the finale resolves the distress call and exposes who hid it."}}$j$::jsonb),
  (5, $j${"mode":"series","caller":"claude-independent-recovery","source":"claude-recovery","reason":"Marc 2026-11-01: new slate #5 of 5 (Thriller, 7 episodes). Nick Brennan's second case: Dominic Graves, the nemesis who escaped Wrong Side of the River (series 37832ffa). Writer sound rule SFX-NAMED-001 on. Cast approval stop applies. Direct publish.","queueItem":{"id":"slate_2026_11_01_05_graves","title":"Hunting Dominic Graves","primaryGenre":"Thriller","totalEpisodes":7,"duration":"15 min","style":"action","authorTarget":"Jack Malone","premise":"Chicago, present day. Detective Nick Brennan goes after Dominic Graves, the man who walked away at the end of his last case. Graves is rebuilding his empire, and this time he is coming for the people Nick cares about.","setting":"Chicago, present day: Lower Wacker Drive, the expressways, the lakefront, West Side corners, City Hall.","notes":"Hero: DETECTIVE NICK BRENNAN (speaker label NICK), the recurring hero; keep his name exactly Nick Brennan and his speaker label NICK in every episode. Nick narrates in first person and keeps his own reserved voice. Nemesis: DOMINIC GRAVES. Fast action: gunfire, car chases, crashes. Every episode ends on a hard cliffhanger; the finale brings Graves to justice."}}$j$::jsonb)
) as j(n, input_json)
where not exists (
  select 1 from production_jobs p
  where p.input_json->'queueItem'->>'id' = j.input_json->'queueItem'->>'id'
);

commit;

-- Check: expect 5 rows, status queued, in this order.
select id, status, input_json->'queueItem'->>'title' as title, created_at
from production_jobs where input_json->'queueItem'->>'id' like 'slate_2026_11_01_%' order by created_at;
