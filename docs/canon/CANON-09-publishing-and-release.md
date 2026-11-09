# CANON-09 — Publishing & Release
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: the publish switch, when and how stories go live, episode numbering, hidden episodes, unpublishing, cold storage, the publication hold, the needs_attention flag, approval records and story history. Does not cover: the quality checks that must pass before publishing (CANON-08), covers and eBooks (CANON-10), or what the player does with live episodes (docs/PLAYER-RULES.md).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 3 [MARC DECIDES]:** Review: every story waits at Ready for Review until Marc listens and approves. Then it goes live.
- **Rule 5 [MARC DECIDES]:** Only Marc changes the switch, with a one-line instruction or the Admin page switch. It stays until he changes it again.
- **Rule 9 [MARC DECIDES]:** In Review, corrections follow the Episode Correction Loop: Marc listens → approves or sends fixes → the fixed version comes to him as a link, not…
- **Rule 11 [MARC DECIDES]:** A story goes live complete, with all its episodes at once. A series stays hidden until every episode is finished and approved.
- **Rule 16 [MARC DECIDES]:** Sunset of Competition goes live all 26 episodes at once. Marc's release of it counts as his approval of each episode.
- **Rule 34 [MARC DECIDES]:** Only Marc releases the hold. Claude or Orion may turn it on to stop test content or a wrong publish, then must tell Marc at once.
- **Rule 42 [MARC DECIDES]:** A live story with a problem stays live unless Marc says otherwise ("After the Last Train" stays up).
- **Rule 45 [MARC DECIDES]:** A partly published series breaks rule 11. On finding one, do not publish more single episodes. Either finish all episodes and publish them…
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. The publish switch (Review or Direct)
1. **There is one publish switch** with two settings: **Review** (`rfr`) and **Direct** (`direct`). There is no per-story setting and no per-story question. — **Agreed** (PIPELINE-CANON Rule 4, Marc Oct 4, 2026)
2. **The switch is checked at the moment a story is ready to publish,** not when it was started. — **Agreed** (PIPELINE-CANON Rule 4; docs/PLAYER-RULES.md "What listeners can see" 4, Marc Nov 8)
3. **[MARC DECIDES]** **Review:** every story waits at Ready for Review until Marc listens and approves. Then it goes live. — **Agreed** (docs/PLAYER-RULES.md, Marc Nov 8)
4. **Direct:** stories go live without Marc's review. There is no listen after going live either; nothing may assume Marc will catch bad audio. — **Agreed** (PIPELINE-CANON Rule 4, option A, Marc Oct 4 10:34 and 10:35 EDT)
5. **[MARC DECIDES]** **Only Marc changes the switch,** with a one-line instruction or the Admin page switch. It stays until he changes it again. — **Agreed** (PIPELINE-CANON Rule 4; Admin Command Center switch, migration 20261031173118)
6. **The current setting is Direct** (set Oct 11; Marc Oct 27: "publish stories directly to the app, not to Ready for Review"). — **Agreed** (memory /projects/…/areas/story-pipeline.md Oct 27; atlas_settings row read Nov 9)
7. **If the switch can't be read, hold at Review.** If no setting exists, use Direct. — **In force (code)** (lib/publishMode.ts getPublishMode)
8. **No setting weakens a quality check.** All checks pass first; the switch only decides whether Marc reviews. — **Agreed** (PIPELINE-CANON Rules 2 and 4)
9. **[MARC DECIDES]** **In Review, corrections follow the Episode Correction Loop:** Marc listens → approves or sends fixes → the fixed version comes to him as a link, not published → he approves → only then it replaces or publishes. — **Agreed** (Episode Correction Loop, Marc Aug 21, 2026, PERMANENT; PIPELINE-CANON Rule 4 scope)
10. **The first story ever published by Direct mode is marked** `PUBLISH-MODE-DIRECT-FIRST-PUBLISH` in the log so Marc can check it. — **In force (code)** (lib/publishMode.ts FIRST_PUBLISH_MARKER)

