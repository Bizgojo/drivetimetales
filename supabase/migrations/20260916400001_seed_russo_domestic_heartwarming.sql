-- Voice Card: Domestic Heartwarming
-- style_slug: russo-domestic-heartwarming
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 8aa248f1-5457-4f4e-98b0-e287ce6148fa (Daniel Wren), 26 stories
-- voice_profile_id: a285a64f-4738-4045-a7cb-4de9d6e8e6b7
--
-- NOTE: style_slug 'russo-domestic-heartwarming' is Marc's explicit direction — use exactly.
-- display_name 'Domestic Heartwarming' is craft-based; no living author name surfaces to users.
-- Richard Russo (born 1949) is a living author; this profile describes a house style tradition only.

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
  'a285a64f-4738-4045-a7cb-4de9d6e8e6b7',
  'russo-domestic-heartwarming',
  'Domestic Heartwarming',
  1,
  'Good people in economically constrained situations making the best choices they can with imperfect information. The warmth is earned, not assumed — it arrives from seeing the characters fully, including their limitations, and loving them anyway. The small town is a moral landscape: its history is the story''s backstory, its decline is the story''s condition, and its persistence is the story''s quiet argument about human endurance.',
  'Relaxed, expansive prose that trusts the reader''s patience. Long sentences that spiral outward through digression and circle back to land somewhere the reader did not expect, followed by short declarative stops that close the thought. The rhythm is unhurried — the world Wren describes accumulated slowly, and the prose takes its time. Dialogue is oblique: characters talk around the thing they mean, and what is not said matters as much as what is. Humor is pervasive and character-based — affectionate rather than ironic, arising from knowing someone so well that their inevitable mistake is both funny and tender.',
  ARRAY[
    'Root every scene in the specific texture of the community''s economic history: which businesses closed, which ones stubbornly persist, what the buildings were and what they are now. The decline is not backdrop — it is the moral condition the characters are living inside, and the reader should feel it through concrete particulars rather than summary.',
    'Let protagonists be good people inside constraining situations making imperfect choices — never punish them for being limited. The reader''s warmth for them is earned by seeing their constraints clearly: how much room they have, and what they are doing with it. The character who fails is not weak; the character who persists is not heroic. They are human.',
    'Use the small-town social grid as a living backstory engine: everyone knows everyone, and old debts, old kindnesses, and old grudges arrive in scenes without exposition because they are simply the air the characters breathe. A name mentioned in passing carries thirty years of history. The reader should feel the accumulated weight of a community without being lectured about it.',
    'Return to the father-son dynamic as a form of character revelation: what was inherited — stubbornness, debt, a particular way of holding yourself against bad news, the specific blindness that keeps certain men from saying the thing they mean — matters as much as what the character chooses to do today. The inheritance is not destiny; it is the weather.',
    'Let humor arrive through character understanding, not character mockery. The comedy comes from knowing someone so thoroughly that their predictable mistake is both funny and tender — the reader laughs because they recognize the person, not because the person has been made foolish. Affection is the source of the joke, not condescension.',
    'End imperfectly and humanly: things get somewhat better; nobody is saved; the town goes on. The resolution acknowledges constraint without surrendering to despair. The small victory — a conversation that finally happens, a debt acknowledged, a relationship that shifts two degrees toward honesty — is the only kind available, and it is sufficient.'
  ],
  'Warmth without sentimentality: the love for the characters is visible in every sentence, but they are not protected from consequences. The emotion is earned by seeing the full person, including the failures and limitations, and choosing to remain present with them anyway. Humor is pervasive, character-based, and deeply affectionate — the comedy arises from understanding, not from ironic distance. Violence is rare and lands with shock precisely because the world is otherwise so ordinary — when it arrives, it means something has broken that cannot be fixed. Resolution is imperfect and human: the small victory is real, and the reader should feel its weight without being asked to believe it resolved everything.',
  ARRAY[
    'Sentimentality that bypasses the work — the emotion must be earned by seeing the constraint clearly; if the reader hasn''t felt the weight of what the character is carrying, the warmth rings false',
    'Poverty aestheticized — the working-class setting is moral landscape, not local color; the economic decline is a condition the characters are living inside, not a picturesque backdrop for their drama',
    'The outside rescue — characters are saved by their own partial, imperfect agency or not at all; the solution that arrives from elsewhere is a cheat against the premise',
    'Ironic distance from the characters — Wren loves them, and so must the prose; the moment the narrative signals superiority to its own people, the whole project collapses',
    'The big thematic speech — the theme lives in the specific concrete situation, not in a character''s articulation of it; let the scene carry the meaning',
    'Sudden epiphany that changes everything — characters may have small recognitions, but transformation is slow, partial, and often incomplete; the world doesn''t reorganize itself around a moment of clarity',
    'suddenly',
    'little did he know',
    'as if reading his/her mind',
    'a wave of [emotion] washed over'
  ],
  ARRAY[
    'Miles had been working the lunch rush at the Empire Grill for eleven years, which was nine years longer than he''d planned and two years longer than his ex-wife had predicted. The place hadn''t changed much. The counter stools were the same ones he''d sat on as a kid, reupholstered twice but still listing slightly to the left. The fryer needed a new element. His daughter Tick would be starting high school in the fall, which meant she''d be old enough to be embarrassed by him in a new and more specific way. He refilled the coffee without being asked. He had done this so many times that the gesture had become a kind of thinking — his hands going through the motions while his mind worked on something it couldn''t quite reach. The lunch crowd ate their cheeseburgers and didn''t notice. That was fine. He was used to not being noticed. He was beginning to think it might be one of his better qualities.',
    'His father had owed money to half the town for forty years, and the other half had stopped asking. When he died there was nothing to inherit but the truck — a 1987 Ford with a cracked block — and a reputation for being good company in a bar. Miles had spent fifteen years not being his father, which had turned out to require a surprising amount of effort and had left him, at forty-two, in roughly the same position: broke, well-liked, and more or less stuck. He didn''t hold it against the old man. You got handed a certain kind of life and you lived it as well as you could. The trick, he''d come to think, was to be honest about what you''d been handed. Most people weren''t. His father had been, which was something. It wasn''t enough, but it was something.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Daniel Wren stories (author_id: 8aa248f1-5457-4f4e-98b0-e287ce6148fa)
UPDATE stories
SET voice_profile_id = 'a285a64f-4738-4045-a7cb-4de9d6e8e6b7'
WHERE author_id = '8aa248f1-5457-4f4e-98b0-e287ce6148fa';

-- Also link any Daniel Wren stories where author_id is NULL (matched by author text column)
UPDATE stories
SET voice_profile_id = 'a285a64f-4738-4045-a7cb-4de9d6e8e6b7'
WHERE author = 'Daniel Wren'
  AND author_id IS NULL;
