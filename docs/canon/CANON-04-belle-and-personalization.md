# CANON-04 — Belle Intro/Outro & Listener-Name Personalization
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: what Belle says at the start and end of every story and episode, where the sting sits, credits, time-of-day words, and how the listener's name is added (or left out). Does not cover: Belle's voice settings and casting (CANON-05 Voices), story-body writing (writer canon), music under Belle and mix levels (sound/mixing canon), player behavior beyond the sting and the name (Player Rules, docs/PLAYER-RULES.md).

## Rules

### A. Who Belle is
1. Belle is the Endless Tales host. She never narrates a scene, never plays a character, and never replaces the narrator. — **Agreed** (docs/BELLE_B_PROMPT_RULES.md and docs/INTRO_OUTRO_BIBLE.md, May 2026; BELLE_B_PROMPT_RULES is in the AGENTS.md canon index)
2. In scripts, Belle's lines are labeled `BELLE B:` only. Never `ANNOUNCER:` or `SANDY:`. — **Agreed** (docs/PUBLISHED_STORY_SPEC.md v1.5, part of the June 10 canon set, memory /areas/story-pipeline.md)
3. Belle never uses stock lines: "tonight's story", "today's episode", "are you ready", "for your listening pleasure", "I am pleased to present", "sit back", "relax and enjoy", "welcome back to another exciting…". — **Agreed** (BELLE_B_PROMPT_RULES.md; INTRO_OUTRO_BIBLE.md). Same list **In force (code)**: lib/voiceBelleRules.ts BELLE_GENERIC_PATTERNS.
4. Belle never asks a rhetorical question ("Are you ready to find out…?"). — **Agreed** (BELLE_B_PROMPT_RULES.md)
5. Belle never spoils a later episode or the ending. — **Agreed** (BELLE_B_PROMPT_RULES.md). Words like "reveals", "turns out", "killer is" fail. — **In force (code)** lib/voiceBelleRules.ts
6. "Endless Tales presents" is never said. — **Agreed** (CONTENT-001, Bible/CANON_REGISTRY_STORY_RULES.md)
7. Belle's wording must vary from story to story. No copied template lines. — **Agreed** (INTRO_OUTRO_BIBLE.md "Dynamic, non-repetitive language")

### B. The sting and the opening order
8. Every story and every episode starts with the Endless Tales sting, right at the start of Belle's intro. This holds for a first play, Start Over and autoplay. Resuming after a pause does not replay the sting. — **Agreed** (docs/PLAYER-RULES.md Playback basics 2, Marc Nov 8, 2026)
9. The sting plays once per episode. Never before the outro, never mid-story. There is no closing sting. — **Agreed** (STING-001, Aug 28, 2026; memory /projects/…/areas/audio-pipeline.md, Nov 2026 mix plan "no closing sting")
10. Belle starts speaking 1.2 seconds into the sting, and the sting fades under her. — **Agreed** (PUBLISHED_STORY_SPEC.md v1.5; memory /areas/audio-pipeline.md "Sting crossfade 1200ms")

### C. Belle's intro
11. The intro is one line: one sentence preferred, two short sentences at most. — **Agreed** (BELLE-001, Aug 28; BELLE_B_PROMPT_RULES.md). Hard cap 38 words. — **In force (code)** lib/voiceBelleRules.ts
12. Exception: a listener's very first episode reached through the signup funnel may use a longer, multi-sentence personal welcome. Never "correct" it back to one line. — **Agreed** (BELLE-002, Aug 6)
13. Episode 1 of a series (and Episode 1 of each new season): the intro names the title and the author. — **Agreed** (BELLE-004, Aug 28; BELLE-006 season clause)
14. A standalone intro names the story title. — **In force (code)** lib/publicationBelleGate.ts
15. Every intro states the story's concrete hook: who it is about, what goes wrong, and the tension, in plain words. Mood or setting alone does not count. — **Agreed** (PUBLISHED_STORY_SPEC.md "REQUIRED elements (June 10)"). **In force (code)**: publicationBelleGate.ts "concrete narrative hook".
16. The intro has no greeting words: "welcome", "settle in", "let's begin". — **In force (code)** lib/voiceBelleRules.ts
17. Series intros after Episode 1: see Conflict C1 (name the series and episode number, or not).

