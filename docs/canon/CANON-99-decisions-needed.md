# CANON-99 — Decisions Needed (Nov 9, 2026)
Status: OPEN · 60 decisions for Marc · Owner: Marc
Covers: every conflict and unanswered question found in the canon audit, with a recommendation for each. Does not cover: rules already agreed (those are in CANON-01 to CANON-15).

## How to answer

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
57. **Plow back.** **Recommend:**
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
