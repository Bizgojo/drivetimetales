# CANON-03 — The Writer (Script Rules)
Status: **APPROVED** (Marc, Nov 9, 2026: "approve canon 01–15") · Owner: Marc · Changes only through CANON-99 (CANON-00 rules 10–16)
Covers: everything the pipeline script writer must do — who may write, maps before drafting, hook and opening, structure, cliffhangers and endings, clarity, script format, speaker labels, text the voices will speak, length, and the writer's own checks. Does not cover: planning and briefs (CANON-02); Belle intro/outro wording (Belle CANON doc); sound effects, mixing, voices, covers, publishing and the player (their own CANON docs).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 2 [MARC DECIDES]:** Author-written series (today only The Sunset of Competition) are never rewritten or regenerated. On a failed check the pipeline stops and reports;…
- **Rule 58 [MARC DECIDES]:** NARRATIVE_VOICE is declared (first_person, third_limited, third_omniscient) and held on every narrator line. second_person needs Marc's approval.
- **Rule 59 [MARC DECIDES]:** NARRATOR_IS_CHARACTER: true needs Marc's approval and a non-platform voice.
- **Rule 90 [MARC DECIDES]:** Gemini reads the scripts before voicing (continuity, easy listening, logic, promise, credibility) and lists exact fixes. Report-only until Marc…
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. Who writes
1. Only the pipeline writer writes or edits scripts. No agent (Orion, Hal, Atlas, Claude in chat) writes or edits a script, even to fix one line. A failed check sends the script back to the pipeline writer. — **Agreed** (AGENTS.md "All story writing goes through the pipeline; no agent writes or edits scripts"; PIPELINE-CANON STORY-CLARITY RULE Defaults, Nov 8)
2. **[MARC DECIDES]** Author-written series (today only The Sunset of Competition) are never rewritten or regenerated. On a failed check the pipeline stops and reports; only mechanical edits Marc approves are made. — **Agreed** (Marc Nov 3, memory /projects/…/areas/sunset-of-competition.md)
3. The writer writes from the author's database record and style sheet every time, never from memory. — **Agreed** (CANON_REGISTRY STYLE-001, Nov 1)
4. Lines using Claude's stock phrases ("a testament to", "something shifted", "the silence stretched", "a breath she didn't know she was holding" and the rest of the list) are sent back for a rewrite in the author's voice. — **Agreed** (STYLE-001; list in lib/authorStyle.ts STOCK_PHRASES)
5. When a check fails, the writer gets the exact problem and the exact lines, and rewrites — at most 2 rewrites per episode. After that the story stops with one plain reason. — **Agreed** (Story Production Spec §1 and §5, approved Nov 7)
6. A rewrite revises the previous draft (keeps what works); it does not start over. — **In force (code)** (WRITER-REVISE-001, lib/scriptReadiness.ts)
7. Every rewritten script goes back through all script checks before voicing. — **Agreed** (Story Production Spec §8.1 gap 2)

### B. Before drafting
8. The writer first makes a Story Resolution Map with six parts: main hook/problem, why the solution seems hard, middle movement, final solution (stated specifically), why the ending is earned, and how this story differs from recent ones. It goes in a comment block (<!-- … -->) that is removed before audio. — **Agreed** (STAGE2_SCRIPT_PROMPT v2.3, approved June 10)
9. The map fails if: the hook is generic, the difficulty is not stated, the middle does not shape the ending, the solution could happen in minute two, or "earned" is explained with vague words like "because of the journey." — **Agreed** (Marc, Nov 9, 2026, CANON-99 decision 69; was: docs/STORY_RESOLUTION_MAP_RULES.md, Marc-owned doctrine with no approval record)
10. Production notes live only in the map comment block or the header. Nothing else above or inside the story body. — **Proposed** (the cover maker read the map block and drew maps on ~30 covers, Nov 4)
11. Write the cliffhanger first; write or revise the opening after the rest of the episode. — **Agreed** (STAGE2 r38, r42)
12. Variety: do not lean on worn shapes — "the trusted authority was the villain", "the narrator was dead all along", "the monster was grief", last-minute villain confession, final newspaper/radio/voicemail reveal. — **Agreed** (STAGE2 map "Variety guardrail") with the list **Proposed** (docs/CLAUDE_STORY_ARCHITECTURE_BIBLE.md)

