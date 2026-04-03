-- ============================================================
-- CREATOR ECOSYSTEM MIGRATION
-- Authors, Narrators, Follows
-- Endless Tales · April 2026
-- ============================================================

-- ── 1. Extend narrator_voices ────────────────────────────────
ALTER TABLE narrator_voices
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;

-- ── 2. Extend authors ────────────────────────────────────────
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS narrator_id UUID REFERENCES narrator_voices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;

-- ── 3. user_follows table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_follows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('author', 'narrator')),
  entity_id     UUID NOT NULL,
  followed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, entity_type, entity_id)
);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON user_follows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "follows_insert" ON user_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "follows_delete" ON user_follows FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_follows_user ON user_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_entity ON user_follows(entity_type, entity_id);

-- ── 4. Seed narrator bios + follower counts ──────────────────
-- James · warm · british · male
UPDATE narrator_voices SET
  bio = 'James has been telling stories his whole life — first in cramped theatres off the West End, then in recording studios across London and New York. His voice carries the weight of a man who has read everything and forgotten nothing. Listeners describe it as sitting by a fire with the most interesting person in the room.',
  follower_count = 6240
WHERE voice_id = 'JBFqnCBsd6RMkjVDRZzb';

-- Cole · dark · american · male
UPDATE narrator_voices SET
  bio = 'Cole grew up in rural Kentucky where the dark came early and the stories got strange. He spent a decade in radio before finding his true calling in audio fiction — voices that make you check the lock on your door. He does not narrate horror. He inhabits it.',
  follower_count = 7810
WHERE voice_id = 'nPczCjzI2devNBz1zQrb';

-- Marcus · crisp · british · male
UPDATE narrator_voices SET
  bio = 'Marcus spent fifteen years as a documentary narrator for the BBC before moving into audio drama. His precision is legendary — every word placed like a chess piece. He believes a great narrator should be invisible, leaving only the story behind.',
  follower_count = 4120
WHERE voice_id = 'onwK4e9ZLuTAKqWW03F9';

-- Finn · warm · australian · male
UPDATE narrator_voices SET
  bio = 'Finn learned to tell stories crossing the Nullarbor with his father, a long-haul trucker who kept the cab alive with yarns. He has carried that energy into every adventure story he narrates — forward momentum, wide skies, and a voice that makes you feel like anything is possible.',
  follower_count = 3890
WHERE voice_id = 'IKne3meq5aSn9XLyUdCD';

-- Elliott · intimate · american · male
UPDATE narrator_voices SET
  bio = 'Elliott is the kind of narrator you forget is there — until you realize an hour has passed and you have not moved. He reads slowly, deliberately, with the patience of someone who knows the ending is worth waiting for. His listeners call him the grandfather they always wanted.',
  follower_count = 5530
WHERE voice_id = 'pqHfZKP75CvOlQylNhV4';

-- Ray · dark · american · male
UPDATE narrator_voices SET
  bio = 'Ray has a voice that has seen things. Spent years narrating true crime before the weight of real stories got too heavy. He moved to fiction and brought everything with him — the grit, the skepticism, the sense that the world is beautiful and brutal in equal measure.',
  follower_count = 6970
WHERE voice_id = 'CwhRBWXzGAHq8TQ4Fs17';

-- Clara · crisp · british · female
UPDATE narrator_voices SET
  bio = 'Clara trained at RADA and spent a decade on stage before discovering that audio drama was the purest form of acting — no costume, no lighting, just voice and truth. She brings a surgical intelligence to every story she narrates, laying clues with the precision of a master jeweler.',
  follower_count = 8340
WHERE voice_id = 'Xb7hH8MSUJpSbSDYk0k2';

-- Nora · warm · american · female
UPDATE narrator_voices SET
  bio = 'Nora has the kind of voice that makes complicated things feel simple. A former professor of literature who stumbled into audio production and never looked back, she narrates with the authority of someone who has spent decades thinking about why stories matter.',
  follower_count = 5720
WHERE voice_id = 'XrExE9yKIg1WjnnlVkGX';

