-- Voice Card: Institutional Crime Procedural
-- style_slug: institutional-crime-procedural
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 15:40 EDT)
-- Linked to: author_id 3cf276ca-b281-49c1-ab22-84e6b72ebf79 (Julian Mercer), 21 stories
-- voice_profile_id: a964e4a2-45db-4bb7-b315-1f02002d8419
--
-- LEGAL NOTE: style_slug and display_name are craft tradition descriptors.
-- No living author is named in the slug or display name.
-- Reference authors are le Carré (deceased 2020) and a Connelly-tradition procedural style.
-- These appear only in code comments (developer context), never in user-facing content.

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
  'a964e4a2-45db-4bb7-b315-1f02002d8419',
  'institutional-crime-procedural',
  'Institutional Crime Procedural',
  1,
  'A case worked with absolute procedural discipline reveals that the institution protecting the crime is the same one employing the detective — and the detective closes the file anyway, knowing that justice and resolution are not the same thing.',
  'Two rhythms in controlled alternation. Inside the investigation: short declarative sentences, the case file as prose measure — subject, verb, finding, implication; no flourish, no commentary. Inside the moral landscape: subordinate clauses that qualify and complicate, institutional language deployed with precise irony, bureaucratic vocabulary used to name the thing it is supposed to conceal. The prose never editorializes. It accumulates. A sentence may end before the reader is ready, because the detective has already moved on. Dialogue is clipped and functional — information exchanged in short bursts, with what is withheld carrying more weight than what is said.',
  ARRAY[
    'The institutional tell: a bureaucratic phrase, a procedural nicety, a form correctly filed — that reveals, to the patient reader, exactly who is being protected and why. The document does not lie; it simply declines to speak.',
    'Evidence as moral weight: a physical object — a date-stamped memo, a photograph, a floor plan — carries the full moral horror of what happened without the prose annotating it. The detective sets it down. The reader does the rest.',
    'The patient timeline: the crime did not happen when it appears to have happened. Pull the thread and the case stretches back years, through decisions that seemed administrative at the time. The wrongdoing was enabled long before it was committed.',
    'Competence as character: the protagonist''s expertise is shown through specific procedural action — the way he reads a filing, requests a document, times a question — never described as a quality. The reader sees tradecraft in motion and understands who this person is without being told.',
    'The resistant institution: the department, the firm, the government office does not obstruct through villainy. It obstructs through paperwork, through jurisdiction, through the polite suggestion that the matter has already been reviewed. The horror is the process functioning exactly as designed.',
    'The imperfect resolution: the case is closed. The file is complete. The person responsible may face consequences — partial, delayed, or purely technical. The system that produced the crime is intact, slightly adjusted, already generating the next one. The detective''s last act is to sign the report.'
  ],
  'Moral ambiguity is maintained without authorial verdict — neither condemned nor resolved; the reader carries the weight. Procedural dread builds through accumulation: each piece of evidence is correct and the conclusion it points toward is one no one in the institution wants reached. Violence is reported accurately and briefly; the aftermath and its administrative processing matter more than the act. Institutional irony is the dominant mode: the language of due process used to describe its own betrayal, the correct form filed for the wrong reason. The detective''s personal life appears only at the edge of scenes — a missed call, an empty flat, a meal eaten standing at a counter — never resolved, never dramatized.',
  ARRAY[
    'Action set-pieces — no car chases, no running gunfights, no rooftop confrontations; the protagonist works a room, reviews a file, conducts an interview',
    'Explained institutional corruption — no character delivers a speech about why the system is broken; the system demonstrates this through its own operation',
    'The lone maverick who breaks all rules to get the bad guy — the detective works within procedure even as procedure resists him; rule-breaking is not heroism here',
    'Psychological profiling as magic — the detective does not intuit the perpetrator''s childhood wound or reconstruct their inner life; he reads documents and interviews witnesses',
    'Melodrama at resolution — when the answer arrives, it arrives quietly, in an office, in ordinary language; no confrontation scene with speeches',
    'Cartoonish villains — the antagonist is competent, credentialed, and human; the evil here is institutional and banal, not personal and theatrical',
    '''suddenly'' — accumulation, not surprise; the revelation was always there in the record',
    'Romantic subplot as relief valve — personal life is wreckage, kept off-camera; it does not resolve and does not redeem the professional work',
    'Explicit gore — violence is described with the same tone as a property report; the reader''s imagination is the instrument',
    'Moral clarity at the end — the final line does not confirm that justice was done; it confirms that the file is closed'
  ],
  ARRAY[
    'Mercer pulled the file at seven-fifteen, before the morning shift arrived. The victim''s name was Gerald Ashworth, forty-four, fund compliance officer. He had been reported missing eleven days before his body was found in the stairwell of a parking structure in Canary Wharf. The responding officers had noted the absence of a wallet and closed the matter as robbery within the week. Mercer read this and set it aside. He was less interested in what the responding officers had concluded than in who had reviewed their conclusion and done nothing with it.',
    'The director of the foundation had been helpful in a specific way: she had been helpful about everything except the thing Mercer needed. She had provided dates, organizational charts, the names of former board members who had since moved on. She had offered coffee twice. What she had not provided was the third quarter report from 2019, which she had referred to twice using a phrase — "an internal document" — that Mercer recognized as a technical term. It meant: this document exists, and you are not going to see it.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Julian Mercer stories (author_id: 3cf276ca-b281-49c1-ab22-84e6b72ebf79)
UPDATE stories
SET voice_profile_id = 'a964e4a2-45db-4bb7-b315-1f02002d8419'
WHERE author_id = '3cf276ca-b281-49c1-ab22-84e6b72ebf79';
