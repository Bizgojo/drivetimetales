# CANON-02 — Story Ideas, Series Planning & Briefs
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: everything decided before a script is written — genres, authors, premise, hook, series type and length, series bible, cast and fact sheet, hook-first series, Pocket FM opt-in, series continuation, runtime targets in the brief, the brief itself. Does not cover: writing the script (CANON-03 The Writer); Belle intro/outro wording; sound, mixing, voices, covers, publishing and the player (their own CANON docs).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 8 [MARC DECIDES]:** No story is written for an author who lacks a style model or a complete style sheet. The job stops and asks Marc.
- **Rule 19 [MARC DECIDES]:** A colliding brief is bounced for rework, never retried automatically. Only Marc can let it through, by a recorded override with his name and…
- **Rule 20 [MARC DECIDES]:** A premise near a known-adjacent cluster gets a warning but proceeds. Only Marc adds or retires a cluster.
- **Rule 28 [MARC DECIDES]:** Preferred series lengths are 3, 5, 7 or 13 episodes. Any other length needs Marc's explicit approval.
- **Rule 30 [MARC DECIDES]:** Long Pocket FM series (e.g. 30 episodes) are allowed when Marc orders them, planned in arcs of 10, with one big turn every 10 episodes.
- **Rule 31 [MARC DECIDES]:** When Marc or Maya sets an episode count, the story has exactly that many episodes.
- **Rule 39 [MARC DECIDES]:** Pocket FM–style writing is used only when Marc says "use the rules for Pocket FM type stories."
- **Rule 53 [MARC DECIDES]:** After a series finale, the series is scored for character attachment (0–8); 5+ = recommend a new season to Marc. New seasons must raise stakes,…
- **Rule 54 [MARC DECIDES]:** Adding episodes never re-plans, rewrites, re-titles, re-hides or re-voices episodes that already exist. New episodes are planned only for the…
- **Rule 63 [MARC DECIDES]:** When Marc or Maya sets a per-episode length, each episode lands within ±20% of it.
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. How a story starts
1. Every story starts from four inputs: genre, series type (closed or ongoing), number of episodes in this batch, and style mode (standard drive-time, or Pocket FM). The requester sets them. — **Agreed** (Story Production Spec §3, approved by Marc Nov 7, 2026; Claude Doc "Endless Tales — Story Production Spec")
2. Planning comes before writing, in this order: hook, master premise, cast, fact sheet, series outline. No episode script is written until all five exist. — **Agreed** (Story Production Spec §2–§4; Marc Oct 29: "a whole-series plan before episode one … permanent", memory /projects/…/areas/story-pipeline.md)
3. All story writing goes through the pipeline. No agent (Orion, Hal, Atlas, Claude in chat) writes or edits a script. Agents may draft plans (hook, premise, bible) for Marc. — **Agreed** (AGENTS.md "Agent rules (Marc, standing)"; PIPELINE-CANON STORY-CLARITY RULE, Defaults)
4. Each step of planning has exactly one owner. No "Claude or Strategos." — **Agreed** (Story Production Spec §1)

### B. Genres and authors
5. The genre comes from the genres table. — **Agreed** (Story Production Spec §3 input table)
6. Each genre has exactly 3 ET pen-name authors. — **Agreed** (AGENTS.md "Data rules", canon index merged Nov 9)
7. Every ET author has: one assigned narrator, one real author as a style model (style_reference), and a complete style sheet (authors.style_sheet) that includes an ending type. — **Agreed** (CANON_REGISTRY STYLE-001, Marc Nov 1, 2026; AGENTS.md data rules; memory story-pipeline.md Nov 1)
8. **[MARC DECIDES]** No story is written for an author who lacks a style model or a complete style sheet. The job stops and asks Marc. — **Agreed** (STYLE-001)
9. Each series is assigned one ET author. The writer follows that author's style sheet for every episode in the series. — **Agreed** (Story Production Spec §3.5)
10. The style model governs voice only (rhythm, tone, word choice). Never copy the real author's text, plots, characters, settings or titles. — **Agreed** (STYLE-001 copyright note)
11. Each author's narrator is fixed. The brief names the author; the narrator follows from the author, never chosen per story. — **Agreed** (STAGE2_SCRIPT_PROMPT v2.4 "Narrator lookup table"; STORY_BRIEF_TEMPLATE v2.2 Part 2)

