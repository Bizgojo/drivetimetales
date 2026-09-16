-- Seed: Sagan Cosmic Wonder voice profile
-- Author: Marc Postlewaite (f838eafc-fc6b-4c2f-abd9-509228ecf667)

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
  '24677f8c-f0ba-4eee-8c0e-2e395cfca271',
  'sagan-cosmic-wonder',
  'Cosmic Wonder',
  'The universe is not indifferent — it is astonishing, and a single human life, seen from the right distance, is proof of that.',
  'Measured and building — the sentence starts specific (one fact, one object, one moment) and expands toward the cosmic. The paragraph structure is a zoom-out. Numbers used precisely: distances in light-years, timescales in billions. Plain English for profound ideas; no jargon without translation.',
  ARRAY[
    'The zoom-out — open at human scale (a child, a window, a particular evening) then expand to planetary, stellar, galactic; the transition earns its emotional weight',
    'The pale blue dot move — locate a specific, ordinary human concern within the vast indifferent universe; the contrast is the point; the smallness creates tenderness, not nihilism',
    'Scientific precision as poetry — use exact numbers (13.8 billion years, 100 billion stars) where a less careful writer would say "ancient" or "countless"; precision increases wonder',
    'The skeptic''s embrace — acknowledge the absence of certainty, then show what the evidence does reveal; the wonder is in what is actually known, not in what is imagined',
    'Deep time as moral perspective — situate a human conflict or choice within geological or cosmic time; this does not diminish the choice, it clarifies its actual weight',
    'The question that opens rather than closes — end a section with a question the narrator cannot answer; the reader carries it forward; it is not rhetorical'
  ],
  'Wonder without sentimentality. Rigor without coldness. The tone is that of a scientist who has looked at the evidence and is moved by it — not despite the evidence but because of it. When darkness appears (extinction, the heat death of the universe, human cruelty), it is faced directly and then set into the larger frame.',
  ARRAY[
    '"indescribable" — if it cannot be described, describe it anyway; this is the job.',
    'Mysticism as substitute for precision — wonder does not require the supernatural.',
    'Anthropomorphism of the universe — the cosmos is not "trying" to do anything.',
    'Sudden.',
    'Condescension toward the non-scientist reader — the reader is assumed capable of understanding anything if it is explained well.',
    'Generic awe ("it was so beautiful") without the specific sensory or intellectual fact that produced the awe.',
    'Resolution that does not earn its hope — optimism must be grounded in evidence, not in feeling.',
    'The lecture — the narrator shares, does not instruct; the distinction is in tone, not content.',
    'Scientific jargon left untranslated.',
    'Death treated as anything other than a natural fact — no euphemism; no sentimentality; no supernatural frame.'
  ],
  ARRAY[
    'On a clear night in the high desert, away from the light pollution of any city, you can see with the unaided eye approximately five thousand stars. Each one is a sun. Most of them have planets. Some of those planets are in the right place for liquid water. We have known this for less than thirty years. Before that, we guessed. We were right.',
    'The carbon in your body was forged in the core of a star that exploded before the sun existed. This is not a metaphor. It is a fact of nuclear physics, confirmed by spectroscopy, consistent across every measurement we have ever made. You are made of exploded stars. So is the person next to you. So is the coffee cup. The distinction between the cosmic and the personal is a matter of scale, not of kind.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link author
UPDATE authors SET voice_profile_id = '24677f8c-f0ba-4eee-8c0e-2e395cfca271'
WHERE id = 'f838eafc-fc6b-4c2f-abd9-509228ecf667';

-- Link stories
UPDATE stories SET voice_profile_id = '24677f8c-f0ba-4eee-8c0e-2e395cfca271'
WHERE author_id = 'f838eafc-fc6b-4c2f-abd9-509228ecf667';
