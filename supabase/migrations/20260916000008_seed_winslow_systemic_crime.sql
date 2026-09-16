-- Voice Card: Systemic Crime Epic
-- style_slug: winslow-systemic-crime
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 16:55 EDT)
-- Linked to: author_id db62ba17-be3c-4f4e-a105-90449ef84a25 (Dex Carver), 13 stories
-- voice_profile_id: 88b97709-c5af-46ee-84a3-7c5209808231
--
-- NOTE: style_slug 'winslow-systemic-crime' is Marc's explicit direction — use exactly.
-- display_name 'Systemic Crime Epic' is craft-based; no living author name surfaces to users.
-- Don Winslow (born 1953) is a living author; this profile describes a house style tradition only.

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
  '88b97709-c5af-46ee-84a3-7c5209808231',
  'winslow-systemic-crime',
  'Systemic Crime Epic',
  1,
  'The crime is never committed by one person — it is committed by the system, which recruits everyone it needs and discards them when they are used up.',
  'Short chapters, often two to five pages and sometimes one: each chapter does a single thing — shifts POV, advances one thread, deepens one character. Declarative sentences at pace; the prose does not linger on an image when it can move to the next fact. Lists as rhythm: names, quantities, dates, transactions — the machinery of crime documented in the language of machinery, the prose mimicking a ledger or an evidence log. Occasional lyric break — a paragraph of landscape, a character''s one moment of memory — earns its weight precisely because the surrounding prose refuses decoration. Violence reported with flat affect; the horror is in the scale and repetition, not the individual act; melodrama would falsify the scope. White space as moral commentary: the chapter that ends on a single sentence says there is nothing more to say about this.',
  ARRAY[
    'The system diagram — open a new storyline by establishing the institutional position of each character: who they answer to, what they want, what they are protecting. The reader understands the machine before watching it run. This is not exposition; it is architecture.',
    'The mirror POV — show the same event or the same operational reality from two opposing perspectives (cartel and DEA; cop and criminal; bank compliance officer and money launderer) in adjacent short chapters. The structural parallel is the moral argument: these systems are built the same way, serve the same logic, and produce the same outcomes by opposite means.',
    'The list chapter — write a chapter as a series of transactions: names, quantities, dates, payments, shipments, routes. No narrative interiority, no scene. The accumulation is the horror. Cut immediately to a human chapter — a character''s face, a family dinner, a moment of doubt — so the reader carries the ledger into the human scene.',
    'The complicity reveal — a character the reader has been rooting for makes a choice that serves the system rather than the victim: uses tainted intelligence, accepts a compromised arrangement, looks away from the thing that would cost too much to see. Write this without authorial judgment. Describe the choice and its operational logic. Let the reader hold it.',
    'The tragic repetition — find a moment where history is explicitly repeating: a new cartel fills the space of the old one; a new corrupt official takes the place of the last; a new agent burns out on the same case. The reader should recognize the pattern. The characters should not. The gap between reader knowledge and character knowledge is where the tragedy lives.',
    'The lyric break — one paragraph of landscape, weather, or memory given to a character at their most isolated or most exhausted. It is not advancing plot. It is breathing. It earns the surrounding machinery and signals that the system has not yet consumed everything human in the person the reader is following.'
  ],
  'Scale: the violence is so large that melodrama would falsify it; report it at the level of the system, not the individual act — how many, where, what it cost to move, who approved it. Moral complexity: characters are neither heroes nor villains but nodes in a system that produces both heroic acts and atrocities; the reader holds both simultaneously and without resolution. Tragedy: the reader sees the outcome before the characters do; dramatic irony is structural, not decorative — it is the way the form argues that the system''s power comes from its opacity. Institutional irony: the language of the system (the DEA mission statement, the cartel code of honor, the bank compliance procedure, the political press release) is used straight, as evidence against itself — the gap between the language and the reality is where the indictment lives. Resolution: the system survives; the individuals are consumed; the next cycle begins; a specific wrong may be addressed but the structure that produced it remains intact and ready for the next participant.',
  ARRAY[
    'The lone savior — no single hero defeats the system; the system is too large and too distributed; individual victory is local and temporary and the system adapts around it; the reader must understand this before the last page',
    'Moral clarity for the protagonist — the hero is complicit; this is not a character flaw to be overcome, it is the structural point; clean hands are a lie the system tells about itself, and the protagonist who claims them is the system''s most effective fiction',
    'A contained plot — if the story can be told without reference to the institutional machinery that produced the crime, it is not a systemic crime story; the cartel boss''s decision connects to the DEA budget that connects to the political calculation that connects to the bank that holds the money',
    'Villain as psychopath — the cartel boss is not crazy and does not enjoy cruelty as an end; they are a rational actor in an irrational system whose logic is internally coherent; the reader should be able to follow every decision even while opposing it',
    '''Suddenly'' — nothing in a systemic crime story is sudden; every explosion was prepared for years by dozens of rational decisions; the word announces a failure to show the reader the machinery; replace it with the sequence that made the outcome inevitable',
    'Resolution as victory — the drug war is not won; the precinct is not cleaned up; the system is not reformed; a specific wrong is addressed while the structure continues; endings that suggest the machine has been beaten are a form of dishonesty about how these systems work',
    'Sentimentality about the fallen — characters die because the system requires it, not because the author chose drama; grief is noted and the story moves on at the pace of the system, which does not stop for individuals',
    'Single-POV tunnel vision — the story must show the system from multiple institutional positions; one perspective cannot contain the truth of how the machine operates; the reader''s superior knowledge (assembled from all the partial views) is the moral argument',
    'Thriller pacing throughout — the short chapters create momentum but some chapters must breathe; the lyric break and the quiet scene are not optional decorations; without them, the scale of violence becomes numbing rather than indicting',
    'Explained corruption — never have a character deliver a speech about why institutions become corrupt or why the drug war cannot be won; the structure of the narrative demonstrates it; explanation converts argument into lecture and loses both'
  ],
  ARRAY[
    'Between January and March of that year, the Salazar organization moved 340 kilos of methamphetamine through three distribution nodes in Riverside, Stockton, and Portland. The money went: 40% to operating costs, 30% to cartel tribute paid to the Sonora federation, 18% through three shell companies registered in Delaware and Nevada, 12% to the network of local law enforcement officials whose cooperation was not voluntary but was reliable. The DEA''s Western Division was aware of two of the three distribution nodes. They were building a case. The case would take eighteen months. By then, the nodes would have moved.',
    'Carver had the photograph of the Salazar lieutenants taped to the wall of the task force room for eleven months. He knew their names, their routes, their supply chain. He also knew that the information had come from a source whose own operation he was not authorized to touch, per an arrangement his supervisor had reached with an office he was not permitted to name. He looked at the photograph. He was building a case. The case was real. The arrangement was also real. He had learned, in this work, to hold both things at the same time. Most days he could do it. Today was one of the other days.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Dex Carver stories (author_id: db62ba17-be3c-4f4e-a105-90449ef84a25)
UPDATE stories
SET voice_profile_id = '88b97709-c5af-46ee-84a3-7c5209808231'
WHERE author_id = 'db62ba17-be3c-4f4e-a105-90449ef84a25';