### C. The hook (planned first)
12. The hook is written first. It is the first spoken line of Episode 1. — **Agreed** (Story Production Spec §3.1; hook-first ads decision Nov 4, project doc claude/hook-first-ads-2026-11-04.md)
13. The hook is a shocking situation in under 15 words, in first person when possible, that names an engine (a wish or a fear) a listener understands in one hearing. — **Agreed** (Story Production Spec §3.1; HOOK-FIRST-001, Marc ruling Jul 24 per lib/hookGate.ts) — see Conflict C2
14. The hook's words work as ad copy with no rewrite. — **Agreed** (Story Production Spec §3.1)

### D. Master premise and uniqueness
15. One master premise paragraph flows from the hook. It holds the engine, the lead's want, wound and secret, the villain, the central question, and (closed series) the shape of the ending. Every later step is checked against it. — **Agreed** (Story Production Spec §3.2)
16. The brief's premise is 2–5 sentences and leads with the inciting situation (the first sentence is the hook). — **Agreed** (STORY_BRIEF_TEMPLATE v2.2 Part 3; PREMISE-UNIQUENESS-001 core-hook rule)
17. No new brief goes to script writing if its premise is substantially similar to any story that is published, ready_for_review, repair_queue or approved_ready. "Substantially similar" = same core hook (≥0.6 overlap) AND same central situation (≥0.5 overlap). Same genre or setting alone is fine. — **Agreed** (governance/PREMISE-UNIQUENESS-001.md, Marc ruling Jul 18, 2026)
18. Cold-storage premises are free to reuse. — **Agreed** (PREMISE-UNIQUENESS-001)
19. **[MARC DECIDES]** A colliding brief is bounced for rework, never retried automatically. Only Marc can let it through, by a recorded override with his name and reason. Agents never self-approve. — **Agreed** (PREMISE-UNIQUENESS-001 "Override procedure")
20. **[MARC DECIDES]** A premise near a known-adjacent cluster gets a warning but proceeds. Only Marc adds or retires a cluster. — **Agreed** (PREMISE-UNIQUENESS-001 amendment, Jul 18)
21. Episodes of the same series never collide with each other. — **Agreed** (PREMISE-UNIQUENESS-001 "Sibling exclusion")
22. Episodes in a series never reuse the same central object, discovery or secret device (no second hidden clock, no second note inside something). — **Agreed** (Marc Oct 28, memory story-pipeline.md; EPISODE-VARIETY-001 in writer prompt)
23. Character names are not reused from the last 10 series, and no two main characters have names that sound alike. — **Agreed** (Story Production Spec §4.1; Pocket FM rules Nov 4)
24. Surnames are not reused across the catalog without a deliberate reason. — **Agreed** (CANON_REGISTRY NAMES-001, Aug 29) — rule 23 is the newer, stricter version
25. The planner gets a list of recent premises, settings and names to avoid (today: developer/land deed/erased records; the ex who returns or buys the business; small Carolina water town, bridge or ferry; names Brennan, Claire, Cole, Merritt, Bennett, Vivian, Harlow). — **Proposed** (claude/cover-and-theme-repetition-2026-11-04.md found 9 deed/developer series; Marc deferred a general check until after Stabilization Week; nothing decided since)

