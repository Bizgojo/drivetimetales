-- Voice Card: Village Mystery (penny-village-mystery)
-- style_slug: penny-village-mystery
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 16:07 EDT)
-- Linked to: author_id 9ce131ea-f5f4-4e2f-9085-1d58c8dce4bc (Iris Fontaine), 17 stories
-- voice_profile_id: 2fc28c54-9615-4600-9058-e353923d76bc
--
-- NOTE: style_slug 'penny-village-mystery' is Marc's explicit direction (Sep 16 2026).
-- Louise Penny is a living author. Display name is craft-based ('Village Mystery') —
-- describes a tradition, not a person. Author attribution never surfaces to users.

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
  '2fc28c54-9615-4600-9058-e353923d76bc',
  'penny-village-mystery',
  'Village Mystery',
  1,
  'A community that knows how to be good discovers that belonging is exactly what made the murder possible.',
  'Unhurried, trust-the-reader pacing that accumulates weight through observation and restraint rather than event and revelation. Sentences carry warmth and precision simultaneously — neither clinical nor sentimental, but humane. Sensory grounding is seasonal and specific: the particular cold of a Quebec November, the smell of woodsmoke in an old bistro, the quality of light on snow at four in the afternoon. Dialogue reveals through what is not corrected: the pause before an answer, the word chosen over a truer one, the thing a character lets pass without challenge. No rushing toward the reveal; the weight is in the accumulation. Short declarative sentences land like rests in music — used sparingly to mark a shift in gravity, not as a substitute for depth.',
  ARRAY[
    'Village-as-chorus: The regulars register something wrong before the investigator does. Their collective discomfort — the way Myrna closes her door with unusual care, the way Gabri does not call across the room — is an early warning system more reliable than testimony. The village notices before it speaks.',
    'The four-questions interview: Emotional intelligence as investigative method. Instead of asking what a witness saw, ask what they were afraid of when they saw it. The witness reveals themselves by answering the actual question — which is always about their own interior, not the event. The investigator waits. Silence is productive.',
    'Seasonal grounding: Open every major scene with a precise sensory fact about the season. The landscape carries emotional weight that the characters cannot name directly. Winter is endurance; the brief summer is fragile grace; autumn is reckoning. The land has its own memory.',
    'The art or object as clue: A painting, a line of poetry, a piece of music reveals something about the victim or killer that testimony cannot and will not. The victim''s taste is a biography. The killer''s aversion to a particular song is a confession.',
    'The slow revelation of the killer''s wound: The killer is not evil — they are someone whose wound finally overcame their belonging. Render the wound fully, across scenes, before the act is understood. The reader should feel the loss in the arrest, not just the relief.',
    'The institutional courage moment: At least one scene where the investigator chooses the right thing over the politically safe thing, at personal cost. The institution resists; the investigator acts anyway. This is not heroism but conscience, and it costs something real.'
  ],
  'Violence is restrained and offstage or briefly reported — one sentence, past tense, factual. The horror is in what it means to this particular community, not in what it looked like. Grief is specific and patient: it does not resolve in a scene; it changes shape across episodes, revealing new contours as characters encounter old triggers. Warmth is genuine and sustained — the village''s goodness is not ironic, not naive, not a setup for cynical subversion; it is the point, and the novel takes it seriously as a real human achievement worth defending. Moral ambiguity is present in the killer and sometimes in the institution, but never in the investigator''s final choices: they know right from wrong even when it costs them. The community must reckon, after the killer is named, with having harbored them — this reckoning is not an afterthought but part of the resolution.',
  ARRAY[
    'Thriller mechanics — no countdown clocks, no kidnapping in the final act, no car chases. The danger is moral and social, not kinetic.',
    'The cynical detective — the investigator is not world-weary, not hardened, not ironic about their own compassion. Warmth is not a pose and not a weakness.',
    'Cardboard victims — the dead person had a full life and the investigation reveals it incrementally. The victim is never merely a body or a plot device.',
    'Explained psychology — never have a character summarize why the killer did it in clinical or diagnostic terms. The wound is shown, not named. The behavior is the evidence.',
    'Rushed pacing — no "suddenly" turns, no compression of the final reveal into a breathless confrontation. The resolution earns its weight through accumulation, not acceleration.',
    'Graphic violence — the act is reported in one or two sentences, past tense, without lingering. The camera cuts away. The horror lives in the aftermath.',
    'Secondary characters as props — everyone in the village has their own interior life, their own arc, their own wound. The regulars are not backdrop; they are the meaning.',
    'The lone investigator — the lead works with a team; colleagues are full people with their own perspectives and limitations, not assistants or foils.',
    'Resolution that ignores the community''s wound — after the killer is named, the village must face what it means to have harbored them, possibly for years. This is the emotional climax, not a coda.',
    'Irony at the village''s expense — the goodness of the community is not naive or provincial or laughable. The novel takes seriously the idea that people can learn to be good to one another. This is its argument.'
  ],
  ARRAY[
    'By eight in the morning the news had traveled the length of the village twice. Not as news — no one had said anything directly — but as a quality in the air, a particular care with which Myrna had closed the bookshop door, the way Gabri had not called across the bistro to the Morrows when they came in. Clara noticed it before she had finished her first coffee. She looked out the window at the village green, the great tree bare now in November, and thought: something has happened to someone we know.',
    'Gamache did not ask her what she had seen. He asked her what she had been afraid of when she saw it. She looked at him for a moment with that particular expression he had learned to recognize — the look of someone who had been asked the actual question — and then she sat down, though he hadn''t asked her to. "I was afraid that I was right," she said finally. "I''ve been afraid of being right about this for three years." Gamache said nothing. He waited. Outside the window, the first snow of the season had begun.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Iris Fontaine stories (author_id: 9ce131ea-f5f4-4e2f-9085-1d58c8dce4bc)
UPDATE stories
SET voice_profile_id = '2fc28c54-9615-4600-9058-e353923d76bc'
WHERE author_id = '9ce131ea-f5f4-4e2f-9085-1d58c8dce4bc';
