# CANON-01 — Story Production Process (the end-to-end map)
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: every step from idea to live story, in order; who runs each step; job states; retries; stuck and failed jobs; restore points and recovery. Does not cover: the detailed rules inside each step. Those live in CANON-02 (ideas and briefs), CANON-03 (writer), CANON-04 (Belle), CANON-05 (voices), CANON-06 (sound effects), CANON-07 (music and mix), CANON-08 (quality gates), CANON-09 (publishing), CANON-10 (covers and eBooks).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 14 [MARC DECIDES]:** Publish switch. The switch is read at this moment. Review: Marc listens and approves. Direct: the story goes live with no review. Owner: CANON-09.
- **Rule 20 [MARC DECIDES]:** Marc decides: merges outside Claude's own pipeline PRs, every database migration, the publish switch, the release of the publication hold, and…
- **Rule 32 [MARC DECIDES]:** Adding episodes never re-plans or rewrites existing episodes. Use scripts/series/continue-series.ts (dry run, Marc approves the plan). Never run…
- **Rule 35 [MARC DECIDES]:** Never merge a PR without Marc's word (except rule 18), and never run a migration without Marc's OK.
- **Rule 56 [MARC DECIDES]:** Stop and ask Marc when any step could overwrite or hide live content.
- **Rule 57 [MARC DECIDES]:** Author-written series (Sunset of Competition) are never rewritten by the pipeline. On a failed check it stops and reports; only approved…
- **Still open:** nothing. Every conflict and question below is RESOLVED (CANON-99 Parts 1 and 2, Nov 9, 2026).

## Rules

### A. The steps, in order
Each line gives: step name, what runs it, and which canon doc owns the rules for that step.

1. **Idea or queue item.** A story starts as a row in `story_queue_items` (status `queued`) or as a series plan from Strategos (series blueprint, steps 1–2 of the 14-step map). Owner of rules: CANON-02. — **In force (code)** (supabase/migrations/20260515144738_update_story_queue_lifecycle.sql; memory /projects/…/areas/agent-fleet.md, Strategos owns the blueprint)
2. **Brief.** The story gets a brief (`brief_json`; story row `status = brief_complete`). For a series, a whole-series plan comes before Episode 1. Owner: CANON-02. — **Agreed** (Marc Oct 29, 2026: "a whole-series plan before episode one … permanent", memory /projects/…/areas/story-pipeline.md)
3. **Dispatch.** The `dispatch-queue` cron (every 1 minute) turns queued stories into one `production_jobs` row per standalone story or per series. At most 8 new jobs per run. — **In force (code)** (vercel.json crons; app/api/cron/dispatch-queue/route.ts, MAX_DISPATCH_PER_RUN = 8, Marc GO Jul 10 for ATL-IO-CAP-001)
4. **Runner.** Four `production-runner` workers (every 1 minute) call `run-next`, which runs one step of one job at a time. — **In force (code)** (vercel.json; app/api/cron/production-runner/route.ts; app/api/admin/production-jobs/run-next/route.ts)
5. **Script.** Standalone step `generate_script`; series step `generate_episode_script`. Owner: CANON-03. — **In force (code)** (run-next/route.ts lines 223–252)
6. **Script checks.** Standalone: `validate_voice_conformance` → `validate_script` → `validate_story_resolution`. Series: `score_validate_package` (includes the series continuity check and the Gemini script read, report-only). Owner: CANON-08. — **In force (code)** (run-next/route.ts; lib/geminiStoryRead.ts)
7. **Story clarity check** runs before any voicing money is spent. Until the gate is built, a reviewer applies it by hand. Owner: CANON-08. — **Agreed** (PIPELINE-CANON STORY-CLARITY RULE, Marc Nov 8, 2026)
8. **Voice check and voices.** `voice_preflight` / `series_voice_preflight`, then `generate_voices` / `series_generate_voices`. Owner: CANON-05. — **In force (code)** (run-next/route.ts)
9. **Belle.** `generate_belle_assets` → `validate_belle_assets` → `validate_belle_quality` (repair step `repair_belle_quality`); series: `series_generate_belle_assets`. Owner: CANON-04. — **In force (code)** (run-next/route.ts)
10. **Sound effects.** Placed from the approved sound catalog during the mix. Owner: CANON-06. — **Agreed** (Marc Oct 31: closed catalog, no AI fallback, memory story-pipeline.md)
11. **Music and final mix.** `generate_music` / `series_generate_music`, then `render_final_mix` / `series_render_final_mix`. Owner: CANON-07. — **In force (code)** (run-next/route.ts)
12. **Package.** `complete_story_package` fills author, narrator, cover, description and eBook text (`prose_text`), then sets the story hidden at `status = audio_ready`. Owner: CANON-10 for cover and eBook. — **In force (code)** (app/api/admin/complete-story-package/route.ts)
13. **Ready for review.** Job ends at step `ready_for_review`; story `workflow_state = ready_for_review`. — **In force (code)** (run-next/route.ts NEXT_STEP_AFTER_STANDALONE_PACKAGE)
14. **[MARC DECIDES]** **Publish switch.** The switch is read at this moment. Review: Marc listens and approves. Direct: the story goes live with no review. Owner: CANON-09. — **Agreed** (PIPELINE-CANON Rule 4; docs/PLAYER-RULES.md "What listeners can see" 4, Marc Nov 8)
15. **Live.** The story is live only when `status = published`, `is_hidden = false` and `published_on` is set, and it shows in library-new. Owner: CANON-09. — **Agreed** (AGENTS.md production success criteria; lib/directPublish.ts isListenerVisible)
16. **A story is done only when** the correct script was used, Belle intro and outro are correct, the sting and music are present when expected, the final mix is exported and imported, the story publishes, and it appears in library-new. — **Agreed** (AGENTS.md "Production success criteria"; DONE_CHECKLIST.md)