-- June · intimate · british · female
UPDATE narrator_voices SET
  bio = 'June trained in classical theatre but found her real home in the dark — horror, gothic romance, stories that live in the shadows between what is said and what is felt. Her voice is velvet over something dangerous. Listeners say she reads like a secret being told only to them.',
  follower_count = 7130
WHERE voice_id = 'pFZP5JQG7iQjIQuC4Bku';

-- Sage · warm · american · female
UPDATE narrator_voices SET
  bio = 'Sage is the narrator who makes you laugh and then breaks your heart before you realize what happened. She came up through improv comedy in Chicago before pivoting to audio fiction, and she brings that instinct for rhythm and surprise to everything she touches.',
  follower_count = 4680
WHERE voice_id = 'cgSgspJ2msm6clMCkdW9';

-- Morgan · neutral · american
UPDATE narrator_voices SET
  bio = 'Morgan does not perform stories. Morgan becomes them. Working across science fiction, literary drama, and psychological horror, they bring a stillness to the microphone that pulls listeners into a kind of trance. The best compliment Morgan ever received: I forgot I was driving.',
  follower_count = 5240
WHERE voice_id = 'SAz9YHcvj6GT2YYXdXww';

-- Quinn · warm · american · female
UPDATE narrator_voices SET
  bio = 'Quinn discovered audio drama by accident — a borrowed pair of headphones, a long flight, a story that made her laugh out loud in the middle of coach. She vowed to do that for other people. Her narration is warm, quick, and full of the joy of someone who cannot believe this is her job.',
  follower_count = 4320
WHERE voice_id = 'FGY2WhTYpPnrIDTdsKH5';

-- ── 5. Seed all 33 authors ───────────────────────────────────
-- We INSERT authors first, then UPDATE narrator_id in a second pass
-- using subqueries so order does not matter.

-- MYSTERY (Clara)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Vera Blackwood',
  'An Endless Tales original voice - sharp, cinematic, and deeply human',
  'Mystery',
  'Vera Blackwood grew up in the Pacific Northwest, where the rain never quite stopped and everyone seemed to be hiding something. She began writing mystery fiction in her late twenties after a career in forensic consulting that she refuses to discuss in detail. Her stories are precise, atmospheric, and end in ways that feel both inevitable and impossible to predict. She lives alone with two cats and an alarming number of unsolved cold case files.',
  'Precise scene-setting, morally complex characters, endings that reframe everything that came before',
  'Let silence carry the weight. Vera stories breathe in the pauses.',
  true,
  2847
),
(
  'Declan Marsh',
  'Dublin-born crime writer with a gift for unreliable narrators',
  'Mystery',
  'Declan Marsh was a detective in Dublin for eleven years before a bad case and a good therapist convinced him to write about crime instead of investigating it. His debut story for Endless Tales drew on cases he still cannot talk about publicly. He writes from a converted fishing shed on the west coast of Ireland, which has no reliable internet and very reliable whiskey.',
  'Unreliable narrators, layered timelines, dialogue that hides as much as it reveals',
  'The accent stays. The ambiguity stays. Clara makes it sing.',
  true,
  1923
),
(
  'Iris Fontaine',
  'Southern gothic mystery with roots in New Orleans folklore',
  'Mystery',
  'Iris Fontaine was raised in New Orleans by a grandmother who believed in ghosts and a grandfather who believed in evidence. She has never resolved that contradiction, and it shows in every story she writes. Her mysteries live in the space between the rational and the uncanny, where the solution is always logical and never quite feels like enough.',
  'Atmospheric dread, folklore underpinning, reveals that feel like inevitability',
  'New Orleans deserves its own soundtrack. The city is a character.',
  true,
  2140
)
ON CONFLICT (name) DO NOTHING;

