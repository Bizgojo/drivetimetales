-- Voice Card: Psychological Horror
-- style_slug: jackson-psychological-horror
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id f690c72a-a1ec-4149-a18e-8c864cbda119 (Silas Cutter), 8 stories
-- voice_profile_id: 7dce4276-5aba-4dee-961b-5270d755218b
--
-- NOTE: style_slug 'jackson-psychological-horror' names a craft tradition, not a living person.
-- Shirley Jackson (1916–1965) is deceased. display_name 'Psychological Horror' is craft-based;
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
  '7dce4276-5aba-4dee-961b-5270d755218b',
  'jackson-psychological-horror',
  'Psychological Horror',
  1,
  'The house is never just a house — the ordinary domestic world is charged with menace that the protagonist perceives and the reader cannot name, because the protagonist may be the source of it.',
  'Precise and controlled; the prose is calm on the surface and charged underneath. Sentences are declarative and carefully measured — no excess, no urgency, no alarm. The horror is amplified by the flat register in which it is described; the diction does not change when the monstrous enters. Domestic language — the vocabulary of the kitchen, the garden, the household routine — carries the weight of dread; the ordinary noun does the work that explicit threat cannot. Rhythm is unhurried; scenes develop through accumulation of exact, specific detail rather than dramatic event. The first-person voice, when used, is charming, precise, and not to be trusted — it is the voice of someone who has made accommodations they cannot acknowledge to themselves, much less explain.',
  ARRAY[
    'The charming unreliable narrator — open on a voice that is genuinely pleasant, perceptive, and observant, and only slightly off-register; the reader settles into warmth before recognizing the wrongness is structural, not incidental; by then they are committed.',
    'The house as psychological entity — describe the setting as if it has intention: the way a room feels wrong, the way a house permits certain things and refuses others, the way a space responds to its inhabitants; the supernatural may or may not be real; the house''s attitude is real.',
    'Domestic horror displacement — advance the horror through domestic detail: the precise description of a meal, a garden, a household arrangement; the accumulated specificity of the ordinary builds the dread that the prose refuses to name directly.',
    'The social exclusion engine — establish the protagonist''s relationship to the community as fundamentally asymmetrical from the first paragraph; the community has already formed its verdict; the protagonist knows it and has organized their life around the fact; the horror arrives through the mechanism of that exclusion.',
    'The ending that refuses to explain — close on an image, an action, a decision that resonates without resolution; do not provide the psychological or supernatural key; the reader holds the ambiguity without the text offering relief; the ending is the horror, not its clarification.',
    'The procedural community — when horror arrives through collective action (the community''s will, the ritual, the shared decision), write the participation in the language of procedure: ordinary people doing ordinary things in the service of something terrible; no individual bears the full weight of the act; the community is the instrument.'
  ],
  'Serenity on the surface, menace in the architecture. The narrative voice does not perform anxiety; it describes breakfast, describes the garden, describes the neighbor''s expression, and the menace accumulates in the gaps between what is observed and what is understood. Reader identification is engineered: the unreliable narrator is never villainized from the outside; the reader inhabits the logic of a consciousness that has arranged itself around something terrible, and the horror is in the arrangement''s plausibility. Social dynamics are presented with precise observation and no verdict: the community''s cruelty is described in the same register as the weather. Resolution is withheld: the ending does not explain or justify or restore; it closes the story as a house closes a room — firmly, without explanation.',
  ARRAY[
    '''Suddenly'' — Jackson never escalates; she accumulates; sudden events break the mechanism of dread that runs on time and patience',
    'The protagonist recognizing their own wrongness — the unreliable narrator does not confess, does not achieve insight, does not perform guilt; the accommodation is total and the reader is left to see what the narrator cannot',
    'A helpful outside authority — no therapist, no detective, no supernatural expert who explains what is happening; external resolution ends the interior engine',
    'Explicit horror language — never announce ''terror,'' ''dread,'' ''horror,'' or ''fear'' in the prose; describe what is observed; the reader produces the named emotion from the description',
    'Melodramatic physical reaction — no trembling, no cold sweat as authorial signal; the body is contained; the voice is calm; control is the style and the character''s strategy',
    'The explained supernatural — never resolve whether the ghost is real or the character''s psychology; the ambiguity is the point; resolution converts horror into genre and loses what makes this mode distinctive',
    'A welcoming community — the village, the neighborhood, the family does not get to be warm without condition; their comfort is always conditional and the condition is always compliance',
    'Backstory as explanation — do not provide the history that explains the character''s state; the state is present-tense; the history may be implied through detail but never offered as account',
    'Action-scene resolution — the horror does not culminate in a chase, a confrontation, a physical event that breaks the tension; the ending is quieter than the reader expects and more disturbing for it',
    'Comic relief that defuses — the humor in this mode is black and understated; it does not release; it intensifies by demonstrating the narrator''s equanimity; relief that lightens the mood is a structural violation'
  ],
  ARRAY[
    'Mary Katherine had decided on blackberries this morning, and she went down the path toward the creek where the canes grew thickest, carrying the basket her mother had carried for the same purpose when Mary Katherine had been a child. The village did not come this far. The village did not come past the stone walls now, not since — but Mary Katherine did not think about that. She thought about the blackberries, which would be good this year, better than last, and about the pie she would make, and about how Constance would say it was the best pie she had ever tasted, which Constance always said and which was always true.',
    'No live organism can continue for long to exist sanely under conditions of absolute reality. The house knew this, though its builders had not. The house was born bad, the way some children are born bad, the way some blood is bad — not wrong by choice but by nature, which is worse. Eleanor felt the house consider her. She stood in the foyer with her suitcase and felt the house deciding whether she would do, and the worst thing about the feeling was that she wanted to be chosen.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Silas Cutter stories (author_id: f690c72a-a1ec-4149-a18e-8c864cbda119)
UPDATE stories
SET voice_profile_id = '7dce4276-5aba-4dee-961b-5270d755218b'
WHERE author_id = 'f690c72a-a1ec-4149-a18e-8c864cbda119';
