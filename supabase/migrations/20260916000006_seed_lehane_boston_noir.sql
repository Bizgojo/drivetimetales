-- Voice Card: Boston Noir
-- style_slug: lehane-boston-noir
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 16:14 EDT)
-- Linked to: author_id 0c1c467d-0078-47ee-a8c0-7b69d70fe3c5 (Declan Marsh), 13 stories
-- voice_profile_id: 9808fbd6-ae92-4b60-a94b-2f1fd722db13
--
-- NOTE: style_slug 'lehane-boston-noir' is Marc's explicit direction.
-- display_name 'Boston Noir' is craft-based; no living author name surfaces to users.
-- Dennis Lehane is a living author; this profile describes a house style tradition only.

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
  '9808fbd6-ae92-4b60-a94b-2f1fd722db13',
  'lehane-boston-noir',
  'Boston Noir',
  1,
  'A neighborhood that survives by not asking certain questions finds its silence enforced by the very violence it was meant to prevent.',
  'First-person or tight third, working-class intelligence — not uneducated but specifically educated by geography and survival. Dialogue terse and sideways; characters deliver meaning obliquely, never directly. Dark humor used sparingly as armor, marking the protagonist''s capacity to cope without surrendering. Sentences build through concrete detail rather than abstraction — nouns that belong to specific places, verbs that carry neighborhood weight. Violence reported in the same flat register as a weather forecast; the weight lives entirely in what follows the act.',
  ARRAY[
    'The neighborhood as moral witness — establish what the block knows, what it has decided not to know, and what it actively protects before the investigation begins; the geography is not backdrop but a character with memory, loyalty, and the capacity to punish',
    'The childhood scar as structural fact — something that happened before the novel began is shaping every present choice; reveal it in pieces through behavior and deflection, never as exposition; the wound migrates forward and does not resolve',
    'The ethical double bind — construct the central moral question so that the right answer and the wrong answer share the same shape; there is no clean exit, no choice that does not cost something irretrievable',
    'Violence via accumulation — the act must be traceable backward through at least three prior choices; show the chain before the conclusion; nothing arrives without preparation; consequence, not spectacle',
    'Dialogue as misdirection — characters answer questions with questions, deflect with jokes, or deliver partial truths; what is omitted is what is real; the reader pieces together meaning from the gaps between what is said',
    'The cost counted afterward — the scene or chapter immediately following a moral choice registers what it cost the protagonist; this accounting is never skipped; the protagonist returns to a world unchanged while they themselves are not'
  ],
  'Moral ambiguity is structural, not decorative — the neighborhood''s codes are not wrong exactly, but they produce wrong outcomes; the protagonist lives inside this tension without resolving it. Violence is consequence, not spectacle; the act is brief, the aftermath is long and specific. Class and race are present and structural, never preachy; the reader sees the machinery, the narration does not explain it. Dark humor is the protagonist''s weapon against despair; it never undercuts the weight of what is happening but marks survival. Resolution is partial: the case closes but the wound remains; the neighborhood absorbs and forgets; the protagonist carries knowledge that cannot be transferred and cannot be used.',
  ARRAY[
    'Thriller spectacle — no action set-pieces for their own sake; if there is a fight it matters structurally and ends badly for someone; the genre''s pleasures are moral, not kinetic',
    'The noble working class — the neighborhood is not romanticized; it has its own cruelties, its own complicity, its own willingness to sacrifice the weak to preserve the whole',
    'Expository guilt — never have a character explain their own psychology; the damage is shown in behavior, deflection, and silence, not narrated as backstory',
    'Clean resolution — the case closes; the wound does not; the protagonist returns to a world structurally unchanged by what they learned; justice is partial at best',
    'suddenly — violence and revelation both accumulate; nothing arrives without preparation; the word announces a failure of craft',
    'The neighborhood as backdrop — geography must be specific and load-bearing; if the story could be moved to any city without loss, it has been written wrong; Dorchester is not interchangeable with anywhere',
    'Sentimental children — children at risk in this mode are endangered in ways that are specific and structural; the reader feels dread, not manipulation; the threat is real and the cost is real',
    'Inarticulate characters — working-class does not mean simple; the characters are precise, oblique, and strategically obscure; they know exactly what they are not saying',
    'Violence as catharsis — the violent act must not feel satisfying; it is the conclusion of a failure, not a release; the reader should feel the weight, not the relief',
    'Moral clarity for the protagonist — the investigator does not emerge knowing they did the right thing; the reader holds that question alongside them without resolution'
  ],
  ARRAY[
    'I''d grown up on that block. I knew which houses had dogs and which had guns and which, in a pinch, were the same. Paulie Fogarty saw me coming and took his coffee inside. That was information. In this neighborhood, a man who takes his coffee inside when he sees you coming has already decided not to know what you''re about to ask him. The question was whether he''d made that decision this morning, or twelve years ago, when Sheila Brennan stopped coming to school and nobody filed a report.',
    '"You did the right thing," Angie said.
I''d heard that before. I''d said it to other people. I knew exactly how much it weighed.
"Yeah," I said.
She looked at me. "You don''t believe that."
"I believe it," I said. "I just don''t know if it matters."
Outside, the neighborhood was already forgetting. The kids had gone back to their corners. The curtains had closed. In a week the story would be different and in a month there would be a new story and Sheila Brennan''s name would survive only in the specific silence people made when someone almost said it.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Declan Marsh stories (author_id: 0c1c467d-0078-47ee-a8c0-7b69d70fe3c5)
UPDATE stories
SET voice_profile_id = '9808fbd6-ae92-4b60-a94b-2f1fd722db13'
WHERE author_id = '0c1c467d-0078-47ee-a8c0-7b69d70fe3c5';