### B. All episodes publish together
11. **[MARC DECIDES]** **A story goes live complete, with all its episodes at once.** A series stays hidden until every episode is finished and approved. — **Agreed** (EPISODE-ADDITION RULE, Oct 4; docs/PLAYER-RULES.md, Marc Nov 8)
12. **No 1-episode series is ever live.** — **Agreed** (Marc Nov 8, 2026, memory story-pipeline.md and hook-series.md)
13. **A series flips live once,** after the finale passes, under the switch setting at that moment. It is never split (some episodes Review, some live). — **Agreed** (PIPELINE-CANON Rule 3 and Rule 4 defaults)
14. **"Every episode" means the planned total** (`series_total_episodes`). A series with fewer episode rows than planned does not publish. — **Proposed** (fills gap: publish code checks only rows that exist, see Enforcement)
15. **Hook-first ad series launch as a 7-episode Season 1,** all 7 published together. — **Agreed** (PIPELINE-CANON HOOK-SERIES RULE, Marc Nov 5)
16. **[MARC DECIDES]** **Sunset of Competition goes live all 26 episodes at once.** Marc's release of it counts as his approval of each episode. — **Agreed** (Marc Nov 3, memory sunset-of-competition.md; lib/story-gates.ts AUTHOR-WRITTEN-RELEASE-001, Nov 4)
17. **Adding episodes to a live series:** new episodes are produced, then published together as one batch, after the last live episode. Original episodes stay locked. — **Agreed** (EPISODE-ADDITION RULE part 2; docs/PLAYER-RULES.md 5)
18. **One addition order = one batch.** No early release of single new episodes. — **Agreed** (EPISODE-ADDITION defaults)
19. **If unclear whether an episode is part of the first release or an addition,** treat it as the first release (publish together). — **Agreed** (EPISODE-ADDITION defaults)
20. **The old SERIES-RELEASE-RULE v2** (early release with a 3-episode buffer, July 11) is retired and is not canon. — **Agreed** (PIPELINE-CANON registry, retired Nov 9; docs/PLAYER-RULES.md open item)

### C. Episode numbering
21. **Episodes are numbered 1, 2, 3 … N.** Never 0, no gaps, no repeats. A single story is Episode 1. — **Agreed** (EPISODE-NUMBERING RULE, Marc Oct 4)
22. **Numbering is checked before publish and blocks.** A bad sequence is fixed to 1..N first. — **Agreed** (EPISODE-NUMBERING defaults); **In force (code)** (lib/story-gates.ts assertSeriesContiguity)
23. **If an episode is cut before publish,** the numbers close up so the live list has no hole. — **Agreed** (EPISODE-ADDITION and EPISODE-NUMBERING defaults)
24. **Additions continue from the last live number** (N+1, N+2 …). Live episodes are never renumbered. — **Agreed** (EPISODE-ADDITION; EPISODE-NUMBERING)

### D. Live, hidden and the publish record
25. **A story is live only when** `status = published`, `is_hidden = false` and `published_on` is set. — **In force (code)** (lib/directPublish.ts isListenerVisible, PUBLISH-VISIBLE-001)
26. **Hidden episodes never appear** in lists, navigation or autoplay. — **Agreed** (docs/PLAYER-RULES.md)
27. **Before going live, a story must have:** title, author, genre, final audio, cover, description, length, Belle announcement audio, and pass the Belle copy, Belle freshness and name-personalization checks. — **In force (code)** (lib/story-gates.ts, lib/publishReadiness.ts, lib/publicationBelleGate.ts, lib/belleFreshness.ts, lib/personalization/publishGuard.ts)
28. **Going live is two recorded steps:** `ready_for_review` → `approved_ready` → `published`. There is no shortcut. Each step writes an audit row (who, when, why). — **In force (code)** (lib/directPublish.ts; lib/workflowTransitions.ts; ORION-GOV-006)
29. **A packaging run never hides a live story.** — **In force (code)** (complete-story-package/route.ts PACKAGE-NO-UNPUBLISH-001, after Nanny Cam EP5 and Chicago EP7, Oct 27–29)
30. **If a live story is re-hidden by a re-run, it is made visible again** with its original publish date. — **In force (code)** (lib/directPublish.ts restoreVisibility)
31. **After any publish, check that every episode is live 5 minutes later,** finale included, and say so with database proof. — **Proposed** (practice in "Clearing CEO series flag" chat; not written as a rule)

