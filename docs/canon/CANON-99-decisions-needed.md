# CANON-99 — Decisions Needed (Nov 9, 2026)
Status: PART 1 ANSWERED (Marc, Nov 9, 2026: all 60 decided; 57 changed by Marc) · PART 2 ANSWERED (Marc, Nov 9, 2026: "accept part 2", all 64 approved) · Owner: Marc
Covers: every conflict and unanswered question found in the canon audit, with a recommendation for each. Does not cover: rules already agreed (those are in CANON-01 to CANON-15).

## Marc's answer (Nov 9, 2026)

Marc: "I approve your recommendations with the one exception you fixed above." Every recommendation below is now an Agreed decision, written into its canon document. The exception is decision 57: the plow-back percentage is a setting that starts at 75% and only Marc changes.

## How this list was answered

- Reply **"accept all"** to approve every recommendation below.
- Or reply **"accept all except 4, 22, 43"** and give your answer for those numbers.
- Once you answer, Claude writes each decision into its canon document, marks it **Agreed (Marc, date)**, and lists the code fixes it needs.

Each item names the canon document it belongs to, for example (03 C2) = CANON-03, conflict C2.

## Story ideas, writing and production

1. **Hook series ads start when?** Nov 6 said "after Episodes 2 and 3 are live"; Nov 8 said all 7 episodes publish together. **Recommend:** ads start only after all 7 Season 1 episodes are live. (09 C1, 13 C5)
2. **Hook Episode 1s that are already live alone** (Rerouted and the others). **Recommend:** leave them up; publish Episodes 2 to 7 together; no more single episodes. (09 Q1)
3. **Hook length.** The rules say 15 words; the code passes up to 30. **Recommend:** 15 words, blocking, for every new Episode 1. The 5 live hooks keep their wording. (02 C2, 03 C2, 08 C1)
4. **Episode length.** **Recommend:** standalones within ±10% of target; series episodes between the 12.5-minute floor and 1.35 × the brief; speaking rate 160 words per minute everywhere. Publish code uses the same numbers (today it only allows 15–20 minutes). (02 C5, 03 C3, 08 C2, 09 C4)
5. **Series lengths.** **Recommend:** 5, 7 or 13 episodes, or any length you order (like Altar's 30). 3-episode series only when you ask. (02 C3, Q1)
6. **Cast size.** **Recommend:** the Nov 8 clarity rule wins: at most 4 named speakers (short stories), at most 6 (longer series). The code's 5/7 is changed. (03 C6)
7. **Numbers.** **Recommend:** every number spoken is written in words, including years ("nineteen ninety-eight"). (03 C5, Q5)
8. **Story card description.** **Recommend:** fills two lines, never a third (about 100 characters), checked in one place. The old 24-word and 70-character limits go. (03 C4, 12 C6)
9. **Endings.** **Recommend:** about 1 in 5 standalones may end open; a series finale always answers its central question; one escaped villain is allowed; Belle never teases a sequel. (02 C6, 03 C8)
10. **Spoken-text checks.** **Recommend:** two new blocking writer checks: (a) no sentence split across lines with a trailing dash; (b) no line said twice in a row. Drop HAL-SCRIPT-006 and the 5-word minimum per line. (03 C10, Q1, Q2, Q4)
11. **"Chapter" and "episode" inside the story.** **Recommend:** characters never say "chapter" or "episode" in dialogue. (03 Q3)
12. **Retire old manual documents** as history: STORY_PRODUCTION_PROCESS v1.2, SCRIPT_VALIDATOR.md, STORY_GRADING_RUBRIC.md, STORY_BRIEF_TEMPLATE v2.2, NEDS scoring, character-attachment scoring, MASTER_RULES.md, DEPLOY.md, DEPLOYMENT-RUNBOOK.md, HAL_SESSION_START_PROTOCOL.md, MIX_SPEC.md and MIX_NOTE_PROTOCOL.md level tables, et_mix_assembly.py, ACQUISITION-RETENTION-001 Parts A, D, E. **Recommend:** yes, all. (01 C1, 02 C4, Q5, Q6, 03 Q7, 07 C4, C6, 13 C9, 15 C3–C5)
13. **Author roster.** **Recommend:** the database authors table is the only roster; remove the lists in the Bible and the writer prompt. (02 C1)
14. **Script order.** **Recommend:** header, character guide, then Belle's intro (the Nov 7 spec; what the code reads). (03 C1)
15. **Description load.** **Recommend:** 2 sensory details per scene for standard stories; one short detail for action and Pocket FM stories. (03 C7)
16. **Avoid-list of recent premises, places and names.** **Recommend:** build it now, as a warning. (02 Q4)
17. **Series bible for a continued series.** **Recommend:** the pipeline writes it; you approve it only for series running in ads. (02 Q7)
18. **Repairs.** **Recommend:** text problems go back to the pipeline writer automatically (never an agent); a whole failed production gets one repair pass, then cold storage. "Hal rewrite" in PIPELINE-CANON becomes "pipeline writer rewrite". (01 C2, C3, 08 C7)
19. **Restarting failed jobs.** **Recommend:** Claude or Orion may restart a job once with a written reason; a second restart needs you. (01 Q1)
20. **One episode fails mid-series.** **Recommend:** the whole series holds and you're told; nothing in it publishes. (01 Q4, 09 Q5)

## Quality checks and review

21. **Series skip three final checks** (hook, length, quality). **Recommend:** run them on every series episode too. (08 C4)
22. **Quality score pass mark.** **Recommend:** 24 out of 30 (the code's stricter number). (08 C3)
23. **Parked stories.** **Recommend:** one daily list; Orion sorts them and asks you only when no rule answers. (08 C6, Q3)
24. **Gemini's final read.** **Recommend:** report-only until it agrees with you on 9 of 10 series, then it must pass before a Direct publish. (01 Q2, 09 C2, Q3)
25. **Story clarity check until it's built.** **Recommend:** a fresh AI reviewer (never the writer) runs it, and the result is saved with the episode. (08 Q2)

## Belle and personalization

26. **Series intros.** **Recommend:** every series intro says the series title, "Episode N" and the episode title. Retire BELLE-006. (04 C1)
27. **Finale order.** Today: story → listener-name sign-off → Belle's credits. **Recommend:** keep that order. The Player Rule is reworded to "no gap between the story, the name sign-off and the credits". (04 C4)
28. **Finale credit.** **Recommend:** "…by [author], read by [narrator], an Endless Tales Original." (04 Q1)
29. **Time of day.** **Recommend:** Belle never mentions time of day ("late drive"), because people listen at all hours. (04 C3)
30. **Outro length.** **Recommend:** at most 42 words. (04 C6)
31. **Standalone stories.** **Recommend:** same as a finale: sting and intro, name greeting, story, name sign-off, credits. No "bridge line" to other series. (04 C7, Q2)
32. **Sting and Belle.** **Recommend:** the sting is always the very first sound, and Belle starts 1.5 seconds in, over the sting's tail, on every path. You confirm by ear. (04 C9, Q4, 07 C3, Q1)

## Voices, sound and mixing

33. **Cast approval.** **Recommend:** retired (you said Nov 4 you no longer approve casts); one voice grid for all voices. (05 C1, C2)
34. **ElevenLabs budget.** The big credit block expired today. **Recommend:** a monthly cap that you set, with a stop-and-ask at 80%. (05 Q1)
35. **Sound library.** **Recommend:** Sound Ideas is the main library and Soundsnap the backup; the $169 Soundsnap upgrade is not bought; remove the old ElevenLabs sound-effect fallback. (06 C2, C3, C5)
36. **When sounds come back on** (off since Nov 1). **Recommend:** after Sound Ideas is connected and screened and you approve one Rerouted test mix. (06 Q1)
37. **Who approves a sound.** **Recommend:** a Gemini pass is enough; you listen to one test mix per new batch. (06 C6, Q2)
38. **Background sounds.** **Recommend:** about 10-second scene-setters only; retire whole-scene beds. (06 C4)
39. **Rights in ads.** **Recommend:** no library sounds or music in paid ads until the license is confirmed in writing; record each story's music source. (06 Q3, 07 Q2)
40. **Outro music.** **Recommend:** music sits at 0.13 under Belle with a 3-second fade (your Nov 1 drawing); old numbers and the unused music-bed check are updated. (07 C1, C2)
41. **Loudness.** **Recommend:** the whole episode measures −16 LUFS (±1), peaks no higher than −1 dB, and no section is more than 2 units off the story. (07 Q4)
42. **[MUSIC:OUT] / [MUSIC:IN] marks.** **Recommend:** build them (3-second fades, at most twice per story). (07 C5, Q3)
43. **Re-mixing a published episode.** **Recommend:** Gemini checks the new mix and you're asked only when it flags a problem. (07 C7, Q5)

## Publishing, covers and eBooks

44. **No episode goes live alone.** **Recommend:** every publish path refuses to publish part of a series (today the manual publish can). (09 conflict 1)
45. **Who may unpublish.** **Recommend:** only you, except that Claude may hide a story with broken audio at once and tell you. (09 Q2)
46. **Series cover.** **Recommend:** the Library shows one series cover (Episode 1's, unless you pick another). (10 C4, Q1)
47. **eBooks.** **Recommend:** rewrite the eBook prompt to produce real book prose, and make the publish check require the eBook. (10 C1, C2)

## Player and listener app

48. **Between episodes.** **Recommend:** build the 2-to-3-second "Up next" screen; one button named **Cancel** (one time only, goes to the Library); lock-screen Stop acts as Pause; autoplay is always on (remove the unused toggle). (11 C1, C2, Q1, Q3)
49. **Next playlist story missing or hidden.** **Recommend:** skip to the next live story; go to the Library only when none is left. This changes one Player Rule. (11 Q4)
50. **What a playlist is.** **Recommend:** the listener's own "Add to Playlist" list, saved to their account; finished stories drop off. (12 Q1, Q2)
51. **Paywall.** **Recommend:** the paywall never cuts audio mid-story; after a trial, Episode 1 of every series stays free. (11 Q5, 12 Q3, Q5)
52. **Prices and trial.** **Recommend:** $9.99/month, $79.99/year; 14-day trial with a card required for ad traffic; refund once within 7 days of the first charge. Fix the old $7.99 numbers everywhere. (12 C1–C3, Q4, 13 C1, C2)
53. **Old models.** **Recommend:** retire credits and Founding Member everywhere. (12 C4, C8)
54. **Readability and legal name.** **Recommend:** 44-pixel buttons app-wide; legal pages name Endless Tales, LLC. (12 C5, C7)
55. **Settings page.** **Recommend:** remove the controls that don't work; no speed control or sleep timer for now. (11 Q2, 12 Q7)

## Marketing and finance

56. **Meta.** **Recommend:**
    - Approve Strategos's stop rules as written.
    - Meta optimizes for Trial Start.
    - CAC goal is under $30; stop above $45.
    - Agents reach Meta only through the gated server routes.
    - Ads run from a new or renamed Endless Tales ad account.
    - (13 C3, C4, C7, Q1–Q3)
57. **Plow back.** Marc's decision: the plow-back percentage is a setting that starts at 75%; only Marc changes it, each change is recorded with its date and applies from the next month on. Plow back = that percentage of the previous month's profit ($0 after a loss month), shown as one number ("Available for ads"). The Command Center reads the same setting. The rest stays as reserve. Minimum cash reserve: $5,000 or 90 days of spending, whichever is larger. (13 C8, 14 C3, C4, Q1, Q3) **[CHANGED BY MARC]**
    - 75% of the previous month's profit ($0 after a loss), shown as one number.
    - The Command Center is fixed to match.
    - The other 25% stays as reserve.
    - Keep a minimum cash reserve of $5,000 or 90 days of spending, whichever is larger.
    - (13 C8, 14 C3, C4, Q1, Q3)
58. **Revenue details.** **Recommend:**
    - Test-account payments count as revenue but not in subscriber counts, churn, LTV or CAC.
    - Sound Ideas cost is 1/12 of what was paid for the current year.
    - Refunds count on the day they leave Mercury.
    - (14 C1, C7, Q6)

## Agents and security

59. **Merging and database changes.** Today, AGENTS.md says nothing merges and no database change happens without your word. Older rules (Oct 11 and Nov 2) let Claude merge low-risk pipeline PRs and apply add-only migrations. **Recommend:** keep your word required for every merge and migration (today's rule). It's simple, and you've been giving it quickly. (15 C1, C2, Q1, Q2)
60. **Security, urgent.**
    - Rotate the three exposed secrets (Susan's API key and a Telegram bot token in repository documents, an email-service key in memory) and remove them from the documents.
    - Put a login gate on the open /api/v2 production routes.
    - (15 C5, C6)

---

# Part 2 — Remaining items (added Nov 9, 2026, after Marc's answer to Part 1)

**Marc's answer (Nov 9, 2026): "accept part 2."** Every recommendation below (61–124) is now an Agreed decision, written into its canon document with its conflict or question marked RESOLVED. Nothing from the audit is still open; new rules arrive through Part 3.

## Already settled (facts checked or done today; no decision needed)

- **01 C5:** The pipeline runner lives on the EC2 server (`endlesstales-runnext`, confirmed running Nov 9). Vercel only builds preview copies.
- **04 C2:** Settled by Marc's Nov 8 outro rule, now built into the writer and checks (PR #544).
- **04 C10:** BELLE_B_PROMPT_RULES.md updated to the Nov 8 rule (PR #544); INTRO_OUTRO_BIBLE and INTRO_OUTRO_PRODUCTION_RULES become history.
- **08 Q1:** Publish switch: Direct. Publication hold: ON since Nov 9 (to stop Rerouted publishing early). Every status report shows both.
- **11 C6:** Already replaced by the Player Rules (Nov 9).
- **15 C9:** run-next now requires admin login; the README note gets fixed.

## Production, writing and voices

61. **(01 C4)** Series checks run per episode once built (decision 21); until then, record it as not fully enforced.
62. **(01 Q3)** The Nov 7 Story Production Spec: only the Gemini read (report-only) is approved; the rest is replaced by this canon.
63. **(02 C7)** Each series carries its own "style" setting (standard or Pocket FM). The canon list of Pocket FM series is examples only.
64. **(02 Q2)** Standalone single stories stay allowed. "No 1-episode stories live" means no series showing only some of its episodes.
65. **(02 Q3)** A hook series is a "winner" when its cost per trial is at or under the $26–31 target and at least 40% of its trial users reach Episode 3.
66. **(03 C9)** Story clarity: the goal is clear within about 480 spoken words (3 minutes at 160 words per minute).
67. **(03 C11)** Drop the NEDS score header.
68. **(03 C12, 06 C1, 06 C7)** The old sound rules in the writer documents (3–6 anchor sounds, no beds, sounds 6 dB under voices) are removed; the sound and mix canons own sound.
69. **(03 Q6)** The Escalation Ceiling and the story-map acceptance checks become law.
70. **(04 C5)** The listener's name comes from one field everywhere: the name they enter as "what friends call you".
71. **(04 C8)** Belle names the author in Episode 1's intro (BELLE-004).
72. **(04 Q3)** Turn the live name greeting on for everyone after Marc tests it on his phone.
73. **(04 Q5, Q6)** Each added batch of episodes is a new season: its first episode gets the Episode 1 intro; the last episode of a season promotes the next season's first episode by number (it is not a finale).
74. **(05 C3, C4)** The voice-reuse rule is 30 stories (old 20-story logic removed). Ongoing-series leads get their own custom voice, reserved forever.
75. **(05 Q2)** The writer adds a pronunciation hint for unusual names in the character guide; the voice step uses it.
76. **(05 Q3)** Build Gemini's listen of each new series' Episode 1 before the next new series is voiced.
77. **(05 Q4)** The weekly report shows the count of screened voices.
78. **(05 Q5)** Re-voicing a published story always waits for Marc's listen, even in Direct mode.

## Sound and mixing

79. **(06 Q4)** A sound name may go live with 1 approved take; takes rotate once 3 exist.
80. **(06 Q5)** Once a week, Claude proposes new sound names from the "wanted" list; Marc approves the list.
81. **(06 Q6)** SFX-ASSET-LOCK becomes canon for voice locking and the manifest check.
82. **(06 Q7)** Each series' signature sound (like the Falls Park bell) is one catalog name, used by every episode.
83. **(07 Q6)** Belle sits about 3 dB above the story voices (replaces the unbuilt "1.5x" rule).

## Quality checks, publishing, covers and eBooks

84. **(08 C5)** Every check that only warns gets a written reason in its canon document, or it becomes blocking.
85. **(08 C8)** The story clarity check runs before voicing. The Gemini read of the whole series stays report-only until decision 24's trial.
86. **(08 Q4)** In Review mode, Marc gets one Telegram message per series with a play link per episode, plus the Admin Review tab.
87. **(08 Q5)** The Belle structure check runs in the writer's self-check and before voicing (same check both places).
88. **(09 C3, C5)** The old production process and Series Release Rule become history; PIPELINE-CANON's rule titles get corrected.
89. **(09 Q4)** Test stories carry a "test" mark, and every publish path refuses them.
90. **(10 C3)** A missing cover blocks publishing, but not Ready for Review.
91. **(10 Q2)** In Direct mode, Marc does not review covers; Gemini checks each one for maps, keys, text and darkness.
92. **(10 Q3)** One eBook text per episode, shown as one book in the reader.
93. **(10 Q4)** eBooks for stories published before Oct 4 are made only for stories that stay live, as a separate low-priority order.
94. **(10 Q5)** Keep the old cover's link so Marc can switch back.

## Player and listener app

95. **(11 C3, C5)** No review screen in a playlist (the finished story's card gets the red Rate button). Outside a playlist, after the review screen the player always goes to the Library.
96. **(11 C4)** The name greeting plays on the first episode a listener plays; replays get the normal intro.
97. **(11 Q6)** The "Continue your story" mini-player stays on Home and Library only.
98. **(11 Q7)** iPhone audio that gets quieter during calls is accepted for the web app and fixed in the future native app.
99. **(12 C9)** An unknown ad link shows a clear error, never a different story.
100. **(12 Q6)** No custom stories until after the Meta test.
101. **(12 Q8)** Offer the annual plan at the end of the trial.
102. **(12 Q9)** Keep the free guest stories (2 stories / 30 minutes).

## Marketing, finance and agents

103. **(13 C6)** Strategos sends his brief straight to Susan; Marc's gate is the approval card before launch.
104. **(13 C10)** The Meta key lives in the EC2 server's settings (not Vercel).
105. **(13 C11)** Meta's own phone preview never counts as approval, except as a written, dated, one-time override by Marc.
106. **(13 Q4)** Retire the Airtable campaign system; keep its cash-floor test on the approval card.
107. **(13 Q5)** After the $4,000 test, the monthly ad budget is "Available for ads"; more needs Marc's approval.
108. **(13 Q6)** Decide what influencer/PR outreach is for after the Meta test.
109. **(13 Q7)** "Owner tested personally" must be ticked before Approve works.
110. **(13 Q8)** Amendment 1 is overridden only in writing on the approval card, with the date.
111. **(14 C2, C6)** Retire the old LTV numbers and the old $59.99 price everywhere.
112. **(14 C5)** Five spending sections on the statement: Operations, Story Production, Ad Spend, Marketing Services, R&D.
113. **(14 Q2)** In a month with no finished episodes, the $125 Sound Ideas charge shows as unassigned production cost.
114. **(14 Q4)** Bart closes each month (reconcile, clear "Other", report) by the 5th of the next month.
115. **(14 Q5)** Show AI agent costs per agent once usage logging exists.
116. **(15 C7)** All code goes through pull requests on GitHub; never written straight on the Mac.
117. **(15 C8)** Orion's model setting follows the latest fleet decision (Nov 8: DeepSeek), switched to a faster model when a task needs it.
118. **(15 C10)** Orion's INCIDENT-RULE-001 is Proposed until Marc approves it.
119. **(15 Q3)** Codex has no job now; Claude does that work.
120. **(15 Q4)** Keep a one-line roster of active agents; retire names with no work (Vega, Maya, Lex, Lyra, Holly, Scribe).
121. **(15 Q5)** Claude re-reviews the six self-merged PRs (#333–#338) and reports.
122. **(15 Q6)** Orion runs on Marc's Mac only, until the CAC test passes.
123. **(15 Q7)** The app runs on EC2; Vercel only builds preview copies.
124. **(15 Q8)** An agent reports BLOCKED after 30 minutes without progress.

---

# Part 3 — New rule requests (rolling list)

New rules and rule changes wait here for Marc (CANON-00 rules 10–16). Each item names its canon document, the proposed rule, why it is needed, any conflict it settles, the code it would change, and Claude's recommendation. Marc replies "approve N", "change N: …" or "reject N".

125. **(14) Financial statement layout. APPROVED (Marc, Nov 9, 2026: "approve 125").** Marc asked for revenue from sales only, cost of goods directly under it, then gross profit, with cashback, interest and money he puts in kept separately as money he can keep or reinvest. Rule: Part A, profit: sales revenue → cost of revenue (story production, delivery hosting, payment fees) → gross profit and margin → operating expenses (Ad Spend, Marketing Services, R&D, Operations) → operating profit; plow back is based on operating profit. Part B, money outside operations (never profit): owner and investor money in (one line per person, running total), owner withdrawals, card cashback, Mercury interest, uncategorized money in; total "yours to keep or reinvest". Settles: decision 112 (five spending sections) and rules 45–47 for the statement's layout. Code: lib/finance/statement.ts, lib/finance/suggestions.ts, app/admin/finance/statement/page.tsx. Written into CANON-14 as decision 125.

126. **(00) Canon numbers file and guard test. APPROVED (Marc, Nov 9, 2026: "approve 126").** Rule: the canon's numbers live in lib/canon/numbers.ts, and the automatic test CANON-GUARD-001 fails whenever the code or a writer prompt file disagrees with them; a changed number is approved here first, then the canon document, numbers.ts and the code change together in one pull request. Why: on Nov 9 Rerouted stopped repeatedly on old code and settings that disagreed with the approved canon. Settles: nothing (new). Code: lib/canon/numbers.ts, __tests__/canon-guard-001.test.ts (PR #564). Recommendation: approve.

127. **(15) Agent settings changes are checked, and Orion is watched from outside. APPROVED (Marc, Nov 10, 2026: "approve 127").** Rule: (a) No agent edits OpenClaw's settings (openclaw.json, the model gate, agent configs) without Marc's OK. After any edit the agent runs OpenClaw's settings check (`openclaw doctor`), restarts the gateway, and confirms a clean start and a Telegram reply before reporting "done"; if the check or the start fails, it restores the backup at once and reports the failure. (b) A watchdog on the Mac restores `openclaw.json.last-good` and restarts the gateway after 3 failed starts in a row, and logs what it did. (c) A check that does not run inside OpenClaw confirms every 10 minutes that Orion is alive and alerts Marc by text or email if he is not. Why: on Nov 9 at 8:29 pm Orion's own edit (retiring six agents) added settings OpenClaw does not accept; the gateway failed every start from about 8:47 pm and Orion was silent for 12 hours, with no way to report it, until Claude found the error on Nov 10 and Marc applied the fix. Settles: nothing (new). Code: OpenClaw on Marc's Mac (Orion's build), no app code. Recommendation: approve.

128. **(03) "Episode" and "chapter" in dialogue: only when it points at the story itself. APPROVED (Marc, Nov 10, 2026: "The rule not to say 'Episode' or 'Chapter' is only if it is referring to the story being written, otherwise it is ok.").** Rule: characters must not refer to the story itself as an episode or chapter ("next episode", "this chapter", "in episode two"); ordinary uses are fine ("she had an episode", "a dark chapter of my life", "chapter four" of a book in the story). Only Belle B names episodes. Why: decision 11 banned the words outright, and Don't Go Home EP6 (a medical story) failed the writer check three times on Nov 10. Settles: narrows decision 11 back to rule 51. Code: lib/spokenTextChecks.ts (SPOKEN-TEXT-001), lib/scriptReadiness.ts rewrite feedback (PR #568).

129. **(03) Reading level: about 6th grade. APPROVED (Marc, Nov 10, 2026: "approve 129, 130, 131").** Rule: the spoken story text averages under 15 words per sentence and reads at about grade 6 (Flesch-Kincaid) or below; a script over grade 8 goes back to the writer. Why: Marc, Nov 10: Rerouted is technically good but hard to follow; listeners can't re-read a sentence while driving. Settles: nothing (new). Code: lib/storyClarity.ts already measures and reports it (PR STORY-CLARITY-001); approving this makes it blocking. Recommendation: approve.

130. **(02, 03) Twist budget: one big twist per episode. APPROVED (Marc, Nov 10, 2026: "approve 129, 130, 131").** Rule: each episode has at most one major twist or reveal, and every twist answers or sharpens the series' one main question; no twist opens a new mystery. Checked in the series plan before writing and on each script before voicing. Why: Marc, Nov 10: Rerouted passes the seven clarity checks, but "there are too many twists and turns and it's difficult to follow." Settles: nothing (new). Code: the clarity reviewer already lists each episode's twists (report only); approving this makes it blocking, and adds the check to the series plan. Recommendation: approve.

131. **(02, 03) At most 3 open questions at a time. APPROVED (Marc, Nov 10, 2026: "approve 129, 130, 131").** Rule: at the end of any episode, at most 3 story questions are still open; a fourth may open only after one is answered. Checked in the series plan and on each script. Why: same as item 130 (Marc, Nov 10). Settles: nothing (new). Code: the clarity reviewer already lists the open questions (report only); approving this makes it blocking. Recommendation: approve.

132. **(12, 11) Screen-reader access for every listener screen, web and native. APPROVED (Marc, Nov 10, 2026: "approve 132").** Rule: (a) Every listener screen, on the web app and in the future iPhone, Android, CarPlay and Android Auto apps, works with VoiceOver and TalkBack: every button, link and field has a spoken name; the reading order follows the screen; text grows with the phone's text-size setting; text contrast is at least 4.5:1 (3:1 for large text); every tap target is at least 44 pixels. (b) The player announces what is playing and any "Up next" countdown, and every pop-up is announced as a dialog with a named Close button. (c) The native apps build this in from the first screen; no native app is released until it passes. (d) **[MARC DOES]** Before release, and before any outreach to blind or low-vision listeners, Marc or a blind tester runs the core path with VoiceOver on a real phone: sign up, start the trial, pay, browse, pick a story, play, pause, skip, continue to the next episode. Why: Marc, Nov 10, 2026: blind and low-vision listeners are a possible market (about 4.2 million U.S. adults with serious vision loss), and the scan that night found the core path partly blocked: sign-up fields named only by placeholder text, white text on orange and green buttons at about 2.3:1 to 2.8:1 contrast, pop-up Close buttons read as "multiply", and the "Up next" countdown not announced. Settles: rule 69 (white text, orange for emphasis) stays: buttons use darker shades (orange #c2410c, green #15803d) so white text passes contrast; rule 70 (44-pixel buttons) becomes Agreed for the whole app. Code: the fixes from the Nov 10 scan, as separate PRs (first: PR #574, merged Nov 10: button shades and sign-up field labels; next: player dialogs and announcements, small text links, buttons inside links); the native apps' requirements. Written into CANON-12 and CANON-11 as decision 132.