-- HORROR (Cole)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Silas Graves',
  'Psychological horror rooted in ordinary American dread',
  'Horror',
  'Silas Graves grew up in a small town in rural Ohio that he describes as the kind of place where nothing happens until something terrible does. He writes horror that starts in the mundane — a strange neighbor, an odd sound, a child who knows too much — and escalates with merciless patience. He works nights, sleeps days, and says he prefers it that way.',
  'Slow-burn dread, domestic settings made terrifying, protagonists who rationalize too long',
  'Cole reads Silas the way Silas hears the stories in his own head. It is unsettling.',
  true,
  4210
),
(
  'Maren Holloway',
  'Cosmic horror and body horror with a literary edge',
  'Horror',
  'Maren Holloway has a PhD in comparative mythology and uses it to make people afraid of very old things. Her horror draws on folklore from cultures across the world — the monsters that predate language, the fears that are older than civilization. She writes with the precision of an academic and the instincts of someone who has been genuinely terrified.',
  'Mythological scaffolding, body horror, the horror of scale and insignificance',
  'The words do the work. Cole just has to not flinch.',
  true,
  3870
),
(
  'Theo Wicks',
  'Horror-comedy hybrid - laughing so you do not scream',
  'Horror',
  'Theo Wicks spent a decade writing for sketch comedy before realizing his darkest material was his best. His horror stories are funny in the way that only things that are also deeply wrong can be funny. He has been described as what you would get if you put Shirley Jackson and Christopher Guest in a room together. He takes this as a compliment.',
  'Tonal whiplash, comic timing weaponized as dread, protagonists who deserve what they get',
  'The laughs make the horror land harder. Do not let Cole smile too early.',
  true,
  2960
)
ON CONFLICT (name) DO NOTHING;

-- THRILLER (June)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Nadia Cross',
  'International espionage thriller - morally grey, always moving',
  'Thriller',
  'Nadia Cross will not confirm or deny that she has worked for any government in any capacity. What she will confirm is that her thrillers are meticulously researched, that she has visited every location she writes about, and that she changes certain details for reasons she cannot explain. She writes fast, edits ruthlessly, and trusts her readers to keep up.',
  'Relentless pacing, tradecraft authenticity, moral complexity with no easy exits',
  'June makes the danger feel personal. That is exactly right.',
  true,
  5630
),
(
  'Roman Steele',
  'Domestic thriller - the enemy is always closer than you think',
  'Thriller',
  'Roman Steele was a family therapist for twelve years before starting to write fiction. His thrillers are set in homes, marriages, and workplaces — the places where people are most themselves and most vulnerable. He writes antagonists with genuine empathy, which makes them far more frightening than any stranger could be.',
  'Close-quarters tension, psychological manipulation, reveals that recontextualize everything',
  'June whispers these stories. That is the right instinct.',
  true,
  4180
),
(
  'Petra Vane',
  'Legal and financial thriller with razor-sharp plotting',
  'Thriller',
  'Petra Vane practiced corporate law for eight years before concluding that fiction was more honest than contracts. Her thrillers live inside institutions — law firms, banks, hospitals — and expose the violence that happens when systems designed to protect people are turned against them. She plots her stories like a brief: airtight, documented, devastating.',
  'Institutional corruption, procedural authenticity, quiet rage expressed through plot',
  'The stakes feel real because they are real. June keeps it cold until it explodes.',
  true,
  3720
)
ON CONFLICT (name) DO NOTHING;

-- WESTERN (Ray)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Buck Callahan',
  'Classic Western with moral weight and landscape that breathes',
  'Western',
  'Buck Callahan was raised on a working cattle ranch in New Mexico and spent his twenties as a wilderness guide before discovering that the stories he told around campfires were worth writing down. His Westerns are grounded in the physical reality of the land — the heat, the distance, the cost of surviving in a place that does not care if you do.',
  'Landscape as character, laconic dialogue, moral codes tested to breaking point',
  'Ray was born for this. Do not over-produce. Let the silences breathe.',
  true,
  3140
),
(
  'Ada Rourke',
  'Revisionist Western - the stories history forgot to tell',
  'Western',
  'Ada Rourke grew up reading Westerns and spending her summers furious at who was missing from them. She writes the West that existed alongside the myth — the women, the Indigenous communities, the Chinese railroad workers, the Black cowboys — with the same genre thrills and moral seriousness the stories always deserved.',
  'Revisionist history, ensemble casts, genre conventions interrogated and rebuilt',
  'Ray reads Ada with respect. That is the right register.',
  true,
  2680
),
(
  'Jesse Crane',
  'Weird West - where the frontier meets the supernatural',
  'Western',
  'Jesse Crane cannot decide if he writes Westerns or horror, so he writes both at the same time. His stories are set on a frontier where the supernatural is as real as drought and distance — where the things that go wrong are not always human. He cites Cormac McCarthy and H.P. Lovecraft as equal influences, which should tell you everything.',
  'Genre fusion, supernatural escalation, frontier isolation as existential dread',
  'Ray makes the weird feel earned. The landscape explains the strangeness.',
  true,
  2390
)
ON CONFLICT (name) DO NOTHING;