### D. Time of day and privacy
18. Belle never says an exact time, a place, or anything that suggests she knows where the listener is ("It's 10:42", "you're driving near…"). — **Agreed** (BELLE_B_PROMPT_RULES.md; INTRO_OUTRO_BIBLE.md). **In force (code)** lib/voiceBelleRules.ts BELLE_EXACT_OR_CREEPY_TIME_PATTERNS.
19. Broad time-of-day mood: see Conflict C3. Until Marc decides, writers use none.

### E. Belle's outro, episodes that are not the last
20. The outro has exactly two parts, in this order: (1) one sentence that recaps this episode, no more; (2) a promotion of the next episode that says its number and the series name, for example "In Episode 4 of 'Blackwater Mile,' the river gives up the name everyone buried." — **Agreed** (BELLE-OUTRO-FORWARD RULE, docs/PIPELINE-CANON.md, Marc Nov 8, 2026; docs/PLAYER-RULES.md Playback basics 9; memory /projects/…/areas/story-pipeline.md Nov 8)
21. Not allowed: two or more recap sentences, a tease that does not say the next episode's number, or ending on the recap. — **Agreed** (same source)
22. No author name, no narrator name and no "an Endless Tales Original" in a non-final outro. No words that sound like the series is over ("end", "final", "concludes", "complete"). — **Agreed** (BELLE_B_PROMPT_RULES.md "avoid credit/tag language that sounds final"). **In force (code)**: run-next writer prompt; lib/publicationBelleGate.ts; lib/voiceBelleRules.ts.
23. The next-episode promotion never spoils what happens. — **Agreed** (BELLE_B_PROMPT_RULES.md)
24. The old non-final requirements (emotional "reflection", "companion presence", "briefly recap the cliffhanger") are replaced by rule 20. — **Agreed** (PIPELINE-CANON BELLE-OUTRO-FORWARD "Interactions"). Not yet true in code: see Conflict C2.

### F. Belle's outro, the last episode and standalone stories
25. Never point to another episode or another story. — **Agreed** (BELLE-OUTRO-FORWARD RULE, Nov 8; PLAYER-RULES 9)
26. Open with an emotional beat about how the story resolved. Never open with "That was…". One or two sentences. — **Agreed** (BELLE-005, Sep 6, 2026)
27. Then the credit, in this form: "You've been listening to [title] by [author], an Endless Tales Original." — **Agreed** (BELLE-OUTRO-FORWARD RULE, Nov 8; BELLE-005). **In force (code)**: lib/voiceBelleRules.ts (author last name + "Endless Tales"), lib/publicationBelleGate.ts (title + author).
28. The credit also names the narrator. — **Agreed** (BELLE-005, Sep 6: "Narrator credit (narrator name) is required"). **In force (code)**: publicationBelleGate.ts; ATL-PIPE-012. See Q1.
29. No spoken "please rate" request. The review screen handles rating. — **Agreed** (BELLE-005)
30. Length: at most 42 words. — **Agreed** (BELLE-005). Code allows 55: see Conflict C6.