### C. Hook and opening
13. The first spoken story line after Belle is a hook in under 15 words. For a hook-first series, Episode 1's first line is the approved hook, word for word. — **Agreed** (HOOK-FIRST-001, Marc Jul 24; Story Production Spec §3.1 and §5; memory profile "hook within 15 words")
14. Every episode opens with tension, a question or stakes — never weather, waking up, or backstory. — **Agreed** (CANON_REGISTRY HOOK-001; STAGE2 r8)
15. Within 60 seconds the listener knows who the main character is, where we are, and what is happening. The hook comes from clarity, not confusion. — **Agreed** (STAGE2 v2.3 clarity rule; PUBLISHED_STORY_SPEC v1.5)
16. By minute 3 (about 480 spoken words) the listener knows: who we follow, what is happening, what they want or fear, why it matters, and what we are listening to find out. — **Agreed** (STAGE2 r42 Early Investment Rule; STORY-CLARITY check 2, Nov 8)
17. Episode 2 and later: within the first 30 seconds after Belle's intro, one line says where things stand. — **Agreed** (STORY-CLARITY check 6; Story Production Spec §3.4)
18. Each episode starts within one line of where the last one ended. — **Agreed** (Story Production Spec §3.3)
19. Pocket FM mode only: the lead is wronged within the first 2 minutes of Episode 1, and something big happens every 2–3 minutes. — **Agreed** (POCKET-FM-STYLE RULE, Nov 5)

### D. Structure
20. Something changes every 3–4 minutes (about 480–640 spoken words): a reveal, reversal, new threat, or decision with consequences. No scene ends in the same state of knowledge it began. Stories of 20+ minutes have a midpoint reversal. — **Agreed** (STAGE2 r33 Turn Rule)
21. Each episode has one small conflict that opens and closes inside it, one high point, and a hard ending. Episodes 2 and 3 each raise the stakes again. — **Agreed** (Story Production Spec §3.3)
22. Every scene moves the goal, the obstacle, or a relationship forward. Two or more scenes that don't = fail. — **Agreed** (STORY-CLARITY check 5)
23. At least one major development from each episode is felt in the next. Characters are never reset. — **Agreed** (STAGE2 r41)
24. Do not replay earlier scenes except as brief context. Do not reuse an earlier episode's central object, discovery or secret device. — **Agreed** (Marc Oct 28; EPISODE-VARIETY-001 in writer prompt)
25. After every scene break: name the character within the first narrator lines, make the scene's stakes clear within 30 seconds, and mark the new place or time. — **Agreed** (STAGE2 r40)
26. No critical fact lives in one throwaway line. Important reveals get one callback. — **Agreed** (STAGE2 r40; Bible Part XV)
27. Each scene grounds its place with two concrete sensory details in its first three narrator lines. — **Agreed** (STAGE2 r34, June) — see Conflict C7
28. Action stories (style "action"): move faster, describe less, keep it easy to follow by ear. — **Agreed** (Marc Oct 29, memory story-pipeline.md; SERIES-STYLE-ACTION-001, lib/seriesStyle.ts)
29. Believable: every event and conclusion follows from what the story has set up, judged by the story's own rules. No character knows something the story never told them. — **Agreed** (Story Production Spec §3.4 and §6.3; Bible Part XI)
30. A character never contradicts their own instruction or plan within a scene. — **Agreed** (Story Production Spec §3.4, Rerouted EP2)
31. Stakes may grow, but the type of threat stays inside what the premise set up (no small-town fraud turning into a global conspiracy without setup). — **Agreed** (Marc, Nov 9, 2026, CANON-99 decision 69; was: CLAUDE_STORY_ARCHITECTURE_BIBLE "Escalation Ceiling", no approval record)
32. Protagonists are good at something; the problem exceeds their skill. — **Agreed** (Bible Part VIII)
33. Story first. Never stop to teach a lesson; no character speaks for the author. The last narrator line is a concrete image or action, never "She had learned that…", "He understood now that…", "The truth was that…". — **Agreed** (Bible Entertainment First Rule; STAGE2 r39)

