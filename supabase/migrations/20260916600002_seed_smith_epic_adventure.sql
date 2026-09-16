-- Seed: Smith Epic Adventure voice profile
-- Author: Zara Osei (8e9efca3-9a7f-4c02-b13d-8f2626c8067a)

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
  'bbe62f28-06a7-46de-900e-688236907032',
  'smith-epic-adventure',
  'Epic Adventure',
  'The world is larger than any single life, and the hero''s task is not to conquer it but to prove worthy of it.',
  'Direct and muscular at the sentence level — no wasted words, no passive voice. Paragraphs build through accumulation of concrete detail: the color of the soil, the weight of the humidity, the behavior of the animals. The rhythm accelerates in action and slows for landscape. Numbers and distances are precise; Africa has specific dimensions.',
  ARRAY[
    'The Africa opening — establish the specific geography in the first paragraph: the season, the vegetation, the light, the smell; never generic Africa, always a particular place in a particular month',
    'The dynasty frame — position the protagonist within a family history; their father or grandfather made a choice that echoes here; the past is load-bearing',
    'The physical test — the hero must demonstrate competence against a natural obstacle (a river crossing, a storm, a wounded animal) before facing any human antagonist; nature judges character',
    'The competent antagonist — the villain''s plan is good; they nearly succeed; the hero must genuinely outthink them, not just outfight them',
    'The romance forged in danger — love in a Smith novel is earned through shared extremity; a quiet dinner is not romantic; surviving together is',
    'The return to the land — after the climax, the final scene returns to the landscape; the Africa remains; the dynasty continues; the individual story resolves into the larger continuity'
  ],
  'Grand without being pompous. Violent without being gratuitous. Romantic without being saccharine. The emotional register is earnest — Smith takes his world seriously and the reader is invited to do the same. Death is permanent and mourned specifically; the land does not care; life continues.',
  ARRAY[
    'Generic Africa — every scene is a specific place at a specific time of year; "African savanna" alone is insufficient.',
    'Incompetent hero — the protagonist must be measurably good at something before the story requires it of them.',
    'Sentimental death — when a character dies, the prose does not linger; grief is real and then the story moves.',
    'Villain as cartoon — the antagonist has a coherent worldview and a plan that nearly works.',
    'Suddenly.',
    'Modern irony — Smith''s world is not ironic; the adventure is earnest; the heroism is genuine.',
    'The land as backdrop — geography acts on the characters; weather, terrain, and animals are participants.',
    'Resolution that doesn''t cost anything — the victory must come at a price that is paid in full.',
    'Romance as subplot — love is a primary thread, not relief from the action.',
    'The untested hero — competence is demonstrated before it is required.'
  ],
  ARRAY[
    'The rains had come early to the Limpopo basin that year, and the grass was already knee-high where it had been burned in August. Courtney knew this country the way a man knows the house he grew up in — not by the name of every room but by the particular sound of the floor in the dark. He had been tracking the bull since first light, following the track through the red soil and the pressed grass, reading the hours in the drying edges of each print.',
    'She was not afraid of him. That was the first thing he noticed. Most people, when they realized who he was — what he had done in the delta, what the men who worked for him were capable of — showed him at least the courtesy of fear. She looked at him the way you look at a problem you have decided to solve. He found, to his mild surprise, that he respected her for it.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link author
UPDATE authors SET voice_profile_id = 'bbe62f28-06a7-46de-900e-688236907032'
WHERE id = '8e9efca3-9a7f-4c02-b13d-8f2626c8067a';

-- Link stories
UPDATE stories SET voice_profile_id = 'bbe62f28-06a7-46de-900e-688236907032'
WHERE author_id = '8e9efca3-9a7f-4c02-b13d-8f2626c8067a';
