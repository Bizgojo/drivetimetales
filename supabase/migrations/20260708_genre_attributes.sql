-- Migration: 20260708_genre_attributes
-- GENRE-ATTRIBUTES-SPEC v1.0 §5 — feature/genre-attributes-blp
-- Adds genre attribute columns to the genres table and seeds all 9 genres + 2 aliases.

ALTER TABLE genres ADD COLUMN IF NOT EXISTS listener_contract TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS pacing_profile TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS ending_contract TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS ending_failure_modes TEXT;  -- JSON array or newline-separated bullets
ALTER TABLE genres ADD COLUMN IF NOT EXISTS sound_profile TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS narrator_register TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS cover_art_guidance TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS adjacency_group TEXT;       -- INVESTIGATIVE|SUSPENSE|FRONTIER|LIGHT|SPECULATIVE
ALTER TABLE genres ADD COLUMN IF NOT EXISTS hard_rules TEXT;            -- JSON array or newline-separated bullets
ALTER TABLE genres ADD COLUMN IF NOT EXISTS alias_of TEXT;              -- references genres.name

-- ─── Seed values for all 9 canonical genres ────────────────────────────────

INSERT INTO genres (name, slug, active, display_order,
  listener_contract, pacing_profile, ending_contract, ending_failure_modes,
  sound_profile, narrator_register, cover_art_guidance, adjacency_group, hard_rules)