-- SCI-FI (Marcus)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Lyra Chen',
  'Hard sci-fi with deep human stakes',
  'Sci-Fi',
  'Lyra Chen has a background in astrophysics and a conviction that the most interesting scientific questions are also the most human ones. Her stories are scientifically rigorous and emotionally devastating in equal measure. She writes about what happens to people — not just civilizations — when the universe stops behaving the way they expected.',
  'Scientific accuracy as narrative foundation, intimate scale within vast settings, grief as a through-line',
  'Marcus gives the science authority. The emotion does the rest.',
  true,
  4560
),
(
  'Otto Finch',
  'Near-future sci-fi rooted in technology we almost have',
  'Sci-Fi',
  'Otto Finch worked in Silicon Valley for a decade before leaving to write fiction about the things he saw being built. His stories are set fifteen minutes in the future — close enough to feel inevitable, far enough to be fiction. He writes about technology with the insider knowledge of someone who helped make it and the unease of someone who knows what it cost.',
  'Extrapolation from current technology, corporate settings, the gap between intention and consequence',
  'Marcus sounds like someone who has read the documentation. That is correct.',
  true,
  3890
),
(
  'Sable Quinn',
  'Speculative fiction at the boundary of sci-fi and literary drama',
  'Sci-Fi',
  'Sable Quinn resists the label of science fiction writer, which is how you know they are a science fiction writer. Their stories use speculative premises as a way to examine identity, memory, and what it means to be a self in a world that keeps changing the definition. Ursula K. Le Guin is the acknowledged north star.',
  'Speculative premises as character study, non-linear structure, ambiguous endings that demand interpretation',
  'Marcus gives the world weight. Sable gives it doubt.',
  true,
  3210
)
ON CONFLICT (name) DO NOTHING;

-- DRAMA (Elliott)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Frances Adler',
  'Family drama with the precision of a stage play',
  'Drama',
  'Frances Adler spent twenty years as a playwright before discovering that audio drama freed her from the tyranny of the set. Her stories are intimate, dialogue-driven, and concerned with the specific cruelties and tenderness of family life. She writes characters who love each other badly and mean well almost always.',
  'Subtext-heavy dialogue, compressed timelines, emotional reveals that have been building for the whole story',
  'Elliott holds the weight without showing it. That is the whole job.',
  true,
  3870
),
(
  'Miles Okafor',
  'Social drama rooted in community and belonging',
  'Drama',
  'Miles Okafor grew up in Lagos and London and has been writing about the experience of belonging to multiple worlds since his early twenties. His dramas are warm and specific and shot through with the comedy that comes from people who take the serious things seriously and refuse to take the rest of it seriously at all.',
  'Community as protagonist, cultural specificity, humor as dramatic counterweight',
  'Elliott finds the stillness in Miles. That is where the truth lives.',
  true,
  2940
),
(
  'Diana Reeve',
  'Quiet literary drama - the kind that stays with you for days',
  'Drama',
  'Diana Reeve writes the kind of stories where nothing explodes and everything matters. Her characters are ordinary people in ordinary situations making the kinds of small decisions that turn out not to be small at all. She has been called the Anton Chekhov of audio drama, which she accepts with the caveat that Chekhov had better punctuation.',
  'Restraint as technique, significance in the mundane, endings that arrive quietly and hit hard',
  'Elliott is the only narrator who understands that the pauses are not empty.',
  true,
  3420
)
ON CONFLICT (name) DO NOTHING;

