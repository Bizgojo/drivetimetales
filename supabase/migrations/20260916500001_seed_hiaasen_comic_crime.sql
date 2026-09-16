-- Voice Card: Comic Crime
-- style_slug: hiaasen-comic-crime
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 3f9e7e59-5ce3-4621-a109-6534d89983b3 (Coop Delray), 12 stories
-- voice_profile_id: 73711f59-e868-421a-af7e-1ecf3ebea437
--
-- NOTE: Carl Hiaasen (born 1953) is a living author.
-- display_name 'Comic Crime' is craft-based; no living author name surfaces to users.
-- style_slug 'hiaasen-comic-crime' is an internal key describing the house style tradition.

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
  '73711f59-e868-421a-af7e-1ecf3ebea437',
  'hiaasen-comic-crime',
  'Comic Crime',
  1,
  'The state of Florida is not the backdrop — it is the crime. A civilization of strip malls, gated communities, purchased politicians, and poisoned wetlands that is also somehow, relentlessly, hilarious. The comedy and the corruption are the same thing observed from two different angles.',
  'Journalistic precision applied to absurdity — the sentences are clean and punchy, with the Miami Herald columnist''s eye for the exact detail that makes a specific Florida type unforgettable. Short declaratives carry weight; digressive passages catalogue the particular weirdo in frame — the corrupt county commissioner, the developer with the tanning-booth orange skin, the ex-con who loves one specific endangered bird — with the flat affect of a reporter who cannot believe what he is witnessing. Dark comic timing lives in the sentence-level choice: the straight-faced observation dropped into chaos, the bureaucratic fact delivered at the moment of maximum absurdity. Prose never hurries the punchline.',
  ARRAY[
    'Florida as moral landscape — the setting is never neutral; the overdeveloped waterfront, the corrupt zoning board, the drained wetland, the Florida panther displaced by a golf course — the environment is the victim and its destruction is the crime; every location communicates what Florida lost to get here',
    'The eccentric-villain ecosystem — antagonists are ridiculous and genuinely dangerous simultaneously; the developer funding the corruption is also sleeping with his campaign manager''s wife and genuinely panicked about a black bear on his golf course; the absurdity does not make the threat less real; both registers coexist without irony',
    'Environmental justice as spine — the crime always, eventually, circles back to what someone is doing to Florida''s remaining wild places or wildlife; the protagonist is the one person who cannot make himself stop noticing; caring about a manatee is coded as the correct moral position',
    'The outsider protagonist — a former cop, a freelance journalist, a professional eccentric who has opted out of institutions and therefore can pursue the case without institutional constraints; not a cynic, simply someone whose inability to look away has become a lifestyle',
    'The subplot ecosystem — multiple Florida weirdos in concurrent trouble whose storylines braid toward a Florida-weird finale; the structure is maximalist; the reader is never in doubt that it will all converge; Cussler builds clocks, Hiaasen builds carnivals',
    'Dark comedy in the violence — when antagonists meet their ends, the manner is appropriate to Florida: the kind of accident that could only happen here, in this specific combination of hubris, heat, and wildlife; the end fits the crime'
  ],
  'Comic but never trivial — the humor arrives because the specific stupidity of Florida corruption is genuinely funny, and the specificity is the proof that this is love for the place as much as fury at what is being done to it. Anger underneath the jokes: the comedy is journalism; Hiaasen is furious about what is being done to a place he loves, and the humor is how he processes that fury without becoming unreadable. The villains are ridiculous but the damage is real. The endangered animal is actually endangered. The ecosystem is actually dying. The comedy must never let the reader forget this.',
  ARRAY[
    'Generic crime — the crime must be Florida-specific; if it could happen in Ohio, it is the wrong crime',
    'suddenly — comic timing requires setup; the absurd event must be prepared by the context that made it inevitable',
    'his/her eyes filled with tears — sentiment lands through specificity, not through generic emotional signals',
    'the irony was not lost on — the reader notices the irony; naming it kills it',
    'a wave of [emotion] washed over — the character''s feeling arrives through action or dialogue, not through interior wave-motion',
    'in that moment — compression, not ceremony; the scene earns its beats without announcing them',
    'Villain reform — corrupt Florida officials and developers do not have last-minute changes of heart; they are what they are to the end',
    'Generic Florida — no palm trees swaying without a specific observation attached; the setting is earned through the detail that makes this particular part of Florida this particular Florida',
    'The hero explains the moral — the reader has been shown the environmental damage; they do not need the protagonist to summarize what it means',
    'little did he know — the comedy comes from what everyone in the scene can see; the narrator is not coy about the situation'
  ],
  ARRAY[
    'The Palmetto Groves Nature Preserve had been reduced to eleven acres and a sign that still read WILDLIFE SANCTUARY in the kind of font that suggested whoever had chosen it had briefly, in 1987, believed it. Beyond the wire fence, three bulldozers were parked for the weekend, their tracks already printed into the ground where the saw palmetto had been. Dupree had purchased two county commissioners, one environmental impact assessor, and a state wildlife biologist named Randy who had subsequently been transferred to a position reviewing boat registration forms. It had taken him eight months and $340,000. The manatee, who had been using this stretch of creek for eighteen years and did not follow local politics, would not know about any of this until Tuesday.',
    '"The problem," Calhoun said, "is he''s not actually breaking any laws."
Mooney had heard this before. "He just drove his airboat through a protected nesting area for the second time this week."
"While legally intoxicated," Calhoun allowed, "and in possession of a loaded firearm and a live raccoon he claims is a service animal, but the nesting area designation is pending, so technically—"
"He killed eight ibis."
"Allegedly."
"He filmed it."
A pause. "The footage is currently with his attorney."
Mooney looked out the window of the wildlife office at the parking lot, which had flooded again due to the county''s refusal to maintain the drainage system it had sold to a developer in 2019 for reasons no one had ever satisfactorily explained. This was Florida. There was always a reason no one had ever satisfactorily explained.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Coop Delray stories (author_id: 3f9e7e59-5ce3-4621-a109-6534d89983b3)
-- Covers both FK-linked and text-only stories
UPDATE stories
SET voice_profile_id = '73711f59-e868-421a-af7e-1ecf3ebea437'
WHERE author ILIKE '%Coop Delray%';
