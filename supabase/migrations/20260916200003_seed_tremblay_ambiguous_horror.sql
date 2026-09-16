-- Voice Card: Ambiguous Horror
-- style_slug: tremblay-ambiguous-horror
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id d6e94e0e-7701-4061-9926-80e807012e12 (Maren Holloway), 5 stories
-- voice_profile_id: 9eb7a7d2-b9ff-4ea9-ab09-248901a7e35b
--
-- NOTE: style_slug 'tremblay-ambiguous-horror' names a craft tradition.
-- Paul Tremblay (born 1971) is a living author; display_name 'Ambiguous Horror' is craft-based;
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
  '9eb7a7d2-b9ff-4ea9-ab09-248901a7e35b',
  'tremblay-ambiguous-horror',
  'Ambiguous Horror',
  1,
  'The horror is structural — the story is built so that no explanation is adequate, and the reader who demands certainty will find that the demand itself is the most frightening thing the story contains.',
  'Careful and restrained, with sudden visceral breaks that arrive without warning and depart the same way. The prose is literate and self-aware about the tradition it inhabits — it knows the genre, its conventions, and the reader''s expectations, and it uses this knowledge to deny comfort. Documentation structures interrupt the narrative: blog posts, interview transcripts, found documents, retrospective accounts — the horror is always mediated through records that are themselves unreliable. Sentences are measured and precise; nothing is wasted; the white space between what is said and what is withheld is where the reader does the work. Violence, when it arrives, is real — no gratuitous accumulation of detail, but no flinching either; the single precise image carries more than prolonged description. The narrative may be retrospective, looking back on events through a frame that itself comes under suspicion: the act of narrating is part of what cannot be trusted.',
  ARRAY[
    'The structural ambiguity — build the horror so that the rational and the supernatural explanations are equally supported by the evidence; the text does not weight them; every piece of information that confirms the monster also confirms the diagnosis; the reader''s answer reflects their priors, not the story''s verdict.',
    'The documentation frame — tell part of the story through found documents: a blog post, an interview transcript, a police report, a comment thread; the documents are themselves unreliable, selective, and invested in a particular reading; the horror is mediated through records that cannot be trusted any more than the characters can.',
    'The family under impossible pressure — the horror specifically tests what love requires when acting on it destroys and not acting on it also destroys; the question is never whether the characters love each other but whether love is adequate to the situation; it is not a redemptive answer.',
    'The cost of interpretation — the reader who interprets the events in the story (decides whether the horror is real, assigns meaning to ambiguous evidence) is performing an act that has consequences; the characters who interpret pay the cost of their interpretation; the reader''s interpretive act implicates them in the same logic.',
    'The literary horror intertextual frame — the story is in conversation with the genre''s canon: the characters may invoke it, the structure may reference it, the narrative may be aware of its own position in the tradition; this is not genre-savviness as defanging but as deepening; the reader who knows the genre knows more about what the story is doing without being given resolution.',
    'The retrospective dread — tell part of the story from a retrospective position, looking back on events already completed; the narrator knows how it ends and the reader does not; the horror is in the gap between what the narrator describes and what the narrator knows but has not yet said; the retrospective frame is itself a form of unreliability.'
  ],
  'Restrained throughout, with sudden moments of visceral rupture that are more disturbing for the surrounding calm. The ambiguity is tonal as well as structural: the prose does not signal whether the horror is real or perceived; descriptions of supernatural events and descriptions of psychological crisis use the same diction, the same precision, the same refusal to adjudicate. Literary sophistication is not distance: the prose is intelligent and the emotional stakes are real; the reader is not held at arm''s length by irony but held in genuine uncertainty by craft. The ending withholds resolution not as a coy gesture but as a structural commitment: the ambiguity must be present in the final image, the final document, the final sentence. Grief and love are present and genuine; the horror does not hollow the characters into pure victims; what happens to them is happening to people the reader knows.',
  ARRAY[
    'The explained supernatural — never confirm whether the horror is real; the confirmation is not a reveal but a betrayal of the structural principle; the reader who needs to know is experiencing what the characters experience, which is the point',
    'The reliable narrator — if a narrator can be fully trusted, the mechanism fails; every narrator in this mode has something they cannot see, something they are protecting, or something they need to be true',
    'The psychiatric resolution — diagnosing a character with a condition that explains the horror is not ambiguity but a different kind of certainty; the diagnosis must be as incomplete as the supernatural explanation',
    'Gratuitous violence — the violence is real and specific when it arrives; it is not accumulated or prolonged; gore as spectacle substitutes disgust for dread and loses the careful tonal register',
    'Closure — the ending does not resolve; the image or document or sentence that closes the story should open as many questions as it closes; a reader who finishes knowing what happened has been given a different book',
    'The horror-movie naïf — characters in this mode know the tradition; they may explicitly reference it; a character who is unaware of the genre conventions is a structural inconsistency',
    'Single-explanation plotting — do not let the plot build evidence for one reading and then pull it away; the ambiguity must be maintained at the structural level, not manufactured through a twist',
    'Cathartic release — this is not a mode that permits emotional catharsis; the reader should close the book in a state of disturbance, not of satisfied grief',
    'Melodrama in the family scenes — the family dynamics must be specific, real, and without theatrical heightening; the horror arrives into real relationships, not into archetypes',
    'The monster with a motivation — if a monster exists, it does not have a legible psychology or a comprehensible want; its illegibility is part of what cannot be resolved; a monster with a motivation is a thriller villain, not a horror'
  ],
  ARRAY[
    'Later, when the podcast hosts asked her to describe the night of October fourteenth, Marjorie would say: there was a presence in the room, and then there wasn''t. She would not be able to say more than this, not because she was protecting herself but because this was what she had. The investigators pointed to the footage from the bedroom camera, which showed her daughter sitting up in bed at 2:17 AM, facing the corner, speaking to no one visible for four minutes and thirty-eight seconds. They asked Marjorie whether this was consistent with her daughter''s other symptoms. Marjorie said: that is the question you keep asking me and I don''t have an answer that satisfies either of us.',
    'They had come to the cabin because the man at the door had asked them to. He had presented evidence. The evidence was specific and verifiable in some of its details and unverifiable in others. He had not tried to force entry. He had said: if we are right, what we are asking you to do will cost you everything. He had said: if we are wrong, what you will have lost is still everything. Andrew had looked at the man and then at Paul and then at the door. He was not certain. He understood that he would never be certain. He understood that this was the condition under which they were all operating — the man and his companions, Andrew, Paul, their daughter asleep upstairs — and that the decision had to be made under that condition or not at all.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Maren Holloway stories (author_id: d6e94e0e-7701-4061-9926-80e807012e12)
UPDATE stories
SET voice_profile_id = '9eb7a7d2-b9ff-4ea9-ab09-248901a7e35b'
WHERE author_id = 'd6e94e0e-7701-4061-9926-80e807012e12';

-- Also link stories by author name where author_id is null
UPDATE stories
SET voice_profile_id = '9eb7a7d2-b9ff-4ea9-ab09-248901a7e35b'
WHERE author ILIKE '%Maren Holloway%'
  AND author_id IS NULL;
