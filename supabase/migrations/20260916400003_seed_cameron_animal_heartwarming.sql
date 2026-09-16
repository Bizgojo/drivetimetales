-- Voice Card: Animal Heartwarming
-- style_slug: cameron-animal-heartwarming
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 3fd69005-ac41-4fe0-8d2d-b4e3db1fa2d0 (Gus Pendry), 3 stories
-- voice_profile_id: 4850e0aa-79dc-4806-a150-c74047216de6
--
-- NOTE: style_slug 'cameron-animal-heartwarming' is Marc's explicit direction — use exactly.
-- display_name 'Animal Heartwarming' is craft-based; no living author name surfaces to users.
-- W. Bruce Cameron (born 1960) is a living author; this profile describes a house style tradition only.

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
  '4850e0aa-79dc-4806-a150-c74047216de6',
  'cameron-animal-heartwarming',
  'Animal Heartwarming',
  1,
  'A dog''s love is not complicated by self-consciousness. The loyalty is real, the purpose is real, and the reader is moved because the emotion is taken seriously rather than ironized. The animal narrator perceives what the humans cannot say to each other — the real emotional situation running underneath the surface dialogue — and the story''s moral clarity comes from that perspective''s honesty about what love actually looks like when it is unclouded.',
  'The dog''s voice is present-moment, sensory, emotionally direct. Sentences follow perception rather than reflection: what the dog smells, hears, sees, and feels — immediately, without retrospective commentary. The voice is not simple; it is unclouded. Paragraphs are short and kinetic; the dog does not linger, it responds. Humor arises from the gap between what the dog understands and what the human intends — the dog''s interpretation is wrong in the literal facts and right in the emotional truth. Death is handled as transition rather than ending: the prose does not melodramatize departure but moves through it with the same present-moment directness that characterizes the whole narrative.',
  ARRAY[
    'Anchor every scene in canine perception, in order: smell first (the richest channel; the dog knows things from smell that humans would not know until later), then sound, then sight. The dog often perceives the emotional state of a scene before the humans in it are aware of it themselves. The reader should feel what the dog smells before understanding why it matters.',
    'Use the dog''s misunderstanding of human behavior as a source of gentle, never condescending humor. The dog''s interpretation is wrong in the literal sense and right in the emotional one — the human is not playing a game with the car keys, but there is something true in what the dog notices about how the human is acting. The gap is the comedy; the emotional accuracy is what the reader carries away.',
    'Let the dog perceive what the humans cannot say to each other: the dog narrates the real emotional situation running underneath the surface dialogue. Two characters are talking about dinner; the dog notices that the one is carrying something it cannot put down, and that the other knows this and doesn''t know what to do. The reader sees what the characters are hiding from each other, mediated through the dog''s honest and unsentimental perception.',
    'Return to purpose across the narrative: the dog knows what it is for before the reader fully understands the pattern; the purpose is approaching as the story deepens; the reader should feel it assembling before it arrives. The revelation is not a twist — it is a recognition that was waiting to be named.',
    'Treat death as transition, not ending. The dog''s departure is written without melodrama: the prose does not slow down and become solemn; it continues in the same present-moment voice and moves through the departure the way the dog moves through everything — by continuing toward the next thing. What continues is the love and the purpose. The reader should feel completion, not loss.',
    'Resolve warmly and specifically: the right people find each other; the dog completes its purpose; the specific wrong is made right in a way the dog can understand. The ending is earned through the accumulated weight of specific moments, not manufactured through a final emotional push. The reader should feel satisfied, not wrung out.'
  ],
  'Emotionally direct without irony: the dog''s love is taken seriously, and the prose never distances the reader from it. Gentle humor from misunderstanding, never from mockery — of the dog or of the humans. Death is present in this world but not traumatic; the continuity of purpose provides the emotional architecture that holds grief without being overwhelmed by it. Stakes are family, love, belonging, the search for the person who needs you — emotionally real and never exploitative. Resolution is always warm: this is the genre contract and the prose honors it without apology.',
  ARRAY[
    'Irony about the dog''s emotional life — the love is real and the prose must treat it as real; the moment the narrator signals distance from the dog''s experience, the whole project loses its engine',
    'Sentimentality that hasn''t been earned — Cameron earns the emotion through specific sensory and relational detail, never by naming the feeling directly; "the dog loved him" is backstory; the dog pressing its nose into the crook of the man''s knee is the story',
    'Human self-consciousness in the dog''s voice — the dog does not know it is loyal; it simply acts; the voice should not contain concepts the dog could not possess',
    'Graphic animal suffering as emotional manipulation — pain is noted in the same present-moment way as everything else; it is a fact, not a device; dwelling on it would be a form of dishonesty about what the narrative is doing',
    'Unresolved endings — the purpose is fulfilled; the right people find each other; the dog''s journey completes; an ending that withholds this completion breaks the contract the opening pages established',
    'Anthropomorphizing in the wrong direction — the dog perceives in sensory and relational terms, not human concepts; it does not think about justice or irony or narrative; it thinks about smell, sound, safety, and the person it is looking for',
    'suddenly',
    'little did he know',
    'melodrama in the death passages',
    'human dialogue narrated without canine perception — the dog is always mediating the scene through its senses; it does not simply transcribe'
  ],
  ARRAY[
    'The man''s smell had changed again. Copper and something bitter underneath — not blood exactly, but close enough that Buddy kept coming back to check. He pressed his nose into the man''s palm and the man said "I''m fine, bud," in the voice he used when he was not fine, which Buddy had learned to recognize the way he''d learned to recognize the difference between the sound of the leash being taken off the hook and the sound of the leash being put away. Same leash. Different meaning. The woman came in from the kitchen and the man said it again — "I''m fine" — and Buddy moved between them, not because anyone had asked him to, but because that was where the space was that needed filling. The woman reached down and scratched behind his ear without looking at him. She was looking at the man. Buddy could feel what was happening in the room. He didn''t have a name for it. He sat down between them and leaned his weight against the man''s leg, and after a while the man''s hand came down and rested on his head, and they stayed like that until the light changed.',
    'He had been walking for nine days. The pads of his feet had gone from sore to numb to something else — not pain exactly, more like information he was choosing not to prioritize. The boy''s smell was getting stronger. Not the boy himself, not yet, but the traces of him in this direction: a shirt left on a fence post three miles back, the specific shampoo on a pillow in a doorway where a family had let him sleep. He was close. The thing that drove him forward was not hope, exactly — hope was too large a word for what it was. It was simpler than hope. It was the knowledge of where he was supposed to be, and the fact that he was not there yet. He kept moving.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Gus Pendry stories (author_id: 3fd69005-ac41-4fe0-8d2d-b4e3db1fa2d0)
UPDATE stories
SET voice_profile_id = '4850e0aa-79dc-4806-a150-c74047216de6'
WHERE author_id = '3fd69005-ac41-4fe0-8d2d-b4e3db1fa2d0';