-- ROMANCE (Nora)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Celeste Dupont',
  'Romance with emotional intelligence and real stakes',
  'Romance',
  'Celeste Dupont writes romance for people who have been told they are too smart for romance. Her stories take the genre seriously — the emotional stakes are real, the obstacles are not contrived, and the happy ending is earned rather than assumed. She believes love is the most dramatic subject in the world and is baffled that anyone thinks otherwise.',
  'Earned emotional beats, obstacles rooted in character rather than plot, warmth without sentimentality',
  'Nora reads Celeste like she believes every word. She does.',
  true,
  5240
),
(
  'Jasper Hale',
  'Romance from the male perspective - vulnerable and specific',
  'Romance',
  'Jasper Hale started writing romance after noticing there were very few love stories told from inside the experience of men who are trying and failing and trying again to be better. His stories are funny and embarrassing and tender in the way that real attempts at connection tend to be. His readers tell him he writes like someone who has learned things the hard way.',
  'Male interiority, romantic comedy beats with genuine emotional weight, self-awareness as character trait',
  'Nora finds the sweetness without losing the edge. Perfect.',
  true,
  3180
),
(
  'Simone Ward',
  'Second-chance romance and love after loss',
  'Romance',
  'Simone Ward writes about people who have already had their hearts broken and are considering, reluctantly, trying again. Her stories are for anyone who has wondered whether the capacity for love is something that can be worn down or whether it just goes underground for a while. She writes happy endings that feel like they cost something.',
  'Emotional history as subtext, grief alongside desire, resolution that acknowledges what was lost',
  'Nora carries the weight of what came before. That is the whole story.',
  true,
  4610
)
ON CONFLICT (name) DO NOTHING;

-- COMEDY (Quinn)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Archie Bloom',
  'British absurdist comedy with a warm heart underneath',
  'Comedy',
  'Archie Bloom has been writing comedy since he was old enough to understand that making people laugh was a form of power. His absurdist fiction owes a debt to Douglas Adams and P.G. Wodehouse and absolutely refuses to acknowledge that debt in any formal way. He lives in Bristol, owns too many plants, and maintains that comedy is the hardest thing to do well, which is why he works at it constantly.',
  'Absurdist escalation, comic timing on the page, emotional sincerity as the punchline',
  'Quinn gets the rhythm. The jokes land because she knows when not to rush them.',
  true,
  3560
),
(
  'Trudy Nash',
  'Domestic comedy that finds the ridiculous in the everyday',
  'Comedy',
  'Trudy Nash has been observing human behavior in supermarkets, school car parks, and neighborhood Facebook groups for decades, and she has concluded that ordinary life is basically a farce. Her comedy is warm and specific and full of characters who are completely convinced they are the only reasonable person in the room.',
  'Character-driven comedy, social observation, escalating misunderstandings resolved with grace',
  'Quinn makes these people loveable even when they are being idiots. Essential.',
  true,
  2870
),
(
  'Coop Delray',
  'Road comedy and adventure - American picaresque',
  'Comedy',
  'Coop Delray spent three years driving across America in a van that broke down in almost every state, taking notes. His comedy follows characters who are going somewhere and getting very entertainingly lost along the way. He writes with the generosity of someone who has been lost himself and found that it usually turns out fine.',
  'Road narrative structure, ensemble comedy, setbacks as comic engine',
  'Quinn gives these stories energy. They need to move to be funny.',
  true,
  2340
)
ON CONFLICT (name) DO NOTHING;

