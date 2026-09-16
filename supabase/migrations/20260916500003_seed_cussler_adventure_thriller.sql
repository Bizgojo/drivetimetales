-- Voice Card: Adventure Thriller
-- style_slug: cussler-adventure-thriller
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id ac6e7743-3d3e-4b6a-894d-ff7510668785 (Dale Harmon), 10 stories
-- voice_profile_id: 83d9c3b1-2568-4585-a2b8-a7766b4ed6d3
--
-- NOTE: Clive Cussler died February 24, 2020. Not a living author.
-- display_name 'Adventure Thriller' is craft-based and describes the house style tradition.

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
  '83d9c3b1-2568-4585-a2b8-a7766b4ed6d3',
  'cussler-adventure-thriller',
  'Adventure Thriller',
  1,
  'History buried something that the present cannot afford to lose. A NUMA operative and the world''s most dangerous marine archaeologist will find it, fight through everyone who wants to stop him, and return it to the light — in whatever exotic location the story has seen fit to maroon him this time.',
  'Clean, fast, unpretentious — the adventure is the point; the prose never slows down for introspection. Short chapters, often alternating between the historical prologue that buried the mystery and the contemporary investigation that uncovers it. Subject-verb-object, sensory detail deployed for exotic local color, action described with physical clarity. The historical opening sets the object of desire; each contemporary chapter advances toward it; the pacing accelerates toward the physical climax. Dialogue is quick and collegial — the team talks like people who like each other; the banter is warm and professional and lands in the middle of movement.',
  ARRAY[
    'The dual-timeline structure — the novel opens with the historical moment that created the mystery: a ship going down with its cargo, a civilization concealing its treasure, a discovery too dangerous for its era. The contemporary investigation uncovers the thread; the two timelines converge at the moment when the historical secret becomes the key to the modern threat',
    'The globe as set piece — each novel plants its action in a new exotic location; the geography is both backdrop and treasure; the setting is rendered with the enthusiasm of someone who has been there or wishes they had; the reader is carried into unfamiliar terrain with confidence and specific detail',
    'Effortless protagonist competence — the hero never struggles with self-doubt; he is a marine archaeologist, a driver of vintage cars, a man who holds his breath for three minutes underwater and surfaces with the artifact; competence is a fantasy the reader enjoys without apology; the obstacles are external, never internal',
    'The NUMA team ensemble — the protagonist never works truly alone; there is a core of capable specialists whose camaraderie is warm; professional respect functions as affection; the reader cares about the team as a whole, not just the lead; the ensemble makes the hero''s victories feel earned rather than solitary',
    'The action set-piece — underwater salvage, naval combat, vehicle chases through locations both specific and slightly heightened; the physical adventure is inventive and the author clearly enjoyed designing it; the inventiveness is shared with the reader as part of the pleasure',
    'The author''s cameo — Cussler famously inserted himself as a minor character who assists at a key moment; the meta-awareness is good-natured and became a tradition the reader anticipated; it signals that the author is having fun and invites the reader to join'
  ],
  'Optimistic adventure — the world is dangerous but the good guys have the equipment, the wit, and the luck; darkness is present (the villain''s threat is real, people die) but the fundamental register is entertainment; the reader is never in doubt that the hero will prevail; the pleasure is in how, not whether. The historical mystery gives the proceedings a weight of heritage and discovery that elevates the entertainment into something that feels like it matters — recovering lost history is itself an act of heroism. Cussler does not ask the reader to be troubled; he asks them to be engaged.',
  ARRAY[
    'Hero self-doubt — the protagonist does not spiral into existential crisis; the obstacle is external; the resolution is competence applied creatively to a specific physical problem',
    'The villain with a comprehensible grievance — in the adventure thriller tradition, the antagonist wants power, money, or ideological domination; the reader does not need to sympathize; they need to understand the threat and believe it is real',
    'suddenly — the action sequences are prepared by context; the reader understands the setting, the stakes, the physical constraints before anything happens; nothing arrives without foundation',
    'Introspective interiority between action beats — the protagonist checks environmental conditions and tactical options; he does not process childhood trauma between underwater sequences',
    'Pacing sacrificed for atmosphere — landscape, history, and local color are delivered at speed; no descriptive passage stays still long enough to kill the momentum; everything moves',
    'The incompetent NUMA team — the ensemble is professionally capable; they may be outgunned but not outthought; their moments of crisis are imposed by overwhelming odds, not by failure of basic competence',
    'a wave of [emotion] washed over — the protagonist registers emotion as action or laconic observation; he does not have wave-motion interiority',
    'Moral ambiguity at the resolution — the villain is stopped, the artifact recovered, the historical wrong righted; the ending is clean; the adventure structure requires it',
    'Exclusively domestic stakes — the threat is always larger than the protagonist''s personal grievance; personal motivation is fine as fuel but the mission is always national or global in consequence',
    'Genre irony — this style plays it straight with good humor; self-consciousness about the adventure conventions deflates what makes them work'
  ],
  ARRAY[
    'The manifest from the Doña Isabel listed her final cargo as wool, tallow, and six crates of Jesuit correspondence bound for the Archbishop of Lima. The ship had left Callao in March of 1631 and had not arrived. Maritime records from the period were imprecise. Three hundred and ninety-one years later, Harmon was reading the manifest in a climate-controlled room in the Archivo General de Indias in Seville, and the sixth crate was the only entry that made no sense. The weight was wrong. Wool did not weigh four hundred pounds per crate. Tallow did not require lead-lined containers. He had been in Seville for three days. He booked a flight to Lima that evening.',
    'The cave was sixty feet below the surface, which in the Yucatan Peninsula meant it had been above sea level during the last ice age and had been used for things that freshwater caves in limestone country get used for — ceremonies, burials, storage of things people needed future generations to find. Harmon came through the entry passage sideways, his air tank scraping the ceiling, and came out into a chamber the size of a gymnasium. His dive light moved across the wall. He stopped.
"Rourke." His voice was muffled, too loud in the flooded silence.
Rourke was three seconds behind him through the passage. She came out, cleared her regulator, looked where the light was pointing, and for several seconds neither of them said anything.
"That''s not Mayan," she said finally.
"No," Harmon agreed. "It''s not."
He had been diving professionally for twenty-two years. He had never been the first person to see a thing he could not identify. He checked his air gauge — forty minutes — and began the methodical survey of the chamber that would determine which of those forty minutes were for documentation and which were for getting out.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Dale Harmon stories (author_id: ac6e7743-3d3e-4b6a-894d-ff7510668785)
UPDATE stories
SET voice_profile_id = '83d9c3b1-2568-4585-a2b8-a7766b4ed6d3'
WHERE author_id = 'ac6e7743-3d3e-4b6a-894d-ff7510668785';

-- Also cover any text-only stories
UPDATE stories
SET voice_profile_id = '83d9c3b1-2568-4585-a2b8-a7766b4ed6d3'
WHERE author ILIKE '%Dale Harmon%'
  AND voice_profile_id IS NULL;
