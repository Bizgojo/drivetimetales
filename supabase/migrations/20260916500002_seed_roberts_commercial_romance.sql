-- Voice Card: Commercial Romance
-- style_slug: roberts-commercial-romance
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id a21a9ea0-fa94-4067-8c22-00b0543348f0 (Dani Reeves), 17 stories
-- voice_profile_id: ebb26056-3bcb-497b-8767-124e3c83c12d
--
-- NOTE: Nora Roberts (born 1950) is a living author.
-- display_name 'Commercial Romance' is craft-based; no living author name surfaces to users.
-- style_slug 'roberts-commercial-romance' is an internal key describing the house style tradition.

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
  'ebb26056-3bcb-497b-8767-124e3c83c12d',
  'roberts-commercial-romance',
  'Commercial Romance',
  1,
  'Love is not the complication — it is the destination. The reader arrives knowing where this goes and wants, with full sincerity, to get there. The journey is the pleasure: two people who are good at what they do, who have good reasons to be afraid of what they feel, moving through the specific obstacles that stand between where they start and where they belong.',
  'Fast, warm, and emotionally direct — the feelings are real and the narrative treats them that way without irony. Dialogue is the engine: quick, warm, often funny; the couple argues with desire underneath the argument, the attraction visible in the speed of the exchange. Prose moves efficiently between scene and interiority — the reader is never far from what the protagonist thinks and wants. The emotional register is confident: Roberts does not hesitate over the genre''s conventions; she inhabits them completely. Chapters typically end on an emotional beat or a moment of change; the architecture is as structured as a sonata and the reader knows where they are in it at all times.',
  ARRAY[
    'The romance architecture — two protagonists with complementary obstacles; one does not trust (because of the past), one does not commit (because of the wound); the emotional beats are structured: attraction, complication, deepening, crisis, resolution; the reader follows a familiar map through specific new terrain',
    'Community and place — Roberts grounds romance in specific places with specific communities; secondary characters have their own dynamics and they matter to the central relationship; the small town or close community is itself a character with history and investment in the protagonists',
    'Competence as romance — the heroes and heroines are good at what they do; watching someone do their work well is itself attractive; professional capability is a form of self-revelation and it is part of what draws them to each other',
    'The female gaze — desire is written from the heroine''s perspective with confidence and directness; what she wants, what she notices, what she imagines; this is not coded or euphemistic; it is centered on her interiority without apology',
    'The obstacle structure — internal obstacles (the protagonist''s wound, her fear of repetition) and external obstacles (the crisis, the antagonist, the family complication, the deadline) are carefully balanced; neither overwhelms the other; both must be resolved before the HEA is earned',
    'The earned resolution — the happily ever after is not a concession to convention; it is a genuine emotional payoff earned by the preceding pages; the reader has watched these two people grow to deserve each other; the ending lands because the journey was real'
  ],
  'Emotionally direct without being maudlin — the feelings are allowed to be what they are, which is real. Humor is warm and quick — the banter is a form of flirtation, the wit a form of intimacy. Conflict is real but not cruel: the obstacles are genuine and the misunderstandings are understandable, but the reader never doubts the fundamental decency of both protagonists. The setting and community carry warmth; the world of the novel is a place people want to live in. The reader is invited to want for the protagonists what they are afraid to want for themselves.',
  ARRAY[
    'Ironic distance from the emotions — the narrative does not wink at the reader about the genre; the feelings are real and deserve to be treated that way',
    'Sudden emotional reversal — character growth must be earned through dramatized experience; transformations that happen between chapters without preparation break the emotional contract',
    'suddenly — the romantic beats are prepared; the reader should feel the approach of the key moment, not be ambushed by it',
    'little did he know — the narrative is not coy; both protagonist and reader track the emotional progression together',
    'The cruel misunderstanding — conflicts have roots in established character wounds; not manufactured miscommunication that a single honest conversation would immediately resolve',
    'The flawless hero — Roberts''s protagonists are competent but not perfect; the wound is real, the fear is real, the growth is required and visible',
    'a wave of [emotion] washed over — emotion arrives through specific physical response and cognitive beat, not through generic wave-motion',
    'in that moment — the scene earns its beats; the key moments arrive through accumulated emotional logic, not through announcement',
    'The rescued female protagonist — she is competent; she may be in danger but she is not passive within it; the HEA is achieved together, not performed upon her',
    'Generic setting — the place has specific character and history; the community has specific people and dynamics; no placeholder geography'
  ],
  ARRAY[
    'The restoration crew had cleared out by five, which was when Lily allowed herself to stand in the empty front room and actually look at it. The floors were wrong — she knew it even before she crouched and ran her palm across the new boards — but the light was right, the same late-afternoon slant coming through the east window that the Farnsworth family had seen every day for a hundred and twelve years. This was why she did it: not the before-and-after reveal, not the listing photos, but this moment when a house remembered what it had been. She heard him come in behind her. She did not turn around.
"It''s the floors," he said.
She didn''t know why that annoyed her. "I know it''s the floors."
"I told you Henderson''s crew would rush it."
"You did. You were right. I don''t need you to be right at me right now."
A pause. Then: "I brought coffee."
She stood up, turned, and took the cup. He was watching her with the same expression he''d had the night she''d shown him the preliminary drawings — careful, like he was deciding how much to say. He had about eight more words worth of restraint, she knew, before the opinion arrived whether she wanted it or not. She found, unexpectedly, that she did not entirely mind.',
    'She had planned to dislike him. It was the efficient choice — the new fire chief who''d moved in next door two months ago and immediately developed opinions about her hedge that had since expanded to include her parking, her barn renovation timeline, and the breed of her sister''s dog. She had a category for men like this: competent and certain and used to being listened to. She put people in categories. It helped.
It did not help that he had carried her entire porch furniture through a rainstorm in six minutes because she''d made one offhand comment at the hardware store. It did not help that he had apparently read the same three books she had spent the last decade rereading. It did not help that when her sister had asked, at the Fourth of July cookout, what he thought of Mara''s renovation plans, he had said, accurately and without embellishment: "She''ll do it right." No qualifications. Just that. Her sister had given her a look she was still thinking about.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Dani Reeves stories (author_id: a21a9ea0-fa94-4067-8c22-00b0543348f0)
-- Covers both FK-linked and text-only stories
UPDATE stories
SET voice_profile_id = 'ebb26056-3bcb-497b-8767-124e3c83c12d'
WHERE author ILIKE '%Dani Reeves%';