-- ADVENTURE (Finn)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Rex Harding',
  'Action-adventure with old-school spirit and modern stakes',
  'Adventure',
  'Rex Harding grew up on Indiana Jones and Jack London and has spent his career trying to write the adventures he wanted to read. His stories move fast, hit hard, and take their heroes seriously without ever taking themselves too seriously. He has been called the last pulp writer, which he considers the highest possible compliment.',
  'Propulsive pacing, physical stakes, heroes defined by action rather than introspection',
  'Finn reads Rex like he is running alongside the characters. That is right.',
  true,
  4120
),
(
  'Zara Osei',
  'Adventure rooted in African landscape and mythology',
  'Adventure',
  'Zara Osei grew up in Accra and writes adventure fiction that draws on West African landscape, history, and oral storytelling tradition. Her heroes are curious, capable, and operating in worlds that the Western adventure genre has mostly ignored. She writes because she wanted to read these stories and they did not exist yet.',
  'Landscape specificity, mythological depth, heroes whose intelligence is their primary tool',
  'Finn brings the energy. Zara brings the world. Together it is something new.',
  true,
  3480
),
(
  'Cal Merritt',
  'Survival adventure - humans against nature, nature usually winning',
  'Adventure',
  'Cal Merritt is a former wilderness search and rescue coordinator who started writing fiction to process the things he saw in the mountains. His survival stories are technically accurate and emotionally brutal — he writes the gap between what people think they can survive and what they actually can with painful precision.',
  'Technical authenticity, psychological depth under physical pressure, nature as antagonist',
  'Finn keeps the hope alive even when the situation says otherwise. That tension is everything.',
  true,
  2890
)
ON CONFLICT (name) DO NOTHING;

-- TRUE CRIME (Morgan)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Sloane Prescott',
  'Narrative true crime with journalistic rigor and human empathy',
  'True Crime',
  'Sloane Prescott spent fifteen years as an investigative journalist before moving into narrative nonfiction and then into audio drama. Her true crime stories are rigorously researched, compassionate toward victims, and merciless toward institutions that failed them. She writes because she believes accountability requires an audience.',
  'Journalistic structure, victim-centered perspective, systemic critique embedded in narrative',
  'Morgan makes the listener feel like a witness, not a voyeur. That distinction matters.',
  true,
  6840
),
(
  'Dex Carver',
  'Cold case deep dives - obsession as investigative method',
  'True Crime',
  'Dex Carver became obsessed with a cold case when he was nineteen and has been obsessed with cold cases ever since. He writes narrative true crime the way a detective works a case — circling, doubling back, following the thread that everyone else dismissed. His stories end with what the evidence supports, not with what would be satisfying. Often these are not the same thing.',
  'Cold case methodology, obsessive detail, resistance to false resolution',
  'Morgan holds the uncertainty. True crime should feel unfinished because it is.',
  true,
  5230
),
(
  'Nell Brody',
  'White-collar crime and financial fraud - the invisible violence',
  'True Crime',
  'Nell Brody spent a decade covering financial crime for a wire service and became convinced that the most interesting criminals are the ones who never get their hands dirty. Her true crime stories follow money — where it went, who took it, and who got left with nothing. She writes with the anger of someone who knows how rarely the right people go to prison.',
  'Financial forensics as narrative, systemic corruption, slow revelation of scale',
  'Morgan makes the abstract concrete. The numbers become people.',
  true,
  4120
)
ON CONFLICT (name) DO NOTHING;

-- CLASSICS (James)
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Hugh Marlowe',
  'Classic literary fiction adapted and reimagined for audio',
  'Classics',
  'Hugh Marlowe has spent his career in the archive — studying, teaching, and translating the classics for contemporary readers. His adaptations preserve the intelligence and moral seriousness of the source material while making them accessible to anyone driving to work on a Tuesday morning. He believes the classics are classics because they were true then and are true now.',
  'Faithful adaptation, modernized language without modernized sentiment, structural elegance',
  'James reads these stories the way they were meant to be heard. Aloud. By firelight.',
  true,
  3240
),
(
  'Beatrice Voss',
  'Classic fiction with a feminist re-reading',
  'Classics',
  'Beatrice Voss came to the classics through the side door — the women in the margins, the stories told about them rather than by them. Her adaptations bring those voices forward without falsifying history, finding in the original texts the subversive intelligence that was always there and mostly ignored. She is not rewriting the classics. She is finishing them.',
  'Feminist close reading, recovered voices, irony as both method and subject',
  'James respects what Beatrice does. The authority is genuine.',
  true,
  2870
),
(
  'Edmund Farr',
  'Original fiction written in the style of the great classical writers',
  'Classics',
  'Edmund Farr does not adapt the classics. He continues them — writing original stories in the tradition of the great nineteenth and early twentieth century writers, with period-accurate voice and contemporary emotional intelligence. He has been accused of being a pastiche artist, which he disputes, and also of taking himself too seriously, which he accepts.',
  'Period voice, genre conventions of classical fiction, moral seriousness as default register',
  'James and Edmund are a natural pairing. The voice fits the words like a glove.',
  true,
  2560
)
ON CONFLICT (name) DO NOTHING;

