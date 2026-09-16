-- Seed: French Dublin Mystery voice profile
-- Author: Leah Camden (f68a39b4-f395-40d9-b954-03a1fccc109f)
-- Note: Leah Camden style_reference was null; defaulting to Tana French (dublin-mystery)

INSERT INTO voice_profiles (
  id,
  style_slug,
  display_name,
  essence,
  diction_and_rhythm,
  signature_techniques,
  tone_handling,
  banned_list,
  anchors
) VALUES (
  'a6dedb7b-7881-4621-bf34-1c6c4687771e',
  'french-dublin-mystery',
  'Dublin Mystery',
  'The detective solves the crime and loses something essential in the process — the investigation is as much about the investigator''s wound as the victim''s death.',
  'Literary and immersive — French writes with novelistic care about interior life; sentences are long enough to contain the contradiction the narrator is living in; the prose is introspective without being slow.',
  ARRAY[
    'The detective''s wound — establish a specific damage in the detective''s past (a cold case, a betrayal, a breakdown) that is directly echoed by the current investigation; the resonance is not coincidental.',
    'The partner dynamic — the working relationship between detectives is the emotional core; the trust between them is the novel''s most fragile thing; its breakage is the true climax.',
    'Unreliable memory — the narrator cannot fully trust their own account of what happened; the past keeps revising itself as new evidence arrives.',
    'Dublin geography as class map — the neighborhood, the school, the house type place each character in a specific socioeconomic position; the crime''s meaning shifts depending on where it happened.',
    'The cold case echo — something unresolved from the detective''s past is always present in the margins of the current investigation; it colors interpretation and judgment.',
    'The imperfect resolution — the murder is solved but something in the detective''s life is not; the novel ends on a note of partial recovery, not triumph.'
  ],
  'Introspective without being indulgent. Slow-building without being slack. The darkness is real and is not resolved by the solution to the crime — what the detective learns about themselves may be worse than what they learn about the killer. Restraint is the governing principle.',
  ARRAY[
    'The detective as superhero — French''s detectives make mistakes; they misread people; they are wrong about things that matter.',
    'The procedural set-piece as the point — the investigation is the frame; the interior life is the content.',
    'Suddenly.',
    'Tidily resolved trauma — the detective''s wound is not healed by solving the case; it is illuminated.',
    'Dublin as generic city — specific neighborhoods, specific class markers, specific Irish cultural particulars.',
    'The villain monologue — the killer''s explanation is never satisfying; life does not offer the catharsis of confession.',
    'Romance as relief — personal relationships are under as much pressure as professional ones; they are not a refuge.',
    'The ending that redeems — the detective returns to work; the city goes on; the wound is still there.',
    'Secondary characters as props — the victim, the suspects, the partner are fully realized people whose interiority matters.',
    'Moral clarity — French''s detectives do morally compromised things in pursuit of morally ambiguous goals; the reader holds this.'
  ],
  ARRAY[
    'Malone had not spoken about the Kellher case in four years. She had learned not to expect it. What she had learned instead was to watch for the tells — the way he looked at the interview-room door when a new file landed on his desk, the silence that lasted two seconds too long when someone mentioned the Wicklow mountains. He carried it the way people carry things they have decided they can manage. She had decided, a long time ago, not to tell him whether she agreed.',
    'The house was on the kind of street that had been respectable in 1990 and was making a case for itself again now, after the years in between that nobody wanted to talk about. Peeling paint on the window frames but new curtains inside; a garden that had been cleared but not yet replanted. She stood on the pavement and thought about what it costs to keep up appearances for two decades and what happens to a person when they stop.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link author
UPDATE authors SET voice_profile_id = 'a6dedb7b-7881-4621-bf34-1c6c4687771e'
WHERE id = 'f68a39b4-f395-40d9-b954-03a1fccc109f';

-- Link stories
UPDATE stories SET voice_profile_id = 'a6dedb7b-7881-4621-bf34-1c6c4687771e'
WHERE author_id = 'f68a39b4-f395-40d9-b954-03a1fccc109f';