### E. Cliffhangers and endings
34. Every non-final episode ends on a hard cliffhanger: a revelation, danger, betrayal, discovery, or irreversible decision. — **Agreed** (CANON_REGISTRY CLIFFHANGER-001; STAGE2 r38; memory profile "hard cliffhangers")
35. The cliffhanger must be writable as a specific question the next episode answers. Banned: "things will get worse", the same kind of danger again, a cliff solved in the next episode's first 60 seconds, an ominous stranger, "little did she know", weather or breakdowns as stakes, "to be continued". — **Agreed** (STAGE2 r16, r38)
36. A non-final episode resolves its own episode problem first, then strengthens the series question. — **Agreed** (STAGE2 map hard rules)
37. Pocket FM mode: end at the moment that hurts most. — **Agreed** (POCKET-FM-STYLE RULE)
38. The last episode of a season in an ongoing series ends on a hard cliffhanger; finale rules do not apply to it. — **Agreed** (Story Production Spec §7)
39. A closed series' finale answers the central question and resolves all major threads, with at most the one sequel thread its plan allows. — **Agreed** (CANON_REGISTRY ENDING-001; Story Production Spec §3.3; SERIES-NEMESIS-001)
40. A standalone resolves its main conflict completely, shows the protagonist's moment of recognition, and its last narrator line feels conclusive. — **Agreed** (Bible r31 and Standalone Completion Standard, June 10)
41. The climax happens on stage, the protagonist's own action decides it, and the ending never comes from coincidence, an offscreen rescue, a convenient confession, or a rule introduced at the end. — **Agreed** (STAGE2 map hard rules) with the flags **In force (code)** (run-next writer prompt "Ending hard rules")
42. Open endings (the main question left hanging) are allowed only about 1 story in 5, only for authors whose style sheet calls for it, and only when built up to. — **Agreed** (STYLE-001 / ENDING-OPEN-001, Marc Nov 1) — see Conflict C8

### F. Story clarity (drive-time listening)
43. Every episode passes the seven-part clarity check before any voicing: three-sentence test, goal clear by minute 3, cast limit, no unexplained insider words, every scene has a purpose, recap line (Episode 2+), easy to follow by ear. A fail sends it back to the writer with the lines quoted. — **Agreed** (PIPELINE-CANON STORY-CLARITY RULE, Nov 8)
44. Cast limit, not counting Belle: at most 4 named speaking characters for a standalone or a series of 3 episodes or fewer; at most 6 for longer series; at most 2 new named characters per episode after Episode 1. — **Agreed** (STORY-CLARITY check 3) — see Conflict C6
45. At most 3 voices in one scene. — **Agreed** (Story Production Spec §3.4, Nov 7; Pocket FM rules)
46. Acronyms, trade words, local places and organizations are explained in plain words the first time, or cut. — **Agreed** (STORY-CLARITY check 4)
47. The narrator introduces every new character before or right after their first line, and names speakers often. — **Agreed** (STAGE2 "The Narrator"; Story Production Spec §3.4)
48. Nothing exists only visually: if it matters, someone says it. — **Agreed** (Bible r9; Story Production Spec §3.4)
49. Short sentences, plain modern words, big feelings said out loud (about a 10th-grade reading level). — **Agreed** (Story Production Spec §3.4; PUBLISHED_STORY_SPEC v1.5)
50. No two main characters have names that sound alike. — **Agreed** (Story Production Spec §3.4)
51. The story never points to its own events by episode or chapter number ("in episode two", "next episode"). Use "earlier", "that night at the lake", "soon". Only Belle says episode numbers. — **Agreed** (Story Production Spec §3.4) — see Q3
52. Dialogue turns are 1–3 sentences; no speech over 5 sentences without a break. Narrator passages over 4 sentences are broken up. — **Agreed** (STAGE2 "Dialogue Turn Length", "The Narrator")