### B. Who does what
17. **Claude (the pipeline writer) writes every script.** No agent, including Hal and Orion, writes or edits scripts. — **Agreed** (AGENTS.md agent rules; Marc Nov 8, 2026, memory agent-fleet.md)
18. **Claude delivers code changes as PRs on `main`.** Claude may merge its own pipeline PRs only after tests, the Vercel build and mergeability pass. — **Agreed** (memory agent-fleet.md, Nov 6 rule)
19. **Orion is the only EC2 deployer.** He deploys merged `main` from a handoff Marc pastes. — **Agreed** (memory agent-fleet.md)
20. **[MARC DECIDES]** **Marc decides:** merges outside Claude's own pipeline PRs, every database migration, the publish switch, the release of the publication hold, and anything that could overwrite or hide live content. — **Agreed** (AGENTS.md agent rules; PIPELINE-CANON Rule 4)
21. **Marc is left out of routine production.** He steps in only when he chooses or a rule requires it (for example Review mode). — **Agreed** (Marc Nov 7, 2026: "leave me out of the process", memory story-pipeline.md)
22. **Marc no longer approves voice casts** for each story, once voices are screened into the voice database. — **Agreed** (Marc Nov 4, 2026, memory story-pipeline.md)
23. **Every status claim is verified** by the one reporting it (a database query, file line, or command output in hand). Anything not checked is called "unverified". — **Agreed** (AGENTS.md "Verify results field by field"; Atlas/Orion reporting standard Oct 16, memory pipeline-dispatch-recovery.md)

### C. Job and story states
24. **Job status values** (`production_jobs.status`): `queued` (waiting for a runner), `running` (a runner holds it), `waiting_for_external` (waiting on an outside service), `complete`, `failed`, `cancelled`. Only `queued` and `running` may show as "active" on any screen. — **In force (code)** (lib/dispatchGuards.ts)
25. **One active job per story or series.** A new job is never created while one is `queued`, `running` or `waiting_for_external`. — **In force (code)** (lib/dispatchGuards.ts; migration 20260709100000 unique indexes)
26. **Story `workflow_state` values and meaning:**
    - `stories_in_queue`: waiting to be produced.
    - `scripts_ready`: script written, not yet produced.
    - `ready_for_review`: produced and hidden; waiting on the publish switch.
    - `approved_ready`: approved; next step is publish.
    - `published`: live (only when also unhidden with a publish date).
    - `unpublished_library`: was published, now hidden.
    - `repair_queue` (shown as "Production Holds") and `being_repaired`: held for a fix.
    - `failed`: production failed.
    - `cold_storage`: retired; never produced or shown.
    — **In force (code)** (lib/workflowTransitions.ts WORKFLOW_STATES)
27. **Only allowed state moves are used,** per the table in lib/workflowTransitions.ts. Every move records who, when and why (`workflow_state_changed_by/_at/_reason`). — **In force (code)** (lib/workflowTransitions.ts; ORION-GOV-006)
28. **Queue item status values:** `queued`, `in_v2`, `ready_for_asc`, `dispatched`, `producing`, `complete`, `published`, `failed`, `archived`. — **In force (code)** (migration 20260515144738)

