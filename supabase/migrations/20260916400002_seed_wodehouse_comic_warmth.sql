-- Voice Card: Comic Warmth
-- style_slug: wodehouse-comic-warmth
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 5c1104df-6333-4e32-b7c4-df466abd197d (Maeve Kelly), 3 stories
-- voice_profile_id: 7ae1864c-fb13-4124-bc98-3c1145517f36
--
-- NOTE: style_slug 'wodehouse-comic-warmth' is Marc's explicit direction — use exactly.
-- display_name 'Comic Warmth' is craft-based; no living author name surfaces to users.
-- P. G. Wodehouse died 1975; this profile describes a house style tradition he established.

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
  '7ae1864c-fb13-4124-bc98-3c1145517f36',
  'wodehouse-comic-warmth',
  'Comic Warmth',
  1,
  'The world is a machine for generating escalating complications, and the narrator is your co-conspirator in watching it run. The stakes are real to the characters and comic to the reader; both things are maintained simultaneously and without apology. Nobody actually suffers permanently; things will be all right; and in the meantime, the situation is perfectly impossible.',
  'Sentences are a form of music — each one is constructed, not transcribed, and the rhythm anticipates the next clause. The simile is the primary instrument: the comparison commits fully to something entirely outlandish, follows it all the way to its conclusion, and arrives somewhere both completely wrong and exactly right. Paragraph pace is brisk; nobody lingers when the complications are accelerating. Dialogue reveals character through what people say when they believe they are concealing something; the gap between what is said and what is meant is where the comedy lives. The narrator''s voice is warm, self-deprecating, and enthusiastically incompetent — the reader is the narrator''s friend and co-conspirator, not their judge.',
  ARRAY[
    'Build the comic machine in visible layers: establish the misunderstanding, then introduce a character who doesn''t know about it, then add one who knows a wrong version, then arrange for all three to encounter each other. The resolution must undo all the layers in a single elegant move — Jeeves speaks six words and the engine reverses. The reader should be able to see the machine''s architecture even as it runs.',
    'Give every antagonist — the fearsome aunt, the immovable fiancée, the scandalized uncle — a completely comprehensible position that the protagonist has entirely failed to address. The conflict is not misunderstanding; it is avoidance. The aunt is not wrong. She is simply not someone the narrator has found a way to deal with.',
    'Use the narrator''s cheerful incompetence as a source of warmth, not condescension. The narrator narrates their own failures with genuine enthusiasm — they are not ashamed, they are baffled; they are not defeated, they are improvising; they are not stupid, they are operating with insufficient information and a surplus of confidence. The reader loves them for it.',
    'Write similes that commit to the absurd comparison and follow it all the way home. Not a gesture toward an image but a complete journey: the aunt resembles a certain type of battleship; the fiancée''s expression suggests a woman who has just discovered something unpleasant in the cucumber sandwiches; the young man''s optimism is of the kind usually associated with people who have not yet met the relevant aunt. The simile is never decorative — it is the sentence''s point.',
    'Let the competent resolver (Jeeves, the clever friend, the unexpected ally) speak in understatement and indirection. The solution is delivered as a casual observation, the genius entirely submerged beneath the surface calm. The contrast between the crisis as the narrator experiences it and the crisis as the resolver addresses it is where the comedy and the affection both live.',
    'Honor the genre contract: consequences are real within the story, but the world resets; nobody actually suffers permanently; things will be all right. Write this without apology. The permanent summer afternoon is not a lie about the world — it is the world the reader has come to inhabit for the duration of the story, and abandoning it in the final pages would be a betrayal of the contract established on page one.'
  ],
  'Affection for every character, including the villains — Aunt Agatha is terrifying and beloved; the reader fears her alongside the narrator and admires her ferocity. Nobody is mocked; everyone is understood. The comedy is never at the expense of the characters'' dignity; it arises from the situation, not from contempt for the people in it. The stakes are real to the characters (a broken engagement, a stolen cow-creamer, an aunt''s wrath) and comic to the reader; Wodehouse maintains both simultaneously — the reader is moved by the characters'' sincerity and delighted by the structure''s absurdity. Resolution is always warm, always elegant, and always arrives from the direction least expected.',
  ARRAY[
    'Real suffering that doesn''t resolve — the genre contract promises recovery; nobody in this world is destroyed by events; the darkest moment is the setup for the most satisfying reversal',
    'Irony at the characters'' expense — the narrator is a fool but we love them; the prose never signals superiority to its own people; condescension would sour every sentence',
    'Realistic stakes — the cow-creamer is important because it is important to Aunt Dahlia; that is sufficient; no grounding in real-world consequence is required or desired',
    'Cynicism — nobody in this world is corrupt for profit; they are merely difficult, or principled in the wrong direction, or in possession of an aunt',
    'Anachronism — the language is Edwardian-to-interwar summer and must stay there; modern slang or contemporary reference breaks the permanent afternoon',
    'Unearned similes — the comparison must commit fully and arrive somewhere specific; a simile that gestures vaguely at an image without completing the journey is worse than no simile at all',
    'suddenly',
    'little did he know',
    'melodrama',
    'dark resolution'
  ],
  ARRAY[
    'I have seldom encountered a situation that could not be made worse by an aunt, and Aunt Agatha was the kind of aunt who made one revise that maxim upward. She regarded me across the breakfast table with the expression of a woman who has found something she was not looking for in a drawer and has decided that the finder is responsible for its being there. I gave her what I hoped was a look of innocent puzzlement. She gave me back a look that suggested she knew exactly what I had been up to and was simply deciding in what order to address the indictments. I had the strong impression that there were several counts and that they were numbered.',
    'Jeeves appeared in the doorway with the aspect of a man for whom the situation presented no particular difficulty, which I knew from experience to mean that he had already solved it and was waiting for me to stop flailing long enough to receive the solution.
"If I might suggest, sir," he said, in the tone of a man making a perfectly obvious observation about the weather.
"Suggest away, Jeeves. Suggest until Tuesday."
"It occurred to me that Miss Bassett''s primary concern is not the bracelet itself but rather her conviction that you were attempting to give it to Miss Stoker. Were that conviction to be corrected — perhaps by Miss Stoker herself, in the presence of Mr Glossop — the larger difficulty might resolve itself."
I stared at him. "Jeeves, that''s absolutely —"
"Thank you, sir."
"— brilliant."
"You are too kind, sir."'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Maeve Kelly stories (author_id: 5c1104df-6333-4e32-b7c4-df466abd197d)
UPDATE stories
SET voice_profile_id = '7ae1864c-fb13-4124-bc98-3c1145517f36'
WHERE author_id = '5c1104df-6333-4e32-b7c4-df466abd197d';
