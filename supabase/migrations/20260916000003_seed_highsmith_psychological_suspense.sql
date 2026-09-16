-- Voice Card: Highsmith Psychological Suspense
-- style_slug: highsmith-psychological-suspense
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 15:29 EDT)
-- Linked to: author_id fb5ea62a-d82a-4c1c-900d-0f24b7924ce3 (Caroline Drake), 39 stories
-- voice_profile_id: e9af5a20-2f29-49e5-b1f8-b07c03f7087a
--
-- NOTE: style_slug uses 'highsmith' as a style tradition reference only.
-- The display name describes a house style. Author attribution never surfaces to users.

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
  'e9af5a20-2f29-49e5-b1f8-b07c03f7087a',
  'highsmith-psychological-suspense',
  'Highsmith Psychological Suspense',
  1,
  'The reader inhabits a consciousness that is wrong, and does not want to leave it — complicity is not warned against but engineered, and the ordinary world proves to be the most reliable container for the monstrous.',
  'Declarative surfaces over roiling depths. Short to medium sentences that carry more than they admit; subordinate clauses that open and do not quite close. The exact noun, the exact verb — nothing overdramatized, nothing underlined. Adverbs are absent. Rhythm accelerates not through shorter sentences alone but through a reduction in the gaps between what is said and what is meant. Flaubertian flatness: the world reported as fact, regardless of what the facts contain.',
  ARRAY[
    'Reader-criminal alignment: Open on the protagonist doing something ordinary with unusual competence. Let the reader settle into identification before the discomfort begins. The wrongness arrives after the reader has already chosen a side.',
    'Flat-affect violence: When the act occurs, report it in the same register as a grocery list — no slowing, no lingering, no shifted diction. The horror lives in the prose not changing. The gap between the act and the calm is where the reader does the work.',
    'Suppressed interiority: The protagonist thinks around the thing they cannot think about. Approach the fear obliquely — a coffee cup, a specific date, an unfinished sentence — then veer away. Never name the dread directly. The reader assembles it from the circumference.',
    'The mundane detail as load-bearer: A particular shirt, a radio program, the angle of afternoon light. These are not atmosphere; they are structure. The ordinary world is where the dread lives. What the protagonist notices tells us what they are avoiding.',
    'Moral permission creep: Track each small compromise in the character''s own reasoning, without authorial judgment. The character does not decide to cross a line; they discover, looking back, that they crossed it some time ago. Each step makes the next one feel like continuation, not choice.',
    'The world that almost notices: Secondary characters register that something is off — a hesitation, a wrong smile, a door closed too quickly — but cannot name it. Their half-awareness is more frightening than confrontation. No one accuses. No one quite looks away.'
  ],
  'Dread is accumulative, never explosive — tension built through what the reader understands that no character will say aloud. Moral ambiguity is maintained without authorial verdict: the reader is left to perform the moral labor alone, which implicates them. Violence is clinical and brief; the shock lives in the aftermath and the protagonist''s adjustment back to ordinary life, not in the act itself. Resolution is deliberately unsatisfying: guilt does not confess, justice does not arrive, and the crime settles into the character''s life like sediment — present, weighting everything, visible only if you know where to look. The ending is not a release; it is a continuation under new conditions.',
  ARRAY[
    'suddenly — Highsmith never surprises; she accumulates. Sudden events break the mechanism.',
    'Protagonist horror at their own actions — the character adjusts, rationalizes, moves on; self-horror is a different genre.',
    'A detective or authority figure who resolves the plot — external resolution kills the interior engine and lets the reader off the hook.',
    'Explained psychology — never name the pathology, never trace the wound to a childhood scene; the reader supplies the diagnosis.',
    'Melodramatic physical reaction — no trembling hands, no cold sweat as signal, no involuntary gasp; the body is controlled even when the mind is not.',
    'Gore or graphic violence — the act is dispatched in a sentence or two; the reader''s imagination is the instrument, not the prose.',
    'Moral clarity — no interior monologue that arrives at a verdict; ambiguity is not a problem to solve but the point of the whole enterprise.',
    'Sympathetic victims — victims in this mode are inconvenient, sometimes complicit; making them sympathetic breaks the reader-alignment trap.',
    'Action-thriller pacing — no countdown clocks, no chase scenes; the threat is interior and chronic, measured in weeks of low-level dread.',
    'Confession or breakdown — the crime does not surface into language; it becomes part of the character''s architecture, not their story.'
  ],
  ARRAY[
    'The dinner had gone well. Philip thought about this on the drive home — the way Garrison had laughed at the right moments, the way his wife had refilled Philip''s glass without being asked. They had not mentioned David at all. Three hours, two bottles of a very good Bordeaux, and not a word about David, who had been their mutual friend and was now, as far as Philip knew, still at the bottom of the quarry outside Lausanne. He turned onto the highway and kept both hands on the wheel.',
    'She didn''t think about the money. There was no reason to think about it. It was in the account, which was in her name, which was how Gerald had wanted it. The fact that Gerald had not wanted it this specific way — had not intended the account to persist past his own life — was a distinction that she found, on the few occasions it surfaced, easy to set aside. The house needed a new roof. She called the contractor on Monday.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Caroline Drake stories (author_id: fb5ea62a-d82a-4c1c-900d-0f24b7924ce3)
UPDATE stories
SET voice_profile_id = 'e9af5a20-2f29-49e5-b1f8-b07c03f7087a'
WHERE author_id = 'fb5ea62a-d82a-4c1c-900d-0f24b7924ce3';