### D. Strict ordering (PIPELINE-CANON Rule 3)
29. **Episodes run strictly in order, one at a time.** Episode N starts only after Episode N−1 passes. — **Agreed** (PIPELINE-CANON Rule 3, Marc Oct 4, 2026)
30. **A problem affects only the episode now running.** It never pulls back earlier episodes and never jumps ahead. — **Agreed** (PIPELINE-CANON Rule 3)
31. **A passed episode is locked.** It is never re-checked or re-run because of a later episode. — **Agreed** (PIPELINE-CANON Rule 3 scope)
32. **[MARC DECIDES]** **Adding episodes never re-plans or rewrites existing episodes.** Use scripts/series/continue-series.ts (dry run, Marc approves the plan). Never run /api/v2/series-package on a series that already has episodes. — **Proposed** (PIPELINE-CANON SERIES-CONTINUATION RULE, still PENDING Marc sign-off)

### E. Code changes and dispatch
33. **No dispatch before PR merge.** A story that needs a code fix is not dispatched until that fix is merged and deployed. — **Agreed** (Sequencing Rule, Marc Jul 22, 2026, PERMANENT, cited in PIPELINE-CANON header)
34. **Before merge, check any renamed or replaced component** with a diff. — **Agreed** (Pre-Merge Check, Marc Jul 23, 2026, PERMANENT)
35. **[MARC DECIDES]** **Never merge a PR without Marc's word** (except rule 18), and never run a migration without Marc's OK. — **Agreed** (AGENTS.md)
36. **One task at a time.** One change per deploy, so any break points to one change. — **Agreed** (AGENTS.md "One objective per cycle"; Story Production Spec §9.3, Nov 7 draft)
37. **Never deploy during a mix or voice job.** Orion deploys at a safe gap between jobs. — **Proposed** (practice in deploy handoffs, Oct 27–Nov 5 chats; never stated as a rule by Marc)

### F. Retries, stuck jobs and failed jobs
38. **Classify before fixing.** Every stuck story is labeled A (pipeline defect: fix the code and add a guard) or B (story defect: send it back for an automatic fix and re-run). Every block report states A or B. — **Agreed** (PIPELINE-CANON Rule 1; CLASSIFY-BEFORE-FIX LOOP, Marc Oct 3)
39. **Quality checks stop the run.** They never warn and continue. — **Agreed** (PIPELINE-CANON Rule 2) — details in CANON-08.
40. **Network blips resume automatically** at the same step, up to 6 times. — **In force (code)** (lib/transientResume.ts MAX_TRANSIENT_RESUMES = 6, RETRY-NET-001)
41. **A job that stops moving is a "zombie" after 15 minutes** (running, no lock, no update). It is failed with a clear report and can be safely retried from its step. — **In force (code)** (run-next/route.ts ZOMBIE_STALE_MS)
42. **Failure circuit:** 3 failed jobs for the same story or series within 2 hours stops new dispatch and moves the stories to Production Holds. — **In force (code)** (lib/dispatchGuards.ts DISPATCH_FAILURE_THRESHOLD; ATL-DISPATCH-DEFECTS-001)
43. **Retry cap:** 5 failed jobs in 7 days stops re-dispatch. A series with the same failure 3 times stops. — **In force (code)** (lib/dispatchGuards.ts RETRY_CAP, SERIES_IDENTICAL_FAILURE_CAP)
44. **Outside failures** (API key, balance, provider): 4 in 12 hours pauses dispatch for 30 minutes; 12 in 48 hours flags `needs_attention`. Episodes are not moved. — **In force (code)** (lib/dispatchGuards.ts; dispatch-queue/route.ts)
45. **Step retry limits:** Belle blocked 2 repair cycles; series Belle 3; music 3; segment voices 3; script rewrite 2; ready-for-review 2; series render 5. When spent, the story is flagged `needs_attention` and the job stays failed. — **In force (code)** (run-next/route.ts MAX_* constants)
46. **One repair pass only.** A story that fails production a second time after a repair goes to cold storage. — **Agreed** (Marc ruling Jul 9, 2026; lib/workflowTransitions.ts ONE_REPAIR_PASS_REASON) — see Conflict C2.
47. **`needs_attention` stops dispatch** for that story or whole series until cleared. — **In force (code)** (dispatch-queue/route.ts Gate A)
48. **Spending cap:** a paid step does not start when the routine production spend cap is reached. — **In force (code)** (run-next/route.ts SPEND_CAP_BLOCKED)
49. **Kill switch:** `PRODUCTION_RUNNER_PAUSED=true` stops all runners with no code change. — **In force (code)** (production-runner/route.ts)
50. **A paused or failed job is never restarted by hand without saying why** in the job log, and a manual re-queue resets that step's retry counter. — **Proposed** (fills gap: manual requeues are common in chats but not written down; music counter reset is in code)