### E. Series types and lengths
26. Endless Tales is series-first. A standalone needs a stated purpose: discovery, onboarding, testing, or variety. — **Agreed** (ET_Story_Rules_v3_2 Part V)
27. A series is either Closed (a real ending in the last episode) or Ongoing (built in seasons). — **Agreed** (Story Production Spec §3)
28. **[MARC DECIDES]** Preferred series lengths are 3, 5, 7 or 13 episodes. Any other length needs Marc's explicit approval. — **Agreed** (ET_Story_Rules_v3_2 Part V; code SERIES_EPISODE_COUNTS in lib/series/continue-plan.ts)
29. New standard series are 5 or 7 episodes (romance, heartwarming, western, thriller, sci-fi). The old 3-episode queue is retired. — **Agreed** (Marc Nov 1, memory story-pipeline.md) — see Q1
30. **[MARC DECIDES]** Long Pocket FM series (e.g. 30 episodes) are allowed when Marc orders them, planned in arcs of 10, with one big turn every 10 episodes. — **Agreed** (Marc Nov 3 and Nov 5, memory altar-romance-series.md; Pocket FM rules; Story Production Spec §7)
31. **[MARC DECIDES]** When Marc or Maya sets an episode count, the story has exactly that many episodes. — **Agreed** (CANON_REGISTRY LENGTH-001)
32. Every episode header carries the same planned total for the season in production. A mismatch (Rerouted EP1 "5", EP2–3 "7") is a failure. — **Agreed** (Story Production Spec §7)
33. A closed series leaves at most one open thread at its end (one named villain may escape for a sequel when the brief asks). "The Man I Left at the Altar" may leave three. — **Agreed** (SERIES-NEMESIS-001, Marc Oct 30; Altar exception Nov 3, lib/seriesSequel.ts; Story Production Spec §5)
34. An ongoing series: each season closes its own arc and leaves exactly one bigger question open. — **Agreed** (Story Production Spec §3.3, §7)

### F. Hook-first series
35. A hook-first ad series starts from a tested ad hook. The hook is the first spoken line of Episode 1. — **Agreed** (PIPELINE-CANON HOOK-SERIES RULE, Nov 5)
36. Each hook series launches as a 7-episode "Season 1" with threads left open. All 7 episodes publish together. — **Agreed** (HOOK-SERIES RULE; memory hook-series.md Nov 5 and Nov 8)
37. Winners are extended to 20–30 episodes, judged by cost per trial and the share of trial users who reach Episode 3 or later. — **Agreed** (HOOK-SERIES RULE) — the numbers that make a "winner" are not set; see Q3
38. The five Nov 2026 hook series: The Widow Who Watched, Second Rise, Weekend Wife in Miami (Pocket FM rules); Rerouted, Don't Go Home (standard rules). Though made for ads, they are real library stories. — **Agreed** (HOOK-SERIES RULE; memory hook-series.md Nov 8)

### G. Pocket FM style (opt-in)
39. **[MARC DECIDES]** Pocket FM–style writing is used only when Marc says "use the rules for Pocket FM type stories." — **Agreed** (PIPELINE-CANON POCKET-FM-STYLE RULE, Nov 5; memory story-pipeline.md Nov 4)
40. It sits on top of every normal pipeline rule. When they conflict, the pipeline rule wins. — **Agreed** (POCKET-FM-STYLE RULE)
41. A Pocket FM series names one engine in its plan (secret fortune, revenge, contract marriage, secret child, enemies to lovers, the cold one thaws, rags to riches, forbidden love), not the engine of any of the last 3 series. — **Agreed** (POCKET-FM-STYLE RULE; project doc claude/pocket-fm-style-rules.md)
42. Pocket FM cast: a lead wronged in Episode 1, a clear villain, a love interest with a secret, names not used in the last 10 series. — **Agreed** (POCKET-FM-STYLE RULE)
43. Pocket FM episodes run 12–15 minutes (2,000–2,400 spoken words). — **Agreed** (POCKET-FM-STYLE RULE; Pocket FM rules text sent to Orion Nov 4)

