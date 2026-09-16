-- Voice Card: Domestic Noir
-- style_slug: flynn-gillian-domestic-noir
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id cc373d09-6aba-422d-a3d1-540064e66d0e (Sloane Prescott), 7 stories
-- voice_profile_id: 61cb65a2-0a3f-48c3-990e-a821c54ab9b6
--
-- NOTE: style_slug 'flynn-gillian-domestic-noir' uses Flynn as a style tradition reference only.
-- display_name 'Domestic Noir' is craft-based; no author name surfaces to users.
-- Gillian Flynn (born 1971) is a living author; this profile describes a house style tradition only.

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
  '61cb65a2-0a3f-48c3-990e-a821c54ab9b6',
  'flynn-gillian-domestic-noir',
  'Domestic Noir',
  1,
  'The protagonist is lying — to herself, to the reader, or to both — and the ordinary surfaces of domestic life contain the violence underneath; female rage is not the darkness but the engine, and the twist doesn''t just surprise, it exposes something the reader was already complicit in.',
  'Sharp, acidic, often wryly funny — the darkness is never ponderous. Short punchy sentences punctuated by longer ones that build velocity. Wit that cuts: the humor arrives in the same sentence as the menace. First-person narration with the rhythm of a woman explaining herself to no one, which means she is explaining herself to everyone. The telling detail is never soft: a specific brand, a precise insult, a memory with sudden forensic clarity. Midwestern plainness spiked with venom. Adverbs die here; exact nouns and verbs carry the freight.',
  ARRAY[
    'The unreliable narrator reveal: build the narrator''s account as internally coherent and oddly sympathetic before the seam opens. The reader should have genuinely chosen a side. The reframe doesn''t just change facts — it retroactively exposes the reader''s own assumptions, which is the real twist.',
    'The cool-girl monologue: give the protagonist a cultural critique that is both entirely correct and subtly self-implicating. The insight is real. The woman delivering it is dangerous. Both things coexist without the narrative resolving the tension. The reader applauds, then realizes what they just applauded.',
    'The dual diary / split-timeline structure: alternate between two time periods or two narrators, each account building its own coherence, so that when they collide the reader holds irreconcilable truths simultaneously. Neither version is entirely false. Neither is entirely honest. This structure is the moral argument.',
    'Domestic settings as crime scenes: catalog the ordinary details of suburban and small-town life — the brand-name products, the predictable social rituals, the carefully maintained surfaces — and let the violence live just underneath. The house is always also a crime scene. The neighborhood is already dangerous. The reader knew this before the story did.',
    'Female rage without apology: give the protagonist anger that is fully articulated and never softened into "crazy" or "hysterical." The rage has a logic. The plot serves the logic. The reader is invited to follow the logic even when they shouldn''t, and this invitation is the novel''s provocation.',
    'The twist as moral argument: engineer the plot reversal not as a surprise for its own sake but as an exposure of something the reader was already believing — a gendered assumption, a class assumption, an assumption about who tells the truth in a marriage. The reader''s betrayal is the point, not the mechanics of the reveal.'
  ],
  'Menace beneath wit — the humor and the darkness coexist without one canceling the other; a line can be genuinely funny and genuinely threatening in the same breath. Female interiority is rendered precisely, without sentimentality, often with a cold accuracy that is itself a form of power. The unreliability is in the prose from the first page — not a trick applied at the end but a condition baked in, visible to anyone paying attention. Pacing alternates between controlled revelation and sudden acceleration; the suspense lives in the gap between what the narrator claims and what we begin to suspect. The ending does not heal and is not meant to: the reader is left holding something they cannot put down and cannot quite name.',
  ARRAY[
    'Resolution through confession or breakdown — the protagonist reveals herself fully only in the text the reader holds; in the story world, she does not break; breaking is the wrong genre',
    'Sympathetic victimhood — these protagonists are not suffering women to be pitied; their suffering has been converted into something else entirely and that conversion is the engine of the story',
    'Explained psychology — the wound is shown in its effects on behavior, not traced to a source; childhood trauma as explanatory flashback belongs to a gentler and less honest tradition',
    'Male savior figure — the answer comes from the protagonist; if a man arrives to solve things, the moral architecture of the story has failed',
    'Ponderous darkness — if the menace is portentous and the prose is heavy, the wit has been lost; the darkness is acid, not molasses; the humor is not relief from the threat, it is part of the threat',
    'The unreliability as late twist — unreliability is present from sentence one to anyone paying close attention; it is a condition of the narration, not a reversal applied at the end',
    'Sentimentality about marriage or family — institutions in this mode are always performances; the home is always also a crime scene; nostalgia for the domestic is the lie the protagonist was sold and spent the novel exposing',
    'Action-thriller pacing — the threat is interior and psychological; external chases and countdowns are the wrong genre; suspense lives in the accumulating gap between what the narrator says and what the reader suspects',
    'Female hysteria or breakdown as climax — the protagonist''s anger and action should be controlled and purposeful; losing control is not the point; maintaining control while doing terrible things is',
    'Third-person omniscience that resolves ambiguity — the narrative voice must remain close to the unreliable consciousness; authorial distance that sorts truth from fiction cancels the whole enterprise'
  ],
  ARRAY[
    'The morning of our anniversary I woke at 6 a.m. and started the coffee and thought about what I knew about Nick that he didn''t know I knew. The list was not short. I kept it in my head, not written down, because written things can be found, and I am a careful woman. I have always been careful. I have a talent for seeming uncareful — the easy laugh, the slightly crooked smile, the way I pretend to forget things when forgetting is useful — and this talent has served me well, because people rarely watch the woman who seems not to be paying attention. I paid attention to everything. I made French toast. I set the table. I kissed my husband on his perfectly formed jaw and thought: I know something you don''t know I know. The day was going to be interesting.',
    'I had not been back to Wind Gap in eight years and I had not been sober in Wind Gap in twelve, and the town had the particular smell of a place that knows exactly what you did there. I drove in on Route 9 past the Dairy Dream and the VFW and the single stoplight blinking yellow, which is how Wind Gap understood urgency. My mother''s house was at the end of a long private road. It had fourteen rooms and my mother knew what had happened in most of them. I had fourteen scars on my left arm, each one its own small history, each one a thing I didn''t want to say in words. In Wind Gap, everything that couldn''t be spoken got written somewhere else. My mother chose wallpaper. I chose skin. We were not so different, really. I pulled into the driveway and sat there and thought about driving away. I thought about this for approximately four minutes and twenty seconds. Then I got my bag from the back seat and went inside.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Sloane Prescott stories (author_id: cc373d09-6aba-422d-a3d1-540064e66d0e)
UPDATE stories
SET voice_profile_id = '61cb65a2-0a3f-48c3-990e-a821c54ab9b6'
WHERE author_id = 'cc373d09-6aba-422d-a3d1-540064e66d0e';
