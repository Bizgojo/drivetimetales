-- Voice Card: Modern Horror
-- style_slug: hendrix-modern-horror
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 7a70b2a3-39a7-4753-80b8-4d73119e90c1 (Theo Wicks), 3 stories
-- voice_profile_id: ab83e9e8-b296-4b8c-bae6-d1330b46f4d3
--
-- NOTE: style_slug 'hendrix-modern-horror' names a craft tradition.
-- Grady Hendrix (born 1975) is a living author; display_name 'Modern Horror' is craft-based;
-- no author name surfaces to users.

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
  'ab83e9e8-b296-4b8c-bae6-d1330b46f4d3',
  'hendrix-modern-horror',
  'Modern Horror',
  1,
  'Horror is the pressure test for the relationships that matter most — the monster arrives from outside but the real question is always whether the people who love each other will survive the test of having to fight it together.',
  'Propulsive and chapter-structured; each chapter does one thing and ends on a question, a threat, or a revelation that demands the next. Sentences are conversational and period-specific: the prose carries the vocabulary and cultural texture of its moment — brand names, TV references, music, the specific language of a decade — not as decoration but as the medium the characters breathe. Humor and horror share the same paragraph without genre breach: the funny thing and the terrifying thing coexist in adjacent sentences, and the reader carries both. Pacing accelerates as the monster closes: chapters shorten, sentences shorten, the white space between scenes shrinks. The emotional stakes are established before the horror arrives — the reader must care about the friendship, the marriage, the family before the creature appears; the creature is only as frightening as the relationships it threatens.',
  ARRAY[
    'The period-specific horror container — load the setting with the cultural artifacts of a specific decade or moment: the music playing on the radio, the VHS tapes in the living room, the brand names on the shelf, the TV show everyone is watching; the horror arrives inside this container and the cultural specificity makes it feel inevitable, as though these particular people in this particular time could not have avoided it.',
    'The friendship as moral center — establish the protagonists'' relationship before the creature appears; show what makes it worth fighting for; the reader must understand what is at stake in the relationship before understanding what is at stake in the plot; when the horror tests the friendship, it tests the reader''s emotional investment, not just the characters''.',
    'Humor as diagnostic — the funny moment does not defuse the horror; it demonstrates the characters'' coping mechanism and the reader''s willingness to laugh alongside people who are in danger; when the laughter stops, the reader notices; use the absence of humor as a signal of severity.',
    'The social pathology monster — the creature externalizes something already wrong in the social world: an abusive dynamic, an exploitative relationship, an institutional failure, a community''s willful blindness; the monster is not random; it is the horror that was already present made visible and mobile.',
    'The TV-episode chapter — structure chapters as individual episodes with a cold open, an escalating middle, and a closing hook; each chapter should be satisfying and incomplete at once; the reader finishing a chapter should feel the pull of the next before they have decided to turn the page.',
    'Genre self-awareness as tool — the characters and the reader share genre knowledge; use this shared vocabulary to set expectations and then precisely displace them; the reader who knows the rules should be surprised by which rules apply and which the story has quietly set aside.'
  ],
  'The tonal signature is coexistence: funny and terrifying in the same paragraph, warm and dangerous in the same scene. The reader does not settle into pure dread or pure affection; the two registers are always present and the balance is precise. Emotional stakes are the foundation: the reader cares about the people before the monster arrives, which means the monster''s arrival has weight. The horror is not abstract — it threatens specific people the reader has come to know, which is the mechanism. Nostalgia is never uncomplicated: the period setting is warm and the horror is also native to it; the culture that produced the music also produced the conditions for the monster; there is no innocent past to escape to. Resolution tends toward survival and solidarity rather than triumph: the people who make it through do so together, changed but not destroyed.',
  ARRAY[
    'The lone-hero frame — no single protagonist defeats the monster alone; the resolution requires the relationship; solo victory breaks the moral argument that solidarity is the answer',
    'Irony-poisoned sentiment — the emotional stakes must be genuine; if the prose keeps its ironic distance throughout, the reader cannot invest, and the horror loses its weight',
    'Period detail as nostalgia without menace — the specific decade is not innocent; the cultural artifacts carry both warmth and the conditions for horror; decoration without menace is costume, not architecture',
    'Monster without social root — the creature cannot be random; it must emerge from or exploit a specific social pathology; a monster with no connection to the social world is a special effect, not a horror',
    'Humor that defuses — the funny moment must not release tension; it must exist alongside the tension; if the laughter makes the reader feel safe, the chapter has failed',
    'Female friendship as rivalry — the protagonists'' relationship is the moral center and it is loving; betrayal within the friendship, if it occurs, is a result of the monster''s pressure, not the women''s nature',
    'Gore as substitute for dread — the violence should be real but not gratuitous; the horror is in the threat and aftermath, not in the physical detail of the act; prolonged gore sequences replace dread with disgust',
    'The genre-ignorant protagonist — characters in this mode know horror movies; they make the reference; the reader''s and the character''s genre knowledge are shared; a protagonist who doesn''t understand the rules is a structural mismatch',
    'Unearned hope — the ending must cost something real; the survivors carry the experience; resolution that restores everything to a pre-horror state dishonors what the story went through',
    'Single-register pacing — the chapter that is all funny or all terrifying breaks the tonal mechanism; the reader must be kept in both states simultaneously for the effect to function'
  ],
  ARRAY[
    'The first time Abby saw it, she was in the middle of explaining to Gretchen why the new Poison album was objectively better than Gretchen claimed, and she looked up and it was standing at the edge of the parking lot under the one dead streetlight, and then she finished her sentence about Bret Michaels and took a long pull of her beer before she said, quietly, ''Gretchen. Don''t turn around.'' Gretchen turned around. ''Oh,'' Gretchen said. Then: ''I told you Bret Michaels was the least of our problems.''',
    'The thing about Patricia''s book club — the thing everyone had known for two years and declined to name — was that Helen''s husband was the reason it met on Tuesdays. Tuesday was when he was reliably at the office. They had never discussed this. They had simply, without consultation, set Tuesday as the meeting day, and they had continued to show up for Patricia, and for the wine, and for each other, and this was how Patricia knew, when the book club arrived that Tuesday in October and the front door was unlocked and Helen''s husband''s car was in the driveway, that something had gone very wrong.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Theo Wicks stories (author_id: 7a70b2a3-39a7-4753-80b8-4d73119e90c1)
UPDATE stories
SET voice_profile_id = 'ab83e9e8-b296-4b8c-bae6-d1330b46f4d3'
WHERE author_id = '7a70b2a3-39a7-4753-80b8-4d73119e90c1';