### E. Publication hold (global stop)
32. **The publication hold stops every publish** (Review or Direct) until released. Every publish path checks it right before writing. — **In force (code)** (lib/publicationHold.ts, PUBLICATION-HOLD-001, Marc Oct 23)
33. **If the hold can't be read, nothing publishes.** — **In force (code)** (lib/publicationHold.ts)
34. **[MARC DECIDES]** **Only Marc releases the hold.** Claude or Orion may turn it on to stop test content or a wrong publish, then must tell Marc at once. — **Proposed** (Claude set it Nov 2 to stop a test series and Marc was told; never written as a rule)
35. **Test content is never published.** — **Proposed** (cited as "your brief says not to publish test content", chat "Clearing CEO series flag"; no written rule found)

### F. Unpublish, rollback and cold storage
36. **Unpublishing a live story** moves it to `unpublished_library` (hidden). It never deletes audio, cover or text. — **In force (code)** (lib/workflowTransitions.ts: published → unpublished_library)
37. **A series is unpublished as a whole,** never one episode, so listeners never see a series with missing episodes. — **Proposed** (follows rule 11; no rule covers unpublishing)
38. **A live story goes to cold storage only by deliberate "retire"** action. — **In force (code)** (lib/workflowTransitions.ts transitionAllowed retire flag)
39. **Cold storage means retired.** A cold-storage story is never dispatched, produced or shown. Bringing it back goes only through the "recover from cold storage" action, which resets its review fields and sends it to Ready for Review. — **In force (code)** (lib/workflowTransitions.ts)
40. **Retiring stalled or outdated work goes to cold storage, not deletion** (69 stalled stories, Oct 2026; early-October queue, Nov 1). — **Agreed** (Marc, memory /areas/story-pipeline.md; Nov 1 memory story-pipeline.md)
41. **Improving an old published story is a separate "Remaster" job.** New production never touches a live episode. — **Proposed** (Marc Nov 7 asked for a way to pull and reprocess old stories; Story Production Spec §10 is a draft, "do not implement")
42. **[MARC DECIDES]** **A live story with a problem stays live unless Marc says otherwise** ("After the Last Train" stays up). — **Agreed** (Marc Nov 8, PIPELINE-CANON STORY-CLARITY scope)

### G. needs_attention flag
43. **`needs_attention` means a person must look.** While set, the story or its whole series is not dispatched. It always carries a plain reason. — **In force (code)** (dispatch-queue/route.ts Gate A)
44. **Clearing `needs_attention` requires the cause to be fixed** and the fix named in the reason field. — **Proposed** (fills gap: who may clear the flag is not written)

### H. Partly published stories (rule breaks)
45. **[MARC DECIDES]** **A partly published series breaks rule 11.** On finding one, do not publish more single episodes. Either finish all episodes and publish them together, or hide the live part. Marc chooses. — **Proposed** (Rerouted, Weekend Wife and other hook series had Episode 1 live alone, Nov 6–9; SERIES-CONTINUATION RULE rationale)
46. **The single-episode publish path must refuse series episodes** unless it publishes the rest of the series in the same action. — **Proposed** (code today allows one episode once earlier ones are live: app/api/admin/publish-story/route.ts single path)

