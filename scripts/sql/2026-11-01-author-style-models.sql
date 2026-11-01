-- AUTHOR-STYLE-001 (Marc 2026-11-01): every active pen-name author gets a
-- real-author model and a style description (style only; never their text).
-- Elena Marsh → Emily Henry was Marc's pick; the others are Claude's proposals
-- for Marc to review. Only fills empty fields; existing values are kept.
begin;
update authors a set
  style_reference   = coalesce(nullif(a.style_reference, ''), v.ref),
  style_description = coalesce(nullif(a.style_description, ''), v.descr),
  updated_at = now()
from (values
  ('Elena Marsh', 'Emily Henry', 'Emily Henry writes contemporary romance in a quick, witty close voice: sharp banter, self-aware humor, emotionally honest backstory revealed in short flashbacks, and a slow-burn pull between two people who misread each other. Short punchy paragraphs, dialogue-forward scenes, modern everyday vocabulary, and a warm, hopeful ending.'),
  ('Clay Warden', 'Fredrik Backman', 'Fredrik Backman writes gentle comedy with a big heart: short declarative sentences, wry repeated observations about a character''s stubborn habits, grief revealed slowly beneath the jokes, and a narrator who speaks with warm irony.'),
  ('Cord Dillard', 'Elmer Kelton', 'Elmer Kelton writes plain-spoken Westerns of working ranch life in West Texas: unadorned, practical prose, accurate detail of cattle, weather and drought, laconic dialogue, quiet moral seriousness, and characters judged by what they do rather than what they say.'),
  ('Leah Camden', 'Tana French', 'Tana French writes atmospheric mysteries: long, rhythmic sentences in a close personal voice, sharp psychological observation, a rich sense of place, conversational dialogue full of subtext, and slowly tightening dread.'),
  ('Nina Vasquez', 'Ted Chiang', 'Ted Chiang writes speculative fiction with calm precision: clear, exact sentences, ideas worked out with scientific care, restrained emotion that lands quietly, and protagonists whose work and thinking drive the story.'),
  ('Gus Pendry', 'W. Bruce Cameron', 'W. Bruce Cameron writes warm, funny family stories: simple, accessible sentences, gentle humor drawn from everyday life, earnest emotion, and an affectionate view of people and their pets.'),
  ('Holland Reese', 'Mitch Albom', 'Mitch Albom writes short, heartfelt stories of family and second chances: very short sentences and scenes, plain words, life lessons voiced by older characters, shifts between past and present, and an emotional, uplifting close.'),
  ('J. Calloway Reid', 'Ron Rash', 'Ron Rash writes Appalachian literary fiction: spare, lyrical sentences rooted in landscape, regional speech in dialogue, a strong sense of history and loss, and violence that arrives quietly and suddenly.'),
  ('Julian Mercer', 'John le Carré, Michael Connelly', 'In the manner of John le Carré and Michael Connelly: procedural precision, morally gray investigators, institutional politics, clipped professional dialogue, and plots built on the patient accumulation of detail.'),
  ('Kira Vance', 'Becky Chambers', 'Becky Chambers writes warm, character-driven science fiction: found-family crews, kind and curious voices, everyday life aboard ships and stations, gentle humor, and conflict resolved through empathy more than violence.')
) as v(name, ref, descr)
where a.name = v.name;
commit;

-- Check: expect 0 rows (every active author has both fields).
select name from authors where is_active and (coalesce(style_reference,'') = '' or coalesce(style_description,'') = '');
