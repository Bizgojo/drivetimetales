INSERT INTO voice_profiles (
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
  'warm-southern-memoir',
  'Warm Southern Memoir',
  1,
  'Unhurried truth-telling from inside a specific place and time. The narrator knows more than they say and trusts the reader to catch what is left between the lines. Grief is carried lightly; warmth underneath everything.',
  'Sentences breathe — long spiraling clauses that fold back on themselves, broken by short declarative stops that land like stones. Dialect informs rhythm without caricature. Concrete nouns. Verbs that carry weight. Adjectives earned, not stacked.',
  ARRAY[
    'Root every scene in a specific sensory fact — a smell, a texture, a sound particular to that place and season. Never generic setting.',
    'Let silence do dialogue work. What a character does not say, refuses to answer, or answers obliquely reveals more than direct speech.',
    'Inheritance as theme: what was handed down — land, debt, grief, a way of standing — matters as much as what the character does today.',
    'Weather and land are active presences, not backdrop. The heat presses. The creek remembers. The field has an opinion.',
    'Revelation through gesture: the important thing happens in a small physical action, not in a speech or epiphany.',
    'Time moves in layers — a present moment opens into a memory which opens into a family story. The past is never past; it keeps arriving.'
  ],
  'Melancholy that never tips into self-pity. Warmth that never softens into sentimentality. Humor arrives dry and unexpected, usually from an old woman or a child. Violence, when it appears, is quiet and has been coming for a long time.',
  ARRAY[
    'little did he know',
    'suddenly',
    'realization dawned',
    'hushed tones',
    'X thought to himself',
    'his/her eyes filled with tears',
    'in that moment',
    'the irony was not lost on',
    'a wave of [emotion] washed over',
    'as if reading his/her mind'
  ],
  ARRAY[
    'The summer Daddy sold the back forty was the summer Mama stopped speaking at supper. Nobody named it. The food kept arriving on the table and we kept eating it, and the silence between the serving bowl and our plates stretched out like the field itself, going somewhere we couldn''t see the end of.',
    'Aunt Ceal kept the funeral programs in a shoebox under the bed, forty-some-odd years of them, the paper gone soft as cloth. She could tell you the weather at every one. Not what was said or who came, just the weather — whether the ground was hard or soft, whether you needed a jacket. That was her way of keeping the dead.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;