### I. Approval records and story history
47. **Each story should carry an approval record:** source job, version number and date, new or redo, redo reason, what changed, why it entered review, why it is blocked. — **Proposed** (docs/CONTENT_APPROVAL_PROVENANCE.md v1.0, planning only)
48. **The review screen shows the whole series,** expected vs present episodes and missing numbers, never only the rows in one tab. — **Proposed** (docs/CONTENT_APPROVAL_PROVENANCE.md)
49. **Each story should carry a history label:** legacy, canonical, experimental, incomplete, blocked, hidden, deprecated, redo or orphaned. A label describes history, not whether it is live. — **Proposed** (docs/STORY_LINEAGE_AND_CLASSIFICATION.md v1.0, planning only)
50. **A redo shows the version it replaces.** The old version is kept for history. — **Proposed** (docs/STORY_LINEAGE_AND_CLASSIFICATION.md)

### J. Checking it worked
51. **library-new is the place to check** that a story is truly live. — **Agreed** (AGENTS.md "library-new is the current verification surface"; DONE_CHECKLIST.md "visible in library-new")

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 1:** **Hook series ads start when?** Nov 6 said "after Episodes 2 and 3 are live"; Nov 8 said all 7 episodes publish together. Decided: ads start only after all 7 Season 1 episodes are live. (09 C1, 13 C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 2:** **Hook Episode 1s that are already live alone** (Rerouted and the others). Decided: leave them up; publish Episodes 2 to 7 together; no more single episodes. (09 Q1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 4:** **Episode length.** Decided: standalones within ±10% of target; series episodes between the 12.5-minute floor and 1.35 × the brief; speaking rate 160 words per minute everywhere. Publish code uses the same numbers (today it only allows 15–20 minutes). (02 C5, 03 C3, 08 C2, 09 C4) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 20:** **One episode fails mid-series.** Decided: the whole series holds and you're told; nothing in it publishes. (01 Q4, 09 Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 24:** **Gemini's final read.** Decided: report-only until it agrees with you on 9 of 10 series, then it must pass before a Direct publish. (01 Q2, 09 C2, Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 44:** **No episode goes live alone.** Decided: every publish path refuses to publish part of a series (today the manual publish can). (09 conflict 1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 45:** **Who may unpublish.** Decided: only you, except that Claude may hide a story with broken audio at once and tell you. (09 Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 88:** The old production process and Series Release Rule become history; PIPELINE-CANON's rule titles get corrected. (09 C3, C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 89:** Test stories carry a "test" mark, and every publish path refuses them. (09 Q4) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 1, Marc Nov 9, 2026]** Marc Nov 6: launch each hook series' ads "as soon as its own EP2 and EP3 are live" (memory hook-series.md). Marc Nov 5 HOOK-SERIES RULE and Nov 8: all 7 episodes publish together, no 1-episode stories live. Recommendation: Nov 8 wins; ads start only after all 7 are live. Marc decides.
- C2. **[RESOLVED by decision 24, Marc Nov 9, 2026]** Marc Oct 27 (Direct, no review) and Nov 7 ("leave me out") vs Nov 7 request that Gemini give a final read "and approve it to be published". Gemini's read is built report-only (lib/geminiStoryRead.ts) and runs only on scripts, not on the final mix. Recommendation: Direct stays; Gemini final read becomes a blocking pre-publish check only after the trial in the Story Production Spec. Marc decides.
- C3. **[RESOLVED by decision 88, Marc Nov 9, 2026]** docs/STORY_PRODUCTION_PROCESS.md v1.2 and SERIES-RELEASE-RULE v1/v2 say Marc grades every story (22+/30) and Episode 1 needs Episode 2 live. Both replaced by rules 3–4 and 11. Recommendation: mark as history.
- C4. **[RESOLVED by decision 4, Marc Nov 9, 2026]** lib/storyQueue/directPublish.ts allows operator direct-publish only for episodes 15–20 minutes. Marc Oct 26 chose series episodes 12–18 minutes, and Pocket FM-style episodes are 12–15 minutes. Recommendation: the length rule belongs to CANON-03/08; publish code should read it from there. Marc decides the numbers.
- C5. **[RESOLVED by decision 88, Marc Nov 9, 2026]** PIPELINE-CANON Rule 2's cross-reference in EPISODE-ADDITION calls Rule 2 "no silent /tmp QC" and Rule 1 "no partial passes"; the real titles are "Quality Gates Block" and "Block Classification". Recommendation: fix the wording in PIPELINE-CANON.

## Open questions for Marc
- Q1. **[RESOLVED by decision 2, Marc Nov 9, 2026]** Rerouted EP1 (and other hook EP1s) are live alone today. Hide them until all 7 are ready, or leave them up? Suggested answer: leave them up (ads point to them) but publish no more single episodes; publish EP2–EP7 together.
- Q2. **[RESOLVED by decision 45, Marc Nov 9, 2026]** Who may unpublish a live story? Suggested answer: only Marc, except a story with broken audio, which Claude may hide at once and report.
- Q3. **[RESOLVED by decision 24, Marc Nov 9, 2026]** Should Direct mode require the Gemini final read to pass? Suggested answer: yes, after the 1-week shadow trial agrees with Marc.
- Q4. **[RESOLVED by decision 89, Marc Nov 9, 2026]** What is a "test" story, and how is it kept from publishing? Suggested answer: a `is_test` mark that every publish path refuses.
- Q5. **[RESOLVED by decision 20, Marc Nov 9, 2026]** When a story in the series fails after others pass, can Marc publish the passed ones? Suggested answer: no; the series holds (rule 11).

## Enforcement status
- 1–8, 10 → enforced: lib/publishMode.ts, lib/directPublish.ts, Admin Command Center switch.
- 9 → by practice only.
- 11, 13 → partly: Direct series path publishes all existing episodes together (lib/directPublish.ts maybeDirectPublishSeries), but the manual single path (app/api/admin/publish-story/route.ts) can publish one series episode alone, and no path compares against `series_total_episodes`.
- 12, 14, 45, 46 → not enforced.
- 16 → enforced: lib/story-gates.ts AUTHOR-WRITTEN-RELEASE-001.
- 21–22 → enforced: lib/story-gates.ts assertSeriesContiguity. "Never 0" holds because 0 is treated as no number.
- 25–30, 32–33, 36, 38–39, 43 → enforced at the paths given.
- 31, 34, 35, 37, 41, 44, 47–50 → not enforced.
- 51 → by practice.

## Sources reviewed
- /tmp/dtt: docs/PIPELINE-CANON.md, docs/PLAYER-RULES.md, AGENTS.md, DONE_CHECKLIST.md, docs/CONTENT_APPROVAL_PROVENANCE.md, docs/STORY_LINEAGE_AND_CLASSIFICATION.md, docs/STORY_PRODUCTION_PROCESS.md, governance/SERIES-RELEASE-RULE.md, lib/publishMode.ts, lib/publicationHold.ts, lib/directPublish.ts, lib/storyQueue/directPublish.ts, lib/story-gates.ts, lib/publishReadiness.ts, lib/workflowTransitions.ts, app/api/admin/publish-story/route.ts, app/api/admin/complete-story-package/route.ts, app/api/admin/content-approval/route.ts, app/api/admin/center/production/route.ts, lib/geminiStoryRead.ts.
- Memory: /projects/…/areas/story-pipeline.md, player-rules.md, hook-series.md, sunset-of-competition.md, pipeline-dispatch-recovery.md; /areas/story-pipeline.md.
- Chats: "Clearing CEO series flag" (Nov 2 hold, PACKAGE-NO-UNPUBLISH), "AWS EC2 setup for Endless Tales" (Oct 11 publish-mode build), "Cover story map pattern" (Nov 7 Story Production Spec, Gemini read).
- Supabase (read only): atlas_settings.
- Not reachable: Claude project docs (no Projects tool), e.g. claude/player-rules.md, claude/todo-list.md.

## Replaces (once approved)
- governance/SERIES-RELEASE-RULE.md (already retired)
- STEP 7 and STEP 8 of docs/STORY_PRODUCTION_PROCESS.md v1.2
- The publish sections of docs/PUBLISHED_STORY_SPEC.md that conflict with these rules (not checked line by line)