### G. Listener-name personalization
31. The listener's name never appears in Belle's outro text, on any episode. — **Agreed** (BELLE-003, Aug 13). **In force (code)**: lib/belleStructureGate.ts BELLE-003.
32. If a script carries `[LISTENER_NAME]`, it appears once, only in Belle's intro line, at a natural pause, never as the first word. The line must sound complete with the name removed. — **Agreed** (BELLE-001; PUBLISHED_STORY_SPEC.md v1.4; Marc approved the mid-sentence rewrite for Extraction EP1, Oct 16, memory /projects/…/areas/pipeline-dispatch-recovery.md). **In force (code)**: lib/personalization/publishGuard.ts blocks the token anywhere else.
33. Series: the name greeting is a separate, short Belle line that plays right after Belle's intro, before the story. — **Agreed** (memory /projects/…/areas/personalization.md, Oct 27–28: greeting "must come after a shared title/music opening"). **In force (code)**: app/api/asc3/story-playlist/route.ts (announcement → greeting → story).
34. In a series, only two places are personalized: the intro of the first episode the listener plays, and the finale. Not every episode. — **Agreed** (memory personalization.md, Oct 27). **In force (code)**: lib/personalization/firstPlayedOpener.ts.
35. The greeting plays every time the listener starts Episode 1 from the beginning. On a second or later listen it warmly says they came back. A first-ever play that starts at a later episode also gets the greeting. Resuming mid-episode never does. — **Agreed** (Marc Oct 29, chat "Clearing CEO series flag"; memory story-pipeline.md). **In force (code)**: GREETING-REPLAY-001 in story-playlist/route.ts.
36. Greetings are written live for each series (not stock lines). Stock lines are only the backup. — **Agreed** (memory personalization.md, Oct 28). **In force (code)**: PERS-LIVE-001, lib/personalization/liveGreeting.ts.
37. The finale ends with a personal sign-off by name. There is no gap between Belle's outro and the sign-off. — **Agreed** (BELLE-OUTRO-FORWARD RULE and PLAYER-RULES 9, Nov 8). Order (before or after Belle's credits): see Conflict C4.
38. Greeting text rules: exactly one name; 14 to 32 words; no digits; no quotation marks; no author or narrator names; does not say "Endless Tales"; no plot spoilers. Intro greetings put the name in the first six words. The sign-off never promises more episodes. — **In force (code)** lib/personalization/liveGreeting.ts validateGreetingTemplate
39. Name clips and greetings are spoken in Belle's own voice and settings. — **Agreed** (docs/PERSONALIZATION_AND_SFX_IMPLEMENTATION.md "Decisions locked by Marc"; BELLE-007)
40. The name used is what friends call the listener (display name), never the legal name. — **Agreed** (BELLE-001 clarification, Aug 28). See Conflict C5.
41. A listener who arrived through the Belle invitation page and was already greeted there does not get the name opener on their very first play. — **In force (code)** story-playlist/route.ts (signup_source 'bell-invitation')