### H. Series bible, cast and fact sheet
44. Every series has a written series bible before any episode script. The bible holds the cast, timeline, central conflict and finale direction. — **Agreed** (Marc Oct 29 whole-series plan; PIPELINE-CANON SERIES-CONTINUATION Defaults) — code checks only that series.description is not empty (SERIES-BIBLE-GATE-001)
45. The series design states: the central question (one sentence), the protagonist's arc, how stakes rise each episode, the type of finale resolution, and one specific cliffhanger per non-final episode. A series without its cliffhanger chain is not ready to produce. — **Agreed** (ET_Story_Rules_v3_2 Part V; STORY_BRIEF_TEMPLATE Part 6)
46. The series outline fixes every character's one speaker label and full name, the story threads, and the one episode where each thread is resolved. Every episode writer gets the outline. — **Agreed** (SERIES-OUTLINE-001, Marc Oct 29 "permanent for all future stories"; lib/seriesOutline.ts)
47. Cast: one lead to root for (wronged or underestimated in Episode 1), one clear villain, one ally or love interest with a secret. Each main character has a want, a wound, a secret, an age, a gender, an accent and one line of voice description. — **Agreed** (Story Production Spec §4.1)
48. Long series introduce a new character every few episodes, each bringing a new problem. — **Agreed** (Story Production Spec §4.1)
49. A fact sheet is written with the cast: who is related to whom, whose contact is whose, jobs, places, who is dead or missing. Writers get it as hard rules. New seasons add to it; nothing is deleted without a story reason. — **Agreed** (Story Production Spec §4.2; SERIES-FACTS-001, Marc Nov 7)
50. A recurring hero keeps his exact name, speaker label and voice across series (Nick Brennan, label NICK). — **Agreed** (Marc Oct 27–28, memory story-pipeline.md)
51. In a short series (6 episodes or fewer), every episode after Episode 1 shares at least one speaking character with Episode 1 and with the episode before it. — **In force (code)** (SERIES-CAST-CONTINUITY-001, lib/scriptReadiness.ts)
52. The planned brief gets a Next Episode Desire Score (NEDS). Below 7 = revise the brief before writing. — **Agreed** (ET_Story_Rules_v3_2 Part VII; STAGE2 r37) — see Q5
53. **[MARC DECIDES]** After a series finale, the series is scored for character attachment (0–8); 5+ = recommend a new season to Marc. New seasons must raise stakes, grow the lead and add one major new element. — **Agreed** (ET_Story_Rules_v3_2 Part IX) — see Q6

### I. Adding episodes and new seasons
54. **[MARC DECIDES]** Adding episodes never re-plans, rewrites, re-titles, re-hides or re-voices episodes that already exist. New episodes are planned only for the missing numbers, from the full scripts of the existing ones, with scripts/series/continue-series.ts: dry run first, Marc approves the plan, then save. — **Proposed** (PIPELINE-CANON SERIES-CONTINUATION RULE is PENDING Marc sign-off; code SERIES-CONTINUE-001 exists)
55. The whole-series planner (/api/v2/series-package) must never run on a series that already has episodes. — **Proposed** (same pending rule; Nov 9 near-overwrite of a live Episode 1)
56. Published episodes are frozen. A new season never rewrites, re-voices or re-renders them. — **Agreed** (PHASED-SERIES-001, Marc Nov 6; Story Production Spec §7)
57. Before writing a new season, the writer reads the master premise, the fact sheet, all season outlines so far, and the full text of the last 3 published episodes. — **Agreed** (Story Production Spec §7)
58. Each season has its own outline: its arc, what it resolves, and the one bigger question it opens. — **Agreed** (Story Production Spec §7)
59. A real series bible is written before any new episode script of a continued series. — **Proposed** (SERIES-CONTINUATION Defaults, pending)

### J. Runtime targets in the brief
60. Series episodes target 12–18 minutes. 20–25 minutes is only for standalones, finales and episodes that earn it. — **Agreed** (STAGE2 v2.3; PUBLISHED_STORY_SPEC v1.5; Marc Oct 26 option 2, memory story-pipeline.md)
61. Every episode of a series is about the same length. — **Agreed** (Story Production Spec §3.3)
62. A brief may not ask for less than 12 minutes. Code refuses briefs of 10.8 minutes or less because they can never pass both the floor and the ±10% check. — **In force (code)** (briefRuntimeImpossible, lib/scriptReadiness.ts)
63. **[MARC DECIDES]** When Marc or Maya sets a per-episode length, each episode lands within ±20% of it. — **Agreed** (CANON_REGISTRY LENGTH-002) — see Conflict C5
64. Author-written series (Sunset of Competition) are exempt from the runtime floor; the finale stays at its written length. — **Agreed** (Marc Nov 3, memory sunset-of-competition.md)

