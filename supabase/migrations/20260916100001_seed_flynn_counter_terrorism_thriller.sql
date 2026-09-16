-- Voice Card: Counter-Terrorism Thriller
-- style_slug: flynn-counter-terrorism-thriller
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id dd0a7a15-fcf1-4fb9-be6e-d3612eee0621 (Roman Steele), 10 stories
-- voice_profile_id: e8337d23-982d-438a-b5bb-1c3cb16e33aa
--
-- NOTE: Vince Flynn died 2013 — display_name is craft-based only, no author name surfaces to users.
-- This profile describes a house style tradition drawn from Flynn's published work.

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
  'e8337d23-982d-438a-b5bb-1c3cb16e33aa',
  'flynn-counter-terrorism-thriller',
  'Counter-Terrorism Thriller',
  1,
  'The state trains men to do violent things in dark places so that ordinary people can sleep. The cost of that arrangement is a secret the state prefers not to discuss.',
  'Short chapters — rarely more than ten pages, often five or six — each ending on a fact or a decision that pulls the reader forward. The prose is punchy and direct: subject-verb-object, no literary ornamentation, no wasted words. Alternating POV is structural, not ornamental — the reader tracks the operative and the antagonist in close parallel, the tension building because both are capable and both are moving toward the same collision. Sentences are tight; paragraphs earn their length. The operational detail is specific — weapons, protocols, agency designations, extraction timelines — and treated matter-of-factly, the way professionals discuss their tools. Ticking-clock mechanics are embedded in chapter architecture: timestamps, deadlines, and countdowns are facts of the plot, not drama added on top of it.',
  ARRAY[
    'The alternating-POV parallel — the protagonist''s chapter ends on a decision or a movement; the antagonist''s chapter, often immediately following, mirrors the same moment from the other side. The reader holds both threads simultaneously. The collision is inevitable; the dramatic question is only the timing and the cost.',
    'Operational specificity as characterization — the protagonist does not describe himself in summary; the reader knows him through the exactness of his tradecraft: the specific firearm and why it was chosen, the cover identity and its documented backstory, the safe house and its egress routes. Competence is shown by how a professional thinks, not by narrated reputation.',
    'The villain''s competent POV — the antagonist receives a chapter from the inside: their ideology is internally coherent, their planning is tactically sound, their disdain for the protagonist is a professional assessment rather than cartoon malice. This creates tactical empathy — the reader understands the threat without sympathizing with the goal. The antagonist is not wrong about the protagonist''s methods; they are wrong about the cause.',
    'The institutional obstacle — the protagonist''s chain of command contains at least one figure whose political caution, bureaucratic self-interest, or moral squeamishness actively impedes the mission. This is not corruption; it is the legitimate tension between democratic oversight and covert necessity. The reader sees both sides and is still asked to root for the operator cutting through it.',
    'The ticking-clock chapter break — chapters end on a narrowing window: hours become minutes, intelligence becomes stale, the asset''s position becomes compromised. The reader does not get resolution at the chapter break; they get acceleration. The transition to the next chapter begins in motion.',
    'Aftermath as operational fact — violence is described with mechanical precision during the act; in the aftermath, the protagonist registers consequences in terms of operational impact, not moral processing. What can still be done. What has been lost. The emotional weight is present but compressed — a single sentence that acknowledges cost before returning to the mission.'
  ],
  'Violence: specific and clinical; the mechanics of lethal force described with the flat affect of a professional report — not sensationalized, not minimized, treated as the tool it is. Moral clarity: unambiguous in the large sense — the protagonist is fighting genuine threats to civilian lives; the terrorists intend mass casualties; the reader is not invited to hold this as equally valid — while holding genuine complexity in the middle, where the institutional obstacles are not villains but wrong. Bureaucracy: rendered with genuine frustration rather than contempt; the system is not evil, it is constrained by the political realities that created it, and those constraints cost lives; the protagonist''s rage at this is earned, not performative. Stakes: always specific and physical — a named city, a named population, a named deadline — never abstract; the reader can picture what will happen if the protagonist fails.',
  ARRAY[
    'Moral ambiguity at the mission level — the protagonist is not conflicted about whether the terrorist should be stopped; conflict lives in the how and the institutional friction, never in the whether',
    'Villain stupidity or ideology-free motivation — the antagonist has a specific, coherent worldview; their grievance has historical roots; they are not simply evil; they are ideologically committed and operationally competent',
    'suddenly — everything the protagonist does is prepared in advance by operational detail; the reader should be able to see what is coming; if it arrives suddenly, the setup was missing',
    'Therapeutic processing of violence — the protagonist does not hold debriefs with himself about how killing makes him feel; he notes the operational result and moves to the next problem; the emotional weight is in the prose compression, not in interior monologue',
    'Political lectures — the protagonist''s frustration with the system is shown through action and compressed dialogue, never through extended speechifying; the reader draws the political conclusion from the narrative, not from an authorial argument',
    'Omniscient antagonist — the villain is capable and well-informed but not supernaturally prescient; they make one significant miscalculation that the protagonist exploits; the error should be plausible, not convenient',
    'Decorative description — setting is operational: cover approaches, sight lines, crowd density, extraction routes; landscape exists as a tactical condition, not an aesthetic experience',
    'Comic relief — the tone is serious throughout; wit exists only as professional understatement between operator and handler, never as a break in the urgency',
    'The happy ending — the mission succeeds but the cost is real; something has been lost or damaged that will not be recovered; the protagonist wins this round and carries the weight of having done it',
    'Romance as resolution — personal relationships exist and carry emotional weight but are never the climax; the mission is the spine; the relationship is what the mission costs'
  ],
  ARRAY[
    'The room was a standard Belgrade safe house: two exits, one street-facing window with a sight line across the square, a kitchen that smelled of the previous occupant''s cigarettes. Steele had memorized the floor plan before wheels down, but memory and presence were different things. He stood just inside the door and let his eyes run the space the way a contractor surveys a job site — not looking for problems, looking for the specific problem that would matter. The window angle was wrong. From where the handler had positioned himself, the approach from the east was invisible. Steele moved the chair sixteen inches without explanation. The handler watched him and did not ask why. That was the advantage of working with people who had been wrong before.'
    ,
    'At 0340 the device was no longer hypothetical. Twelve hours. That was what the signals intercept gave them — twelve hours to a transfer point they could not yet identify, in a city of one-point-seven million people, with two assets in place and one of them already burned. Director Nash called it a resource constraint. Steele called it what it was. He walked back to the operations table, looked at the map, and started with what he knew: the target moved at night, moved with three-person security, and had done this transfer twice before in cities with major rail hubs. He eliminated six districts in ninety seconds. That left three. He would need twelve hours and a better answer than the one he currently had. Twelve hours was exactly what he did not have.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Roman Steele stories (author_id: dd0a7a15-fcf1-4fb9-be6e-d3612eee0621)
UPDATE stories
SET voice_profile_id = 'e8337d23-982d-438a-b5bb-1c3cb16e33aa'
WHERE author_id = 'dd0a7a15-fcf1-4fb9-be6e-d3612eee0621';