### H. No-name fallback
42. If the name can't be added for any reason, the no-name version plays. Playback is never blocked or delayed for this. — **Agreed** (PLAYER-RULES Playback basics 8, Nov 8; PUBLISHED_STORY_SPEC.md)
43. Every fallback is logged with its reason so silent failures can be counted. — **In force (code)** lib/personalization/fallbackTelemetry.ts (PERS-FIX-002)
44. A story can't be published without its name-free Belle intro audio (announcement_url). — **In force (code)** lib/personalization/publishGuard.ts
45. The intro must also exist as a complete no-name render, which must not sound cut short. — **Agreed** (PERSONALIZATION_AND_SFX_IMPLEMENTATION.md A6, Marc's QA gate)

### I. Exceptions and fixes
46. Author-written series (The Sunset of Competition): the pipeline never rewrites Belle lines and skips the Belle style checks. Technical checks still run. — **Agreed** (memory /projects/…/areas/sunset-of-competition.md, Nov 3)
47. A story marked "No Belle B" (LANDING-STORY-001) has no Belle intro or outro by design. — **Agreed** (Marc ruling Jul 24, 2026, cited in app/api/admin/generate-voices/route.ts)
48. A failing Belle line goes back to the pipeline writer with the exact reason. The voice step must not swap in a stock template line. — **Proposed** (the template in generate-voices/route.ts repairedBelleLine says "Next time on…" with no episode number, so it breaks rule 20; AGENTS.md says only the pipeline writer writes scripts)
49. Every Belle rule above is checked by one shared check used by the writer, voice step, Belle quality step, ready-for-review gate and publish gate, so they never disagree. — **Proposed** (today five checks disagree; see C1, C2, C6)

## Conflicts found
- C1. Naming in series intros. BELLE-006 (Canon Registry, Aug 28) says episodes 2 to N−1 must NOT name the title or author. The writer prompt and the publish gate (run-next buildSeriesEpisodePrompt; lib/publicationBelleGate.ts) REQUIRE every series intro to say the series title, "Episode N" and the episode title, and lib/belleStructureGate.ts still checks BELLE-006 (as "inconclusive"). Recommendation: every series intro says the series name and episode number (a driver needs to know where they are), and never the author. Episode titles optional. Retire BELLE-006's title ban. Marc decides.
- C2. Non-final outro content. BELLE-OUTRO-FORWARD (Nov 8) = one recap sentence + next episode by number. REFLECTION-RULE-UNIFICATION-001 (lib/belleValidation.ts, "Marc 2026-10-22, PERMANENT") plus FIX-BELLE-SERIES-TEMPLATE-001 still REQUIRE emotional reflection and "companion presence" ("you"/"we"), and the writer prompt requires the words "next episode", not the number. Recommendation: Nov 8 wins (newer, in canon). Retire the reflection and companion requirement for non-final outros; require the next episode's number. Marc decides.
- C3. Time-of-day. BELLE_B_PROMPT_RULES.md and INTRO_OUTRO_BIBLE.md (May) allow broad mood ("on this late drive"). The writer prompt templates and REFLECTION_RULE_PROMPT_FRAGMENT (Oct) say "no time-of-day reference". Recommendation: ban it. The audio is made once and heard at any hour, so "late drive" is wrong half the time. Marc decides.
- C4. Finale sign-off order. Marc Oct 29 (FINALE-SIGNOFF-ORDER-001, in code): story → name sign-off → Belle's credits. Nov 8 rule and PLAYER-RULES: the finale "ends with the personalization statement… no gap between Belle's outro and the personalization", and keep it "exactly as it works today". These read as opposite orders. Recommendation: keep today's code order (sign-off, then credits) and reword PLAYER-RULES 9 to match; the no-gap rule applies either way. Marc decides.
- C5. Name source. BELLE-001 says display_name, not the legal first name. lib/personalization/signupEnsure.ts uses the account's first_name. Recommendation: confirm which field the app shows as "what friends call you" and use one field everywhere. Marc decides.
- C6. Finale/standalone outro length. BELLE-005 says at most 42 words. lib/voiceBelleRules.ts and the writer prompt allow 55. Recommendation: 42 (newer than the May docs, Marc-owned registry). Marc decides.
- C7. Standalone "bridge line". PUBLISHED_STORY_SPEC.md v1.4 lets a standalone outro add one sentence pointing to the author's other series. The Nov 8 rule says a standalone never points to another story. Recommendation: Nov 8 wins; drop the bridge line.
- C8. Author in intros. PUBLISHED_STORY_SPEC.md (June) says Belle's intro never names the author or narrator. BELLE-004 (Aug 28) says Episode 1 names the author. Recommendation: BELLE-004 wins (newer).
- C9. Sting-to-Belle timing. PUBLISHED_STORY_SPEC: Belle starts at 1.2 s. lib/personalizedFinalMix.ts uses 0.5 s. Recommendation: 1.2 s. Marc decides by ear.
- C10. Old docs still say "briefly recap the cliffhanger" / "Next time on…" (BELLE_B_PROMPT_RULES.md, INTRO_OUTRO_BIBLE.md, INTRO_OUTRO_PRODUCTION_RULES.md). Recommendation: update them to rule 20 or mark them replaced by this doc.

## Open questions for Marc
- Q1. Does the finale credit still name the narrator? BELLE-005 (Sep 6) says yes; your Nov 8 example ("You've been listening to … by …, an Endless Tales Original") leaves it out. Suggested answer: yes, "…by [author], read by [narrator], an Endless Tales Original."
- Q2. Standalone stories: do they get a name greeting and a name sign-off, or only the stock name opener? Today the live greeting is series-only, and the stock opener plays BEFORE Belle's intro (story-playlist/route.ts), which puts the name ahead of the sting. Suggested answer: standalones get the same pattern as a series finale: sting + intro → greeting → story → sign-off → credits.
- Q3. Is the live greeting switched on for everyone? It is behind the LIVE_GREETINGS setting (off / allowlist / on). Suggested answer: "on", after your phone test.
- Q4. Where does the sting go when a name opener plays first? Suggested answer: the sting is always the very first sound; any name clip comes after Belle's intro.
- Q5. Hook-series episodes added after a series is live: does the Episode 1 "first season" intro rule (title + author) apply to the first episode of each added batch? Suggested answer: yes, treat each added batch as a new season.
- Q6. When there are multiple seasons, does the last episode of a season (not the series) count as a finale (credits, sign-off) or as non-final (next episode by number)? Suggested answer: non-final, promote the next season's first episode by number.

## Enforcement status
- Rules 1, 2, 4, 7, 23, 26 → not enforced in code (writer prompt only, or not at all).
- Rule 3, 5, 11, 16, 18 → enforced: lib/voiceBelleRules.ts (writer self-check, voice step).
- Rule 8–10 → partly: sting mixed in app/api/asc3/render-final-mix/core.ts and lib/personalizedFinalMix.ts; lib/stingDetectorGate.ts exists; timing differs (C9). Player side open items in PLAYER-RULES.
- Rule 13 → lib/belleStructureGate.ts BELLE-004 (hard fail at assembly).
- Rules 14, 15, 22, 27, 28 → lib/publicationBelleGate.ts (writer self-check, voice preflight, ready-for-review, every publish path; no waiver).
- Rules 20, 21, 24, 25 → NOT enforced. Code still enforces the older rule (C2). PIPELINE-CANON says this.
- Rule 30 → partly (55, not 42).
- Rule 31 → lib/belleStructureGate.ts BELLE-003.
- Rules 32, 44 → lib/personalization/publishGuard.ts.
- Rules 33–38, 41 → app/api/asc3/story-playlist/route.ts, lib/personalization/*. Behind LIVE_GREETINGS switch.
- Rule 42, 43 → story-playlist fallback + fallbackTelemetry.ts.
- Rule 46 → lib/authorWrittenExempt.ts (AUTHOR-WRITTEN-EXEMPT-001).
- Rule 47 → LANDING-STORY-001 checks in run-next and generate-voices.
- Rules 48, 49 → not built.

## Sources reviewed
- Repo /tmp/dtt: docs/PIPELINE-CANON.md, docs/PLAYER-RULES.md, AGENTS.md, docs/BELLE_B_PROMPT_RULES.md, docs/INTRO_OUTRO_BIBLE.md, docs/INTRO_OUTRO_PRODUCTION_RULES.md, docs/PUBLISHED_STORY_SPEC.md, docs/PERSONALIZATION_AND_SFX_IMPLEMENTATION.md, Bible/CANON_REGISTRY_STORY_RULES.md, lib/voiceBelleRules.ts, lib/belleStructureGate.ts, lib/publicationBelleGate.ts, lib/belleValidation.ts, lib/personalization/* (all 8 files), lib/personalizedFinalMix.ts, app/api/asc3/story-playlist/route.ts, app/api/admin/generate-voices/route.ts (Belle repair), app/api/admin/production-jobs/run-next/route.ts (buildSeriesEpisodePrompt, seriesEpisodeBelleContentIssues, RFR check), git log (18 commits only; no Belle rule IDs found there).
- Memory: /areas/personalization.md, /projects/…/areas/personalization.md, /areas/audio-pipeline.md, /projects/…/areas/audio-pipeline.md, /projects/…/areas/story-pipeline.md, /projects/…/areas/player-rules.md, /projects/…/areas/sunset-of-competition.md, /projects/…/areas/pipeline-dispatch-recovery.md.
- Past chats: "Clearing CEO series flag" (Oct 29 greeting/finale decisions), "Cover story map pattern" (Nov 7–8 outro rewrites, production spec draft), "Endless Tales financial obstacles" (Oct 16 name position).
- NOT reviewed: Claude project docs (claude/belle-outro-forward-rule.md, claude/player-rules.md). The Projects tool was not available to this auditor.

## Replaces (once approved)
- Belle sections of docs/BELLE_B_PROMPT_RULES.md, docs/INTRO_OUTRO_BIBLE.md, docs/INTRO_OUTRO_PRODUCTION_RULES.md (wording parts), docs/PUBLISHED_STORY_SPEC.md (Belle intro/outro + Name Stitch sections), docs/PERSONALIZATION_AND_SFX_IMPLEMENTATION.md Part A (rules only; build notes stay as history).
- BELLE-001 to BELLE-006 and STING-001 in Bible/CANON_REGISTRY_STORY_RULES.md (move or point here).
- The REFLECTION-RULE-UNIFICATION-001 requirement for non-final outros (lib/belleValidation.ts).
- PIPELINE-CANON BELLE-OUTRO-FORWARD RULE text stays; this doc carries it with the rest.