### K. The brief
65. A brief contains: type (standalone/series), series name, episode number, total episodes, finale yes/no, author, genre, premise, setting, runtime, and (Episode 2+) a summary of the previous episode and its cliffhanger. — **Agreed** (STORY_BRIEF_TEMPLATE v2.2, approved June 10)
66. The brief template is rewritten to match today's rules: the four inputs (rule 1), hook, master premise, cast, fact sheet, outline; and the stale items in Conflict C4 are removed. — **Proposed** (template still carries retired rules)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 3:** **Hook length.** The rules say 15 words; the code passes up to 30. Decided: 15 words, blocking, for every new Episode 1. The 5 live hooks keep their wording. (02 C2, 03 C2, 08 C1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 4:** **Episode length.** Decided: standalones within ±10% of target; series episodes between the 12.5-minute floor and 1.35 × the brief; speaking rate 160 words per minute everywhere. Publish code uses the same numbers (today it only allows 15–20 minutes). (02 C5, 03 C3, 08 C2, 09 C4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 5:** **Series lengths.** Decided: 5, 7 or 13 episodes, or any length you order (like Altar's 30). 3-episode series only when you ask. (02 C3, Q1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 9:** **Endings.** Decided: about 1 in 5 standalones may end open; a series finale always answers its central question; one escaped villain is allowed; Belle never teases a sequel. (02 C6, 03 C8) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 12:** **Retire old manual documents** as history: STORY_PRODUCTION_PROCESS v1.2, SCRIPT_VALIDATOR.md, STORY_GRADING_RUBRIC.md, STORY_BRIEF_TEMPLATE v2.2, NEDS scoring, character-attachment scoring, MASTER_RULES.md, DEPLOY.md, DEPLOYMENT-RUNBOOK.md, HAL_SESSION_START_PROTOCOL.md, MIX_SPEC.md and MIX_NOTE_PROTOCOL.md level tables, et_mix_assembly.py, ACQUISITION-RETENTION-001 Parts A, D, E. Decided: yes, all. (01 C1, 02 C4, Q5, Q6, 03 Q7, 07 C4, C6, 13 C9, 15 C3–C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 13:** **Author roster.** Decided: the database authors table is the only roster; remove the lists in the Bible and the writer prompt. (02 C1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 16:** **Avoid-list of recent premises, places and names.** Decided: build it now, as a warning. (02 Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 17:** **Series bible for a continued series.** Decided: the pipeline writes it; you approve it only for series running in ads. (02 Q7) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 63:** Each series carries its own "style" setting (standard or Pocket FM). The canon list of Pocket FM series is examples only. (02 C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 64:** Standalone single stories stay allowed. "No 1-episode stories live" means no series showing only some of its episodes. (02 Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 65:** A hook series is a "winner" when its cost per trial is at or under the $26–31 target and at least 40% of its trial users reach Episode 3. (02 Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 13, Marc Nov 9, 2026]** Author roster: ET_Story_Rules_v3_2 lists 10 authors; STAGE2 v2.4 lists 31; STYLE-001 (Nov 1) says 50 active authors; AGENTS.md says exactly 3 per genre. Recommendation: the database authors table is the roster; delete the static tables from the Bible and STAGE2 prompt. Marc decides.
- C2. **[RESOLVED by decision 3, Marc Nov 9, 2026]** Hook length: Spec §3.1 and HOOK-FIRST-001 say under 15 words; the 5 approved ad hooks (Nov 4) run up to 21 words ("15–25 word hook" in the Nov 5 chat summary); lib/hookGate.ts passes a hook up to word 30 (comment still says 15). Recommendation: 15 words for all new Episode 1s (newest, Nov 7); leave the 5 live hooks as they are; fix the code to 15. Marc decides.
- C3. **[RESOLVED by decision 5, Marc Nov 9, 2026]** Series lengths: Bible says 3/5/7/13; Marc Nov 1 chose 5 and 7 for new standard series; hook series are 7; Altar is 30. Recommendation: allowed lengths = 5, 7, 13, plus any length Marc orders; 3 only on Marc's word. Marc decides.
- C4. **[RESOLVED by decision 12, Marc Nov 9, 2026]** STORY_BRIEF_TEMPLATE v2.2 is stale: it still cites the retired Series Release Rule, 3–6 anchor SFX (Marc removed the cap Oct 31), a 24-word description (Marc Nov 5: fills two card lines), "Belle never mentions the author" (BELLE-004 says Episode 1 names the author), a 10-minute runtime option (below the 12.5-minute floor), and PIPELINE_MODE transition/full. Recommendation: retire the template and replace it per rule 66.
- C5. **[RESOLVED by decision 4, Marc Nov 9, 2026]** Length tolerance: LENGTH-002 says ±20% of target; RUNTIME-GATE-001 (code) says ±10% on the final mix; the series ceiling is brief × 1.35. Recommendation: one rule — standalone ±10%, series between the 12.5-minute floor and brief × 1.35. Marc decides.
- C6. **[RESOLVED by decision 9, Marc Nov 9, 2026]** Open threads: ENDING-001 and Bible Part XVII say a finale resolves all major threads and never teases a sequel; SERIES-NEMESIS-001 (Oct 30) allows one escaped villain, Altar three. Recommendation: newer rule 33 wins; the sequel thread is never teased by Belle.
- C7. **[RESOLVED by decision 63, Marc Nov 9, 2026]** Pocket FM list: PIPELINE-CANON names only Widow, Second Rise and Weekend Wife as Pocket FM; Marc also chose Pocket FM for "The Man I Left at the Altar" (Nov 3) and a second 30-episode series (Nov 5). Recommendation: keep a per-series style_mode field; the canon list is examples only.

## Open questions for Marc
- Q1. **[RESOLVED by decision 5, Marc Nov 9, 2026]** Are 3-episode series still allowed for new work? Suggested answer: only when you ask for one.
- Q2. **[RESOLVED by decision 64, Marc Nov 9, 2026]** Does "no 1-episode stories live" (Nov 8) also ban standalone single stories, or only a series showing one episode? Suggested answer: only the series case; standalones stay allowed for discovery and tests.
- Q3. **[RESOLVED by decision 65, Marc Nov 9, 2026]** What numbers make a hook series a "winner" to extend to 20–30 episodes? Suggested answer: cost per trial at or under the $26–31 CAC target band and at least 40% of trial users reaching Episode 3.
- Q4. **[RESOLVED by decision 16, Marc Nov 9, 2026]** Should the avoid-list of recent premises, settings and names (rule 25) be built now? Suggested answer: yes, now that Stabilization Week is over; warning only, like known-adjacent clusters.
- Q5. **[RESOLVED by decision 12, Marc Nov 9, 2026]** NEDS (rule 52): the scorers named in the Bible (Hal, Vega) no longer do this job, and no code checks it. Keep it? Suggested answer: drop NEDS; the Story Clarity check and Gemini's script read replace it.
- Q6. **[RESOLVED by decision 12, Marc Nov 9, 2026]** Character-attachment scoring after each finale (rule 53): keep? Suggested answer: replace with listener data (completion rate, Episode 3 reach) in the weekly report.
- Q7. **[RESOLVED by decision 17, Marc Nov 9, 2026]** Who writes the series bible for a continued series, and does Marc approve every one? Suggested answer: the pipeline writer drafts it; Marc approves only for series in active ads.

## Enforcement status
- Rule 1–2, 12–15, 47, 57–58 → not enforced yet (Spec "planning package" is phase 3 of the rollout).
- Rule 3 → not enforced in code; agent rule only.
- Rules 7–8 → enforced (AUTHOR-STYLE-001, AUTHOR-STYLE-SHEET-001; authors table).
- Rule 13 → partially: lib/hookGate.ts allows 30 words.
- Rules 17–21 → enforced: lib/premiseGate.ts, lib/premiseIndex.ts, at all four Stage 2 entrances.
- Rule 22 → prompt only (EPISODE-VARIETY-001 in run-next writer prompt); no check.
- Rule 23 → not enforced; lib/story/namePalette.ts suggests names but does not check the last 10 series.
- Rules 28, 31–32 → partially: continue-plan uses 3/5/7/13; no header-total check found.
- Rule 33 → enforced in package validator (lib/seriesSequel.ts nemesisOpenThreadLimit).
- Rule 44 → partially: SERIES-BIBLE-GATE-001 only checks series.description is not empty (app/api/v2/generate-script/route.ts, series-package/generate-scripts).
- Rule 46 → enforced: lib/seriesOutline.ts (on by default).
- Rule 49 → enforced: lib/seriesFacts.ts (SERIES-FACTS-001).
- Rule 51 → enforced: lib/scriptReadiness.ts checkSeriesCastContinuity (dispatcher).
- Rule 52–53 → not enforced (no NEDS code).
- Rule 54–55 → tool exists (scripts/series/continue-series.ts); series-package has no guard against existing series.
- Rule 56 → enforced: PHASED-SERIES-001 in run-next.
- Rule 62 → enforced: briefRuntimeImpossible.
- Rule 64 → enforced: lib/authorWrittenExempt.ts.

## Sources reviewed
- Repo (/tmp/dtt, shallow clone, only 18 commits back to Nov 8, so git history gave little): AGENTS.md; docs/PIPELINE-CANON.md; Bible/CANON_REGISTRY_STORY_RULES.md; Bible/ET_Story_Rules_v3_2_CANONICAL.md; docs/STAGE2_SCRIPT_PROMPT.md; docs/STORY_BRIEF_TEMPLATE.md; docs/PUBLISHED_STORY_SPEC.md; governance/PREMISE-UNIQUENESS-001.md; docs/GENRE-ATTRIBUTES-SPEC-v1.0-DRAFT.md (draft, not canon); lib/premiseGate.ts, lib/seriesOutline.ts, lib/seriesSequel.ts, lib/seriesFacts.ts, lib/seriesStyle.ts, lib/series/continue-plan.ts, lib/scriptReadiness.ts, lib/authorWrittenExempt.ts, lib/hookGate.ts, lib/story/namePalette.ts, app/api/v2/generate-script/route.ts, run-next writer prompt.
- Claude Doc "Endless Tales — Story Production Spec" (approved Nov 7, read in full via Docs tool).
- Memory: /projects/…/areas/story-pipeline.md, hook-series.md, altar-romance-series.md, man-i-left-at-the-altar.md, sunset-of-competition.md; /areas/story-pipeline.md.
- Past chats: "Cover story map pattern" (Nov 4–8: Pocket FM rules, theme repetition, Story Production Spec), "Gemini sound replacement loop" (Nov 4–5: hook-first ads), "Clearing CEO series flag" (Oct 26–Nov 1).
- Project docs (claude/*.md): the Projects tool was NOT available to me. Contents of pocket-fm-style-rules.md, hook-first-ads-2026-11-04.md and cover-and-theme-repetition-2026-11-04.md were read from the chats that wrote them.

## Replaces (once approved)
- docs/STORY_BRIEF_TEMPLATE.md (v2.2)
- ET_Story_Rules_v3_2 Parts V, VII, IX and XIV (series lengths, NEDS, character attachment, author roster)
- STAGE2_SCRIPT_PROMPT v2.4 narrator lookup table and author profiles (move to the authors table)
- CANON_REGISTRY LENGTH-001, LENGTH-002, NAMES-001 (folded in here)
- PUBLISHED_STORY_SPEC v1.5 "Premise Originality" section
- PIPELINE-CANON HOOK-SERIES, POCKET-FM-STYLE and SERIES-CONTINUATION entries (point to this doc)
- Project docs claude/pocket-fm-style-rules.md (planning parts), claude/hook-first-ads-2026-11-04.md, claude/cover-and-theme-repetition-2026-11-04.md (theme part)