### G. Restore points and recovery
51. **Never change the live production path without a restore point first.** — **Agreed** (AGENTS.md hard guardrails; DONE_CHECKLIST.md "Safety")
52. **Never replace a working path with a simpler fallback.** Keep working behavior before improving it. — **Agreed** (AGENTS.md)
53. **A restore point is:** the last good commit on `main` named in the PR, plus the previous build folder kept on EC2 (`.next.bak-<date>`). A failed deploy restores that copy and restarts. — **Proposed** (matches Orion deploy handoffs Oct 27; .restore/ folder exists but has no rule)
54. **Recovery of a broken file is from git,** never by patching on top of a broken file. — **In force (doc)** (MASTER_RULES.md "Restore from Git") — **Proposed** to confirm as canon.
55. **Production jobs are history.** Old failed job rows are never deleted or rewritten when a story is recovered. — **Proposed** (docs/CONTENT_APPROVAL_PROVENANCE.md, planning doc only)
56. **[MARC DECIDES]** **Stop and ask Marc** when any step could overwrite or hide live content. — **Agreed** (AGENTS.md)

### H. Author-written stories
57. **[MARC DECIDES]** **Author-written series (Sunset of Competition) are never rewritten by the pipeline.** On a failed check it stops and reports; only approved mechanical edits are made. It skips Belle style checks and the runtime floor; all technical checks still apply. — **Agreed** (Marc Nov 3, 2026, memory sunset-of-competition.md)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 12:** **Retire old manual documents** as history: STORY_PRODUCTION_PROCESS v1.2, SCRIPT_VALIDATOR.md, STORY_GRADING_RUBRIC.md, STORY_BRIEF_TEMPLATE v2.2, NEDS scoring, character-attachment scoring, MASTER_RULES.md, DEPLOY.md, DEPLOYMENT-RUNBOOK.md, HAL_SESSION_START_PROTOCOL.md, MIX_SPEC.md and MIX_NOTE_PROTOCOL.md level tables, et_mix_assembly.py, ACQUISITION-RETENTION-001 Parts A, D, E. Decided: yes, all. (01 C1, 02 C4, Q5, Q6, 03 Q7, 07 C4, C6, 13 C9, 15 C3–C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 18:** **Repairs.** Decided: text problems go back to the pipeline writer automatically (never an agent); a whole failed production gets one repair pass, then cold storage. "Hal rewrite" in PIPELINE-CANON becomes "pipeline writer rewrite". (01 C2, C3, 08 C7) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 19:** **Restarting failed jobs.** Decided: Claude or Orion may restart a job once with a written reason; a second restart needs you. (01 Q1) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 20:** **One episode fails mid-series.** Decided: the whole series holds and you're told; nothing in it publishes. (01 Q4, 09 Q5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 24:** **Gemini's final read.** Decided: report-only until it agrees with you on 9 of 10 series, then it must pass before a Direct publish. (01 Q2, 09 C2, Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 61:** Series checks run per episode once built (decision 21); until then, record it as not fully enforced. (01 C4) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)
- **Decision 62:** The Nov 7 Story Production Spec: only the Gemini read (report-only) is approved; the rest is replaced by this canon. (01 Q3) — **Agreed** (Marc, Nov 9, 2026, CANON-99 Part 2)

## Conflicts found
- C1. **[RESOLVED by decision 12, Marc Nov 9, 2026]** docs/STORY_PRODUCTION_PROCESS.md v1.2 (June 10) describes a manual flow: Marc fills the brief, pastes prompts into Claude chats, sends scripts to Hal on Telegram, grades every story out of 30 before publishing, and uses the Series Release Rule. Today's flow is automatic (dispatch → run-next → publish switch), Hal writes nothing, and the Series Release Rule is retired. Recommendation: this canon wins; mark v1.2 as history. Marc decides.
- C2. **[RESOLVED by decision 18, Marc Nov 9, 2026]** Repairs: Marc Ruling 1 (Jul 8) said failed stories go to cold storage with no repairs (app/api/cron/repair-queue/route.ts). Marc ruling Jul 9 allows one repair pass. PIPELINE-CANON Rule 1 (Oct 4) requires automatic send-back and retry with no human step. Recommendation: Rule 1 governs content fixes (automatic rewrite, retry limits in rule 45); the one-repair-pass rule still applies to whole production failures. Marc decides.
- C3. **[RESOLVED by decision 18, Marc Nov 9, 2026]** PIPELINE-CANON Rule 1 says Class B text fixes go to "Hal rewrite". Marc Nov 8 and AGENTS.md: no agent writes scripts; the pipeline writer does. Recommendation: replace "Hal rewrite" with "pipeline writer rewrite" in PIPELINE-CANON. Marc decides.
- C4. **[RESOLVED by decision 61, Marc Nov 9, 2026]** Rule 3 says per-episode gates are the "intended shape … implementation is a separate track". Code still runs one `production_jobs` row per series (shared fate). Recommendation: record as not fully enforced (below), not a rule change.
- C5. **[RESOLVED: fact checked or done, Nov 9, 2026; see CANON-99 Part 2]** Memory (Oct 16) says no cron drove run-next; vercel.json now has 4 runner crons, but production runs on EC2 (Caddy → PM2), not Vercel (chat "AWS EC2 setup"). Which scheduler is live is unverified. Recommendation: Orion confirms which runner is live and canon names it.

## Open questions for Marc
- Q1. **[RESOLVED by decision 19, Marc Nov 9, 2026]** Who may restart a failed job by hand (Claude, Orion, or only after Marc's word)? Suggested answer: Claude or Orion may re-queue once with a logged reason; a second re-queue needs Marc.
- Q2. **[RESOLVED by decision 24, Marc Nov 9, 2026]** Should the Gemini read move from "report only" to a gate? Suggested answer: keep report-only until it agrees with Marc on 9 of 10 series (Story Production Spec §9.2, still a draft).
- Q3. **[RESOLVED by decision 62, Marc Nov 9, 2026]** Is the Story Production Spec (Nov 7 Claude Doc) approved or still a draft? Code cites "approved by Marc Nov 7" for the Gemini read only. Suggested answer: only the Gemini read (report-only) is approved; the rest stays draft.
- Q4. **[RESOLVED by decision 20, Marc Nov 9, 2026]** What happens to a series when one episode lands in cold storage mid-production? Suggested answer: the whole series holds and Marc is told; no later episode starts.

## Enforcement status
- 1–6, 8–9, 11–13, 24–28, 40–45, 47–49 → enforced in code at the paths given.
- 7 → not enforced (gate not built).
- 10 → partly (sound effects were turned off for all stories Nov 1 until a professional library is in place).
- 14 → enforced: lib/publishMode.ts, lib/directPublish.ts; current setting `direct` (atlas_settings, set Oct 11); publication hold released Oct 27.
- 29–31 → partly: lib/dispatchGuards.ts and one job per series; per-episode lock not built.
- 32 → script exists (scripts/series/continue-series.ts); rule pending.
- 33–37, 51–56 → by agent practice, not code.
- 46 → enforced: lib/workflowTransitions.ts failureDestinationForStory.
- 57 → enforced in part: lib/story-gates.ts AUTHOR-WRITTEN-RELEASE-001.

## Sources reviewed
- /tmp/dtt: AGENTS.md, DONE_CHECKLIST.md, MASTER_RULES.md, docs/PIPELINE-CANON.md, docs/PLAYER-RULES.md, docs/STORY_PRODUCTION_PROCESS.md, app/api/admin/production-jobs/run-next/route.ts, app/api/cron/dispatch-queue/route.ts, app/api/cron/production-runner/route.ts, app/api/cron/repair-queue/route.ts, lib/dispatchGuards.ts, lib/workflowTransitions.ts, lib/transientResume.ts, lib/geminiStoryRead.ts, vercel.json, supabase migrations (story_queue_items, publish_mode).
- Memory: /areas/story-pipeline.md, /projects/…/areas/story-pipeline.md, agent-fleet.md, pipeline-dispatch-recovery.md, sunset-of-competition.md.
- Chats: "AWS EC2 setup for Endless Tales", "Clearing CEO series flag", "Cover story map pattern" (Story Production Spec draft, Nov 7), "Endless Tales financial obstacles".
- Supabase (read only): atlas_settings publish_mode and publication_hold.
- Not reachable: Claude project docs (no Projects tool in this session), e.g. claude/autonomy-plan-2026-11-06.md, claude/stabilization-week-plan.md, claude/recovery-findings.md. Git history is a shallow clone (18 commits), so rule IDs in older commit messages could not be searched.

## Replaces (once approved)
- docs/STORY_PRODUCTION_PROCESS.md v1.2 (June 10, 2026)
- The production-flow parts of docs/ENDLESS_TALES_MASTER_BIBLE.md and docs/HAL_SESSION_START_PROTOCOL.md (Hal no longer writes)
- app/api/cron/repair-queue/route.ts comment "no repairs" (as policy)