-- GET SMARTER (Nora) — Marc Postlewaite only
-- Marc is already seeded or will be added separately with real photo
INSERT INTO authors (name, description, genre, bio, techniques, audio_adaptation, living, follower_count) VALUES
(
  'Marc Postlewaite',
  'Author of Origin 2.0: From the Big Bang to the Future of Humanity',
  'Get Smarter',
  'Marc Postlewaite is the founder of Endless Tales and the author of Origin 2.0, a science narrative tracing the arc of existence from the Big Bang through the emergence of artificial intelligence. Written in the tradition of Carl Sagan, the book — and its audio adaptation — is designed for curious people who want the big picture without the textbook. Marc built Endless Tales because he believes the best ideas deserve to be heard, not just read.',
  'Narrative science writing, Carl Sagan tradition, accessible depth without condescension',
  'Nora gives Marc''s words the authority they deserve while keeping them warm.',
  true,
  1240
)
ON CONFLICT (name) DO NOTHING;

-- ── 6. Wire narrator_id to authors ───────────────────────────
-- Clara → Mystery authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'Xb7hH8MSUJpSbSDYk0k2')
WHERE name IN ('Vera Blackwood', 'Declan Marsh', 'Iris Fontaine');

-- Cole → Horror authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'nPczCjzI2devNBz1zQrb')
WHERE name IN ('Silas Graves', 'Maren Holloway', 'Theo Wicks');

-- June → Thriller authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'pFZP5JQG7iQjIQuC4Bku')
WHERE name IN ('Nadia Cross', 'Roman Steele', 'Petra Vane');

-- Ray → Western authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'CwhRBWXzGAHq8TQ4Fs17')
WHERE name IN ('Buck Callahan', 'Ada Rourke', 'Jesse Crane');

-- Marcus → Sci-Fi authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'onwK4e9ZLuTAKqWW03F9')
WHERE name IN ('Lyra Chen', 'Otto Finch', 'Sable Quinn');

-- Elliott → Drama authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'pqHfZKP75CvOlQylNhV4')
WHERE name IN ('Frances Adler', 'Miles Okafor', 'Diana Reeve');

-- Nora → Romance authors + Marc
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'XrExE9yKIg1WjnnlVkGX')
WHERE name IN ('Celeste Dupont', 'Jasper Hale', 'Simone Ward', 'Marc Postlewaite');

-- Quinn → Comedy authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'FGY2WhTYpPnrIDTdsKH5')
WHERE name IN ('Archie Bloom', 'Trudy Nash', 'Coop Delray');

-- Finn → Adventure authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'IKne3meq5aSn9XLyUdCD')
WHERE name IN ('Rex Harding', 'Zara Osei', 'Cal Merritt');

-- Morgan → True Crime authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'SAz9YHcvj6GT2YYXdXww')
WHERE name IN ('Sloane Prescott', 'Dex Carver', 'Nell Brody');

-- James → Classics authors
UPDATE authors SET narrator_id = (SELECT id FROM narrator_voices WHERE voice_id = 'JBFqnCBsd6RMkjVDRZzb')
WHERE name IN ('Hugh Marlowe', 'Beatrice Voss', 'Edmund Farr');
