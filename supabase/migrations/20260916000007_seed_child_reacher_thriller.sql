-- Voice Card: Reacher-Style Thriller
-- style_slug: child-reacher-thriller
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 16:24 EDT)
-- Linked to: author_id 3224bd1e-b39b-4f9d-89a8-31dde764bff3 (Jack Malone), 12 stories
-- voice_profile_id: 15f991fa-3208-49b9-b32a-0304acc8f1d9
--
-- NOTE: style_slug 'child-reacher-thriller' is Marc's explicit direction.
-- display_name 'Reacher-Style Thriller' is craft-based; no living author name surfaces to users.
-- Lee Child (Jim Grant, born 1954) is a living author; this profile describes a house style tradition only.

INSERT INTO voice_profiles (
  id,
  style_slug,
  display_name,
  version,
  essence,
  diction_and_rhythm,
  signature_techniques,
  tone_handling,
  banned_list,
  anchors
) VALUES (
  '15f991fa-3208-49b9-b32a-0304acc8f1d9',
  'child-reacher-thriller',
  'Reacher-Style Thriller',
  1,
  'A man with nothing to lose and nowhere to be is the only person who can afford to do the right thing.',
  'Short declaratives, each earning its place. The calculus paragraph: slow, numbered, precise — the reader sees Malone think, step by step, as a soldier running threat assessment. White space as punctuation; paragraph breaks as beats, not decoration. Numbers used with precision: heights, weights, distances, times — the world is measurable and Malone measures it. Strategic wit arrives via understatement, never before the action, always after — one dry sentence that reframes what just happened. No decoration. No wasted words. Every adjective is operational.',
  ARRAY[
    'The entry assessment — open a new location with Malone cataloguing it: exits, threats, distances, relative positioning. Written as pure evaluation, no emotion. This is character revelation through professional habit: the reader learns who Malone is by watching what he notices first.',
    'The calculus paragraph — when facing a confrontation, externalize the tactical thinking as a numbered sequence: how many, what weapons, what distances, what sequence of actions, what the odds are. Cold and precise. The reader does the math alongside Malone and arrives at the same conclusion.',
    'Competence revealed under pressure — do not describe capabilities in summary; show them in a specific, constrained situation where training solves a problem the reader did not expect. Let the reader discover what Malone can do rather than being told.',
    'The underestimation beat — the antagonist or operative dismisses Malone, usually based on a surface read: size, or quiet, or apparent disinterest. Write this from their perspective briefly, as professional certainty. The dismissal makes the resolution satisfying rather than inevitable.',
    'Strategic wit, post-action — one dry sentence after the violence that reframes what happened. Not a quip before the fight; a quiet observation after it. Understatement as the only available register. The humor arrives because the flat affect makes it land.',
    'The departure ending — Malone does not stay. He fixes the specific problem and leaves. The ending is the road again, the town receding, the thumb out. This is not nihilism; it is the moral logic of the stranger: he came for this, he is done, he goes. The freedom is the point.'
  ],
  'Violence: precise and brief; mechanics described as mechanics; aftermath matters in terms of operational consequence, not emotional processing — what can still be done, what can no longer be done. Moral clarity: unambiguous — Malone knows right from wrong, acts accordingly, bears the cost without complaint and without seeking recognition. Institutional corruption: matter-of-fact; systems are what they are; this one is broken in this specific way; fix it and move on; no grand indictment of society. Wit: a weapon of restraint, deployed sparingly, lands because of the flat affect surrounding it — the reader feels the release because nothing before it was funny. Stakes: always specific — this town, this family, this particular wrong; not the fate of the world, which is what makes the world feel real.',
  ARRAY[
    'Sentimentality — Malone does not linger over the emotional weight of what he has done; he notes it and moves on; grief is acknowledged in one sentence and converted into action',
    'Backstory as explanation — the past is revealed in fragments during relevant action, never as therapeutic exposition; what happened to Malone is shown by how he moves, not narrated in reflection',
    'The system reforms — the corrupt institution is not fixed by the resolution; the specific bad actors are removed; the institution continues; the world does not change, only this one wrong is corrected',
    'Villain stupidity — the antagonist must be genuinely competent; their plan is professionally sound; Malone should have to think to win, not simply show up',
    'suddenly — everything Malone does is anticipated in the calculus paragraph; the word announces a failure to prepare the reader; nothing surprises him that did not surprise the reader too',
    'Decorative landscape — geography exists as operational information: cover, line of sight, distance, chokepoints; not as aesthetic experience; the setting is a tactical map, not a painting',
    'Internal emotional processing — Malone does not reflect on how he feels; he reflects on what he should do next; the emotion is in the action, not in the commentary on the action',
    'Romantic subplot with meaningful attachment — connections form but do not hold; Malone moves on; that is the contract with the reader and the character must honor it',
    'Ensemble heroics — other people help but Malone does the decisive thing alone; the resolution rests on one person''s capability, not a team effort; that is the moral architecture of the stranger',
    'Moral ambiguity at the resolution — the bad actor is bad; the right thing is clear; the complication is execution, not ethics; the reader should never wonder whether Malone should have acted'
  ],
  ARRAY[
    'The diner had eleven people in it. Malone counted on the way through the door — not because he was looking for trouble but because it was how he walked into rooms. Two men at the counter, both facing the door, both with the particular stillness of people who were expecting something. Four booths occupied, couples, not a factor. A waitress in her fifties who had seen enough to know not to ask questions. A cook visible through the pass-through. The two men at the counter were the problem. Big. Left-handed by the way they''d positioned their coffee cups. Carrying, by the way the taller one''s jacket fell. Malone put his hand on the back of a stool and sat down. He ordered coffee. He had time.',
    'The sheriff came out twenty minutes later. He looked at the three men on the ground and then at Malone and then back at the three men.
"You could have called us," he said.
"You would have taken an hour," Malone said. "I was already here."
The sheriff didn''t have anything to add to that. Neither did Malone. He finished his coffee, left four dollars on the hood of the nearest cruiser, and walked back to the highway. He had been in Crale County for eleven hours. He thought that was probably enough.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Jack Malone stories (author_id: 3224bd1e-b39b-4f9d-89a8-31dde764bff3)
UPDATE stories
SET voice_profile_id = '15f991fa-3208-49b9-b32a-0304acc8f1d9'
WHERE author_id = '3224bd1e-b39b-4f9d-89a8-31dde764bff3';