VALUES

  ('Mystery', 'mystery', true, 10,
   'A fair puzzle the listener could have solved.',
   'Methodical; information revealed in layers; tension is intellectual.',
   'THE CLICK — a reveal that logically re-orders everything the listener heard. All clues planted before the reveal. Payoff is retrospective.',
   '• Emotional resolution without logical solution
• Reveal depending on information never given
• Culprit/answer introduced late',
   'Restrained music; stings on reveals only; silence as a clue-beat.',
   'Measured, precise, withholding.',
   'Standard bright rule applies; intrigue via composition, not darkness.',
   'INVESTIGATIVE',
   '• Solution derivable from planted clues
• No reveal without prior setup
• The central question posed in the opening is answered'),

  ('Thriller', 'thriller', true, 20,
   'Escalating pressure with everything at stake.',
   'A ticking clock; shrinking options; chapters end mid-danger, never at rest.',
   'RELEASE — the accumulated pressure breaks decisively. Dark endings satisfy; quiet endings do not.',
   '• Tension deflating before the climax
• Threat resolved off-screen
• Stakes shrinking at the end instead of paying off',
   'Tighter music ducking; harder stings; percussive beds under chase or pursuit sequences.',
   'Urgent, driving, close.',
   'Standard bright rule applies; energy via subject and angle.',
   'SUSPENSE',
   '• A clock or closing window exists and is felt
• The climax happens on-page
• The ending releases the pressure — through triumph or catastrophe'),

  ('Horror', 'horror', true, 30,
   'Dread that gets under the skin and lingers.',
   'Slow accumulation punctuated by spikes; restraint before revelation.',
   'THE LINGER — the immediate ordeal resolves, but one door stays open. Full tidy resolution is a breach in this genre alone.',
   '• Over-explaining the horror
• A fully safe "everything is fine" close
• The threat neutralized so completely nothing lingers',
   'Low end and silence carry the genre; what is NOT heard matters; sparse stings, maximum contrast.',
   'Controlled, intimate, unhurried.',
   'DARK EXCEPTION APPLIES — subject matter legitimately dictates darker palettes. Legibility at thumbnail size still required.',
   'SUSPENSE',
   '• Dread is earned by restraint, not gore
• The immediate story question resolves even when the larger dread remains
• One deliberate open door'),

  ('Comedy', 'comedy', true, 40,
   'Rhythm, laughter, and order restored.',
   'Timing is the core attribute; setups pay off on a beat; pauses before punchlines are a production requirement, not a script suggestion.',
   'THE LIFT — endings land up: reconciliation, absurdity resolved, the world set right. Warmth is part of the payoff.',
   '• Ending on a down or neutral beat
• Final punchline unearned
• Resolution that abandons the comic premise for sudden seriousness',
   'Silence around punchlines; buoyant beds; stings only as comic punctuation.',
   'Warm, dry, impeccable timing.',
   'Bright rule applies emphatically — light palettes are part of the promise.',
   'LIGHT',
   '• The ending lands up
• Punchline beats get breathing room in the mix
• The comic premise is honored to the last line'),

  ('Western', 'western', true, 50,
   'A moral code tested in a lawless space; a reckoning delivered.',
   'Deliberate; the genre breathes; violence brief and consequential.',
   'THE RECKONING — justice-shaped even when bittersweet. The code is vindicated, the cost acknowledged.',
   '• Reckoning evaded
• Moral stakes dissolving into ambiguity with no verdict
• The code never actually tested',
   'Longer ambient beds (wind, distance, hooves); sparse music; space in the mix mirrors space in the setting.',
   'Grounded, weathered, unhurried.',
   'Bright rule applies naturally — daylight, open country, big sky.',
   'FRONTIER',
   '• The protagonist''s code is stated or shown early and tested
• A reckoning occurs
• Consequences are paid on-page'),

  ('Science Fiction', 'science-fiction', true, 60,
   'An idea taken seriously to its human conclusion.',
   'Idea-forward; wonder and unease alternate; exposition earns its place.',
   'THE IMPLICATION LANDS — the ending resolves what the idea MEANS for the people in the story, not merely the plot mechanics.',
   '• Plot resolved but the idea abandoned
• Technology as an unexamined magic fix
• Human cost raised then dropped',
   'Textural beds; clean design for tech elements; room for quiet wonder beats.',
   'Thoughtful, clear, capable of scale.',
   'Bright rule applies; wonder reads better in light than in murk.',
   'SPECULATIVE',
   '• One central idea, taken seriously
• The ending answers the idea''s human implication
• Internal rules of the world stay consistent'),

  ('Crime Drama', 'crime-drama', true, 70,
   'The human cost of crime, on both sides of the line.',
   'Character-forward; procedural beats serve emotional stakes.',
   'THE VERDICT — legal or moral, delivered with its cost visible. Resolution can be unjust, but it must be conclusive.',
   '• Case resolved with no human consequence shown
• Verdict ambiguous AND cost ambiguous (one may be open, not both)
• The crime forgotten',
   'Urban ambient beds; restrained music; stings on turns of the case.',
   'Sober, streetwise, humane.',
   'Standard bright rule applies; grit via subject, not underexposure.',
   'INVESTIGATIVE',
   '• The crime''s human cost is shown
• A verdict lands
• The opening case is the closing case'),

  ('Adventure', 'adventure', true, 80,
   'A journey with real obstacles and an earned arrival.',
   'Forward motion; set-piece obstacles; rest beats between dangers.',
   'THE ARRIVAL — the destination (literal or personal) is reached or decisively transformed; the journey''s cost and reward are both tallied.',
   '• Journey abandoned rather than concluded
• Obstacles that never mattered
• Arrival with no sense of earning',
   'Dynamic beds tracking terrain; movement in the mix; brighter palette than suspense genres.',
   'Energetic, vivid, companionable.',
   'Bright rule applies — daylight, horizon, motion.',
   'FRONTIER',
   '• The goal is stated early
• Obstacles cost something
• The ending arrives somewhere'),

  ('Heartwarming', 'heartwarming', true, 90,
   'An earned emotional payoff; the ending IS the product.',
   'Gentle build; small moments accumulate; no manufactured jeopardy.',
   'THE GLOW — an emotional payoff earned by everything before it. Sentiment must be built, never asserted.',
   '• Unearned sentimentality
• A twist that undercuts the warmth
• Payoff delivered by coincidence rather than character',
   'Warm beds; generous space; music may swell at the payoff — the one genre where it should.',
   'Warm, sincere, unhurried.',
   'Bright rule applies emphatically — warmth in palette is the promise.',
   'LIGHT',
   '• The payoff is earned by prior scenes
• No cynical undercut
• A listener should finish feeling better than they started')

ON CONFLICT (name) DO UPDATE SET
  listener_contract   = EXCLUDED.listener_contract,
  pacing_profile      = EXCLUDED.pacing_profile,
  ending_contract     = EXCLUDED.ending_contract,
  ending_failure_modes = EXCLUDED.ending_failure_modes,
  sound_profile       = EXCLUDED.sound_profile,
  narrator_register   = EXCLUDED.narrator_register,
  cover_art_guidance  = EXCLUDED.cover_art_guidance,
  adjacency_group     = EXCLUDED.adjacency_group,
  hard_rules          = EXCLUDED.hard_rules,
  active              = EXCLUDED.active;

-- ─── Aliases ────────────────────────────────────────────────────────────────
-- Mystery/Crime → alias of Mystery
-- True Crime → alias of Crime Drama

INSERT INTO genres (name, slug, active, display_order, alias_of)
VALUES
  ('Mystery/Crime', 'mystery-crime', true, 75, 'Mystery'),
  ('True Crime',    'true-crime',    true, 77, 'Crime Drama')
ON CONFLICT (name) DO UPDATE SET
  alias_of = EXCLUDED.alias_of,
  active   = EXCLUDED.active;