### G. Script format
53. Script order: header fields, CHARACTER GUIDE, BELLE B intro, [START AUDIO DRAMA SCRIPT], story body, BELLE B OUTRO. The resolution-map comment block may sit at the very top. — **Agreed** (Story Production Spec §5) — see Conflict C1
54. Header fields: TITLE, SERIES, EPISODE, EPISODE_TITLE, SERIES_TOTAL_EPISODES, SERIES_IS_FINALE, AUTHOR, GENRE, DESCRIPTION, NARRATOR, ANNOUNCER: Belle B, NARRATIVE_VOICE, NARRATOR_IS_CHARACTER, SUNO PROMPT. — **Agreed** (Bible Part XII; STAGE2 header block)
55. TITLE: 1–5 words, 28 characters or fewer, never "Episode N" or the series title. — **Agreed** (Story Production Spec §5)
56. DESCRIPTION (story card): fits two card lines (at most 100 characters), present tense only, teases a question, never reveals the twist or outcome. — **Agreed** (Marc Nov 5 "fills two lines"; DESC-TENSE-001 Marc Oct 29; DESC-100-CHAR-001) — see Conflict C4
57. NARRATOR header is the assigned narrator's voice name from the author's pairing, never a story character. — **Agreed** (STAGE2 lookup table) and **In force (code)** (HAL-SCRIPT-001; run-next narrator check)
58. **[MARC DECIDES]** NARRATIVE_VOICE is declared (first_person, third_limited, third_omniscient) and held on every narrator line. second_person needs Marc's approval. — **Agreed** (Bible r22, r27)
59. **[MARC DECIDES]** NARRATOR_IS_CHARACTER: true needs Marc's approval and a non-platform voice. — **Agreed** (Bible Part XIII)
60. CHARACTER GUIDE lists every speaking character, starting with the exact speaker label, then age, gender, accent and a personality/tone note. — **Agreed** (STAGE2 "Character Guide"; PUBLISHED_STORY_SPEC v1.5) and **In force (code)** (CAST-GUIDE-001)
61. Every spoken line in the body starts with a speaker label in CAPITAL LETTERS, exactly as in the guide, using the character's full canonical name from the series cast. — **Agreed** (Story Production Spec §5) and **In force (code)** (HAL-SCRIPT-002, SCRIPT-LABELS-001)
62. A character has one label however they are addressed (John Smith, Mr. Smith, John → one label, one voice). — **Agreed** (CHARACTER-NAMES-001, Marc Oct 30)
63. Belle never appears as a character; no character is cast with a platform voice. — **Agreed** (Bible r29)
64. [SFX: …], [BEAT], [PAUSE:N], [MUSIC:OUT]/[MUSIC:IN] each sit on their own line, never inside a spoken line. — **Agreed** (Bible r4, r6; STAGE2)
65. One character never speaks two lines in a row. Between them goes a NARRATOR line, a [BEAT], a [PAUSE], or another character's line. — **Agreed** (Dialogue Separation Rule, Marc June 10) — see Conflict C10
66. Youngest speaking character is 14; a teen character must sound their age. — **Agreed** (CANON_REGISTRY CONTENT-002)
67. Content: late-night cable standard. No graphic violence or explicit sex (romance heat through tension and kisses only). — **Agreed** (Bible r13; Pocket FM rules)
68. Banned words: "fuck" and derivatives, "cunt", racial and other slurs of that weight. "Shit", "damn", "hell" are allowed. — **Agreed** (CANON_REGISTRY LANGUAGE-001; list awaits Marc's expansion)
69. "Endless Tales presents" is never written anywhere. — **Agreed** (CANON_REGISTRY CONTENT-001)

### H. Text the voices will speak
Every character in a spoken line is sent to the voice. Anything that is not a word to be said aloud must not be there.
70. Write every number as words in every spoken line: times, ages, money, counts, addresses, codes, plates, serial numbers ("transaction zero zero one", "three twelve in the morning", "lane three"). This includes Belle lines and titles. — **Agreed** (Story Production Spec §5, Nov 7; memory profile "numbers spelled out") and **In force (code)** (numeral pre-TTS scan blocks, lib/numeralPreTtsScan.ts; simple numbers auto-spelled, lib/spokenNumerals.ts) — see Conflict C5
71. A code with a separator is written the way it is said: "four four seven dash zero zero one nine". — **Proposed** (QC-SPOKEN-DASH-001 already accepts the spoken "dash", lib/transcriptQC.ts, Oct 26)
72. No parentheses or stage directions in a spoken line: no "(quietly)", "(sighs)", "(to himself)". Tone goes in a NARRATOR line before the dialogue. — **Agreed** (Bible r5; STAGE2) and **In force (code)** (generate-voices refuses inline cues before voicing, findInlineProductionCues)
73. A character's line holds only the words that character says aloud. Actions, reactions, movement and thoughts go under NARRATOR. — **Agreed** (STAGE2 "convey tone through narrator lines") and **In force (code)** (NARRATION-PRESENCE-001 blocks scripts with narration under character labels or no NARRATOR lines)
74. A sound cue is never written as a speaker label ("SFX:", "SFX-001:"); the voice would read it aloud. Only [SFX: short description] on its own line. — **In force (code)** (SCRIPT-LABELS-001 blocks and auto-fixes, lib/scriptLabels.ts)
75. A scene break is a blank line or a cue, never a spoken line like "NARRATOR: ---" or "NARRATOR: * * *". — **Agreed** (WORDLESS-LINE-001, Marc GO Sep 28: "---" was voiced as random words in Origin 2.0 EP03; code turns such lines into a 1.5-second pause)
76. Finish each sentence on its own line. Never split one sentence across two lines with a dash at the end of the first. For a character who is cut off, end the line with "…". — **Proposed** (TRAILING-DASH-001, Marc Nov 7: line-final dashes garbled in Sunset Ep 8; the voice step now turns a final dash into "…", lib/speakableText.ts, but scripts still carry them — 59 in Sunset alone)
77. No markdown in spoken lines: no asterisks, underscores, # headings, bold or italics. — **Proposed** (the voice step strips them, generate-voices generateVoiceLine; the writer should not rely on that)
78. Never write the same line twice in a row, by the same or another speaker, unless the repeat is the point of the scene. A check flags any exact repeated spoken line in an episode. — **Proposed** (Sunset: "many characters spoke their lines twice", repeats cut by hand from the audio, memory sunset-of-competition.md; Marc's lead "double lines")
79. Header lines, the CHARACTER GUIDE and anything before [START AUDIO DRAMA SCRIPT] (except the Belle intro) are never voiced. Nothing meant for the listener goes there. — **In force (code)** (lib/scriptLineIndex.ts parser)
80. [LISTENER_NAME] never appears in the story body. — **Proposed** (the voice step replaces a stray token with "friend", generate-voices; Belle rules cover where the token may appear)
81. Dialogue lines have at least 5 words, and never start with a one-word sentence ("Yes. He retired…"). — **In force (code, prompt only)** (HAL-SCRIPT-006, HAL-SCRIPT-007 in run-next standalone prompt; the Spec audit found the check is never called) — see Q4 and Conflict C10

### I. Length
82. Speaking rate for all estimates is 160 words per minute. — **Proposed** (Story Production Spec §8.2 conflict 7 resolution; code uses 160) — see Conflict C3
83. A series episode must estimate at least 12.5 minutes before any voicing: 2,000 spoken words, Belle lines included. — **Agreed** (Marc Oct 26 "option 2", memory story-pipeline.md; Story Production Spec §5) and **In force (code)** (SCRIPT-RUNTIME-PREFLIGHT-001, lib/scriptRuntimeEstimate.ts)
84. A series episode may not exceed the brief's length × 1.35 (at 160 wpm). — **Agreed** (Story Production Spec §5) and **In force (code)** (SERIES-RUNTIME-MAX-001)
85. The writer aims at the brief length × 160 spoken words, within ±10%. — **In force (code)** (seriesSpokenWordTarget, WRITER-PROMPT-GATES-001)
86. A standalone script estimates within ±15% of its brief before voicing; the finished mix must land within ±10%. — **In force (code)** (lib/scriptReadiness.ts RUNTIME-BRIEF; RUNTIME-GATE-001, lib/runtimeGate.ts)
87. Pocket FM episodes: 12–15 minutes (2,000–2,400 spoken words). — **Agreed** (POCKET-FM-STYLE RULE)
88. Length comes from real scenes and beats, never padding. — **In force (code)** (writer rewrite feedback, lib/scriptReadiness.ts)

### J. Checks on the writer's work before voicing
89. Writer self-check (free, every draft): card copy, narrator header, narration presence, numbers, labels, sound-cue format, stock phrases, runtime floor and ceiling, Belle line present, character guide. — **In force (code)** (SCRIPT-READINESS-001, WRITER-SELF-CHECK-001)
90. **[MARC DECIDES]** Gemini reads the scripts before voicing (continuity, easy listening, logic, promise, credibility) and lists exact fixes. Report-only until Marc gives it power. — **Agreed** (Story Production Spec §6.3 and §9.2, Nov 7) and **In force (code, report-only)** (GEMINI-STORY-READ-001)
91. The whole series is read together for contradictions (an event resolved twice, a character under two names, the dead returning), and every "my sister / my cousin" line is checked against the fact sheet. A failure rewrites that episode and every later one, at most 2 times. — **Agreed** (Marc Oct 29 "permanent"; SERIES-FACTS-001 Nov 7) and **In force (code)** (SERIES-CONTINUITY-001, SERIES-FACTS-001, SERIES-REWRITE-001)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 3:** **Hook length.** The rules say 15 words; the code passes up to 30. Decided: 15 words, blocking, for every new Episode 1. The 5 live hooks keep their wording. (02 C2, 03 C2, 08 C1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 4:** **Episode length.** Decided: standalones within ±10% of target; series episodes between the 12.5-minute floor and 1.35 × the brief; speaking rate 160 words per minute everywhere. Publish code uses the same numbers (today it only allows 15–20 minutes). (02 C5, 03 C3, 08 C2, 09 C4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 6:** **Cast size.** Decided: the Nov 8 clarity rule wins: at most 4 named speakers (short stories), at most 6 (longer series). The code's 5/7 is changed. (03 C6) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 7:** **Numbers.** Decided: every number spoken is written in words, including years ("nineteen ninety-eight"). (03 C5, Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 8:** **Story card description.** Decided: fills two lines, never a third (about 100 characters), checked in one place. The old 24-word and 70-character limits go. (03 C4, 12 C6) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 9:** **Endings.** Decided: about 1 in 5 standalones may end open; a series finale always answers its central question; one escaped villain is allowed; Belle never teases a sequel. (02 C6, 03 C8) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 10:** **Spoken-text checks.** Decided: two new blocking writer checks: (a) no sentence split across lines with a trailing dash; (b) no line said twice in a row. Drop HAL-SCRIPT-006 and the 5-word minimum per line. (03 C10, Q1, Q2, Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 11:** **"Chapter" and "episode" inside the story.** Decided: characters never say "chapter" or "episode" in dialogue. (03 Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 128 (narrows decision 11):** Characters must not refer to the story itself as an episode or chapter ("next episode", "this chapter", "episode two"); ordinary uses are fine ("she had an episode", "chapter four" of a book). Same as rule 51. — **Agreed** (Marc, Nov 10, 2026)
- **Decision 12:** **Retire old manual documents** as history: STORY_PRODUCTION_PROCESS v1.2, SCRIPT_VALIDATOR.md, STORY_GRADING_RUBRIC.md, STORY_BRIEF_TEMPLATE v2.2, NEDS scoring, character-attachment scoring, MASTER_RULES.md, DEPLOY.md, DEPLOYMENT-RUNBOOK.md, HAL_SESSION_START_PROTOCOL.md, MIX_SPEC.md and MIX_NOTE_PROTOCOL.md level tables, et_mix_assembly.py, ACQUISITION-RETENTION-001 Parts A, D, E. Decided: yes, all. (01 C1, 02 C4, Q5, Q6, 03 Q7, 07 C4, C6, 13 C9, 15 C3–C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 14:** **Script order.** Decided: header, character guide, then Belle's intro (the Nov 7 spec; what the code reads). (03 C1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 15:** **Description load.** Decided: 2 sensory details per scene for standard stories; one short detail for action and Pocket FM stories. (03 C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 66:** Story clarity: the goal is clear within about 480 spoken words (3 minutes at 160 words per minute). (03 C9) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 67:** Drop the NEDS score header. (03 C11) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 68:** The old sound rules in the writer documents (3–6 anchor sounds, no beds, sounds 6 dB under voices) are removed; the sound and mix canons own sound. (03 C12, 06 C1, 06 C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 69:** The Escalation Ceiling and the story-map acceptance checks become law. (03 Q6) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 14, Marc Nov 9, 2026]** Script order: STAGE2 v2.4 puts the Belle intro block BEFORE the header; the Story Production Spec (Nov 7) and the run-next writer template put header, guide, then Belle. Recommendation: the Spec order (newer, and what the code parses).
- C2. **[RESOLVED by decision 3, Marc Nov 9, 2026]** Hook: 15 words (HOOK-FIRST-001, Spec Nov 7) vs 30 words in lib/hookGate.ts (HOOK_PASS_WORD_LIMIT=30, comment says 15) vs approved ad hooks up to 21 words (Nov 4). Recommendation: 15 in prompt and code; the 5 live hooks keep their wording.
- C3. **[RESOLVED by decision 4, Marc Nov 9, 2026]** Speaking rate: code 160 wpm (calibrated Oct 22); STAGE2 and SCRIPT_VALIDATOR word tables use 130 wpm; hook gate uses 3 words/second (180). Recommendation: 160 everywhere; delete the 130-wpm tables.
- C4. **[RESOLVED by decision 8, Marc Nov 9, 2026]** Card description: Marc Nov 5 "fills two lines" and lib/validateCardCopy.ts (100 characters) vs the writer prompts (run-next and generate-script DESCRIPTION-001) and lib/scriptReadiness.ts still demanding ≤24 words. Recommendation: 100 characters, one rule in one file.
- C5. **[RESOLVED by decision 7, Marc Nov 9, 2026]** Numbers: Spec says "all numbers as words, including Belle lines"; but YEAR-DIGITS-001 (code) lets 4-digit years stay as digits; the standalone prompt says badge, case and code numbers "may use digits" while the numeral scan blocks them; HAL-SCRIPT-005 allows digits if used consistently; code lets the digit in "Episode N" through in Belle's intro. Recommendation: words everywhere in spoken lines, years included ("nineteen ninety-eight"); remove the digit exceptions from the prompts. Belle's "Episode N" goes to the Belle doc.
- C6. **[RESOLVED by decision 6, Marc Nov 9, 2026]** Cast size: STORY-CLARITY (Nov 8) says 4 or 6 named speakers; lib/seriesStyle.ts allows 5 (action) or 7 main characters. Recommendation: Nov 8 numbers; update the code.
- C7. **[RESOLVED by decision 15, Marc Nov 9, 2026]** Description load: Sensory Anchor Rule (June, 2 details per scene) vs Marc Oct 29 "action stories less environment description" and Pocket FM "little description". Recommendation: keep 2 details for standard mode, one short detail for action and Pocket FM modes.
- C8. **[RESOLVED by decision 9, Marc Nov 9, 2026]** Open endings: PUBLISHED_STORY_SPEC v1.5 "No ambiguous endings" and Bible "finale … not ambiguity" (June) vs ENDING-OPEN-001 (Nov 1) allowing ~1 in 5. Recommendation: Nov 1 wins for standalones; a closed series' finale still answers its central question.
- C9. **[RESOLVED by decision 66, Marc Nov 9, 2026]** Early investment word count: STAGE2 r42 says ~400 words by minute 3 (130 wpm); STORY-CLARITY says ~480 (160 wpm). Recommendation: 480.
- C10. **[RESOLVED by decision 10, Marc Nov 9, 2026]** HAL-SCRIPT-006 tells the writer to put "Yes." on its own line before the same character's next line, which breaks the Dialogue Separation Rule (rule 65). HAL-SCRIPT-007 (5-word minimum) also fights natural short dialogue and Pocket FM's fast style. Both exist only to suit the transcript checker. Recommendation: drop 006 and 007 from the prompt and fix the transcript check instead.
- C11. **[RESOLVED by decision 67, Marc Nov 9, 2026]** NEDS_SCORE header: required by Bible and STAGE2 r37; the series writer template in run-next does not ask for it and no code reads it. Recommendation: drop it (see CANON-02 Q5).
- C12. **[RESOLVED by decision 68, Marc Nov 9, 2026]** STAGE2, SCRIPT_VALIDATOR and the brief template still require 3–6 "anchor" sound effects; Marc removed the cap Oct 31 and sound is off. Recommendation: sound doc owns this; delete from writer docs.

## Open questions for Marc
- Q1. **[RESOLVED by decision 10, Marc Nov 9, 2026]** Rule 76 (no sentence split across lines with a trailing dash): make it a writer rule and a check? Suggested answer: yes; the voice-step fix stays as a safety net.
- Q2. **[RESOLVED by decision 10, Marc Nov 9, 2026]** Rule 78 (no line said twice in a row): add a free check that flags exact repeated spoken lines? Suggested answer: yes, block on it.
- Q3. **[RESOLVED by decision 11, Marc Nov 9, 2026]** Rule 51: should it also cover in-story books ("you fall asleep in chapter four", Rerouted EP2)? Claude asked Nov 7; no answer found. Suggested answer: yes, avoid "chapter" and "episode" in story dialogue entirely.
- Q4. **[RESOLVED by decision 10, Marc Nov 9, 2026]** Keep the 5-word minimum per dialogue line (rule 81)? Suggested answer: no (Conflict C10).
- Q5. **[RESOLVED by decision 7, Marc Nov 9, 2026]** Years: may a spoken line say "1998" as digits, or must it be "nineteen ninety-eight"? Suggested answer: words.
- Q6. **[RESOLVED by decision 69, Marc Nov 9, 2026]** Should the Escalation Ceiling (rule 31) and the map acceptance checks (rule 9) become law? Suggested answer: yes; Gemini's credibility question already covers most of it.
- Q7. **[RESOLVED by decision 12, Marc Nov 9, 2026]** Retire SCRIPT_VALIDATOR.md (manual paste-into-chat validator) and STORY_GRADING_RUBRIC.md (Marc listens to every story) now that the self-check, clarity check and Gemini read exist? Suggested answer: yes, both become history.

## Enforcement status
- Rule 1 → not enforced in code (agent rule). Rule 2 → enforced (lib/authorWrittenExempt.ts).
- Rules 4–6, 85, 88–89 → enforced (lib/authorStyle.ts, lib/scriptReadiness.ts: 2 rewrites, WRITER_MAX_FAILED_INVOCATIONS=2). Stock phrases are a soft gate (rewrite, never block alone).
- Rule 7 → not enforced yet (Spec gap 2).
- Rule 8 → prompt only; the LLM validator checks it; no code check.
- Rule 13 → partial: lib/hookGate.ts passes at 30 words, NARRATOR lines only, standalones only (Spec gap 1).
- Rules 14–42 (story craft) → prompt only, plus the LLM validator; Gemini script read is report-only.
- Rule 43–46 → not enforced (clarity gate not built). Rule 45 → asked in Gemini read (report-only).
- Rule 55 → enforced (run-next title check). Rule 56 → enforced at 100 characters in lib/validateCardCopy.ts, but writer self-check still blocks at 24 words.
- Rules 57, 60–62 → enforced (run-next narrator check, CAST-GUIDE-001, SCRIPT-LABELS-001, CHARACTER-NAMES-001 rewrites labels).
- Rule 65 → not enforced in code (manual validator only).
- Rules 66–69 → not enforced in code found (LLM validator only).
- Rule 70 → enforced, blocking, before voicing (numeralPreTtsScan; auto-spelling of simple numbers).
- Rules 72–75 → enforced before voicing (generate-voices, NARRATION-PRESENCE-001, SCRIPT-LABELS-001, WORDLESS-LINE-001).
- Rules 76–78, 80 → not enforced in scripts; voice step patches dashes and markdown.
- Rule 81 → prompt only; no check runs.
- Rules 83–86 → enforced (SCRIPT-RUNTIME-PREFLIGHT-001, SERIES-RUNTIME-MAX-001, RUNTIME-GATE-001).
- Rules 90–91 → enforced (Gemini report-only; continuity, facts and rewrite loop on by default).

## Sources reviewed
- Repo (/tmp/dtt, shallow clone; git log only reaches Nov 8): AGENTS.md; docs/PIPELINE-CANON.md; Bible/CANON_REGISTRY_STORY_RULES.md; Bible/ET_Story_Rules_v3_2_CANONICAL.md; docs/STAGE2_SCRIPT_PROMPT.md (v2.4); docs/SCRIPT_VALIDATOR.md (v1.3); docs/STORY_RESOLUTION_MAP_RULES.md; docs/ENDING_SATISFACTION_VALIDATION.md; docs/SERIES_EPISODE_STRUCTURE_RULES.md; docs/CLAUDE_STORY_ARCHITECTURE_BIBLE.md; docs/STORY_GRADING_RUBRIC.md; docs/PUBLISHED_STORY_SPEC.md; code: lib/scriptReadiness.ts, lib/scriptLabels.ts, lib/scriptLineIndex.ts, lib/speakableText.ts, lib/numeralPreTtsScan.ts, lib/spokenNumerals.ts, lib/numberWords.ts, lib/narrationPresence.ts, lib/scriptRuntimeEstimate.ts, lib/runtimeGate.ts, lib/hookGate.ts, lib/validateCardCopy.ts, lib/seriesStyle.ts, lib/seriesContinuity.ts, lib/seriesFacts.ts, lib/seriesRewrite.ts, lib/geminiStoryRead.ts, lib/authorWrittenExempt.ts, lib/repairPlaybooks.ts, app/api/admin/generate-voices/route.ts, app/api/admin/production-jobs/run-next/route.ts (writer prompts), app/api/v2/generate-script/route.ts.
- Claude Doc "Endless Tales — Story Production Spec" (approved Nov 7; read in full).
- Memory: /projects/…/areas/story-pipeline.md, sunset-of-competition.md, audio-pipeline.md, preferences.md; /areas/story-pipeline.md; /profile.md.
- Past chats: "Cover story map pattern" (TRAILING-DASH-001 Nov 7, Sunset repeated lines, Pocket FM rules, Spec), "Clearing CEO series flag" (QC-SPOKEN-DASH-001, CHARACTER-NAMES-001, SFX-NAMED-001), "Gemini sound replacement loop" (Altar: max 3 voices per scene), "Apple App Store commission deals" ("Episode 1" → "Episode One").
- Project docs: the Projects tool was NOT available to me; claude/story-clarity-gate.md and claude/pocket-fm-style-rules.md were checked through PIPELINE-CANON and the chats that wrote them.

## Replaces (once approved)
- docs/STAGE2_SCRIPT_PROMPT.md (as a rule source; the prompt should be generated from this doc)
- Bible/ET_Story_Rules_v3_2_CANONICAL.md Parts I–IV, VI, X–XIII, XV, XVII–XIX (writing rules)
- CANON_REGISTRY HOOK-001, CLIFFHANGER-001, ENDING-001, CONTENT-001/002, LANGUAGE-001, STYLE-001 (writing parts)
- docs/SCRIPT_VALIDATOR.md, docs/STORY_GRADING_RUBRIC.md
- docs/STORY_RESOLUTION_MAP_RULES.md, docs/ENDING_SATISFACTION_VALIDATION.md, docs/SERIES_EPISODE_STRUCTURE_RULES.md, docs/CLAUDE_STORY_ARCHITECTURE_BIBLE.md
- PUBLISHED_STORY_SPEC v1.5 writing sections (style, opening, structure, endings, characters, audio clarity)
- PIPELINE-CANON STORY-CLARITY RULE (moves here; PIPELINE-CANON points to it)
- HAL-SCRIPT-005/006/007 prompt blocks in run-next
