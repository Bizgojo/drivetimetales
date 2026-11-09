# CANON-15 — Agents, Code & Operations
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: who the agents are and what each may do; approvals for merges, database changes and deploys; how Claude talks to Marc and to agents; Telegram; watchdogs and alerts; security of keys and routes; which documents are law. Does not cover: story production steps (PIPELINE-CANON and story rules); the player and listener app (PLAYER-RULES); ad approval (CANON-13); money and the statement (CANON-14).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 1 [MARC DECIDES]:** Only the documents in the AGENTS.md "Canon index" are law. Everything else is history or reference. When two canon documents disagree, ask Marc.
- **Rule 2 [MARC DECIDES]:** No agent declares canon. Canon changes only on Marc's explicit word.
- **Rule 3 [MARC DECIDES]:** Never merge a pull request (PR) without Marc's explicit word.
- **Rule 5 [MARC DECIDES]:** Never run a database migration or schema change without Marc's explicit OK.
- **Rule 8 [MARC DECIDES]:** Stop and ask Marc when a step could overwrite or hide live content.
- **Rule 10 [MARC DECIDES]:** No crontab hold line (#HOLD-…) or paused service is turned back on without Marc's word.
- **Rule 54 [MARC DOES]:** Marc enters money-spending keys himself (for example Meta ads_management). Low-risk test keys may be passed through Orion.
- **Still open:** 9 conflicts or questions below, each with a recommendation in CANON-99 Part 2.

## Rules

### A. What is law
1. **[MARC DECIDES]** Only the documents in the AGENTS.md "Canon index" are law. Everything else is history or reference. When two canon documents disagree, ask Marc. — **Agreed** (AGENTS.md; commit 2683da9, Nov 9)
2. **[MARC DECIDES]** No agent declares canon. Canon changes only on Marc's explicit word. — **Agreed** (memory bell-meta-marketing.md standing rules; governance/ACQUISITION-RETENTION-001.md change control)

### B. Approvals
3. **[MARC DECIDES]** Never merge a pull request (PR) without Marc's explicit word. — **Agreed** (AGENTS.md agent rules) — see C1 for Claude's pipeline exception.
4. Marc's merge word is separate from any later step (deploy, publish). — **Agreed** (Oct 11, 2026, chat "AWS EC2 setup for Endless Tales")
5. **[MARC DECIDES]** Never run a database migration or schema change without Marc's explicit OK. — **Agreed** (AGENTS.md) — see C2.
6. No agent approves its own merge, database write or production action. Orion, Atlas and Lyra are one agent with different names, so they cannot review each other. Claude is the independent reviewer. — **Agreed** (Oct 11, 2026, same chat)
7. The builder never checks its own work. A separate fresh helper verifies. — **Agreed** (Oct 29–30, chat "Meta campaign testing plan")
8. **[MARC DECIDES]** Stop and ask Marc when a step could overwrite or hide live content. — **Agreed** (AGENTS.md)
9. Never patch the live production path without a restore point first. Never replace a working path with a simpler fallback. Keep what works before improving it. — **Agreed** (AGENTS.md hard guardrails)
10. **[MARC DECIDES]** No crontab hold line (#HOLD-…) or paused service is turned back on without Marc's word. — **Proposed** (holds are used, e.g. HOLD-C9, but no rule says who lifts them)

### C. Working rules for every agent
11. One task at a time. One objective per work cycle. — **Agreed** (AGENTS.md)
12. Check results field by field. Say "unverified" when unsure. — **Agreed** (AGENTS.md)
13. "Verified" means only what the agent ran itself: a database SELECT, a file line, or command output in hand. A helper's report is not verification. — **Agreed** (Oct 16, Atlas/Orion standard Marc required; memory pipeline-dispatch-recovery.md)
14. All story writing goes through the pipeline (Claude). No agent, including Hal, writes or edits scripts. — **Agreed** (AGENTS.md; memory agent-fleet.md, Nov 8)
15. Hal never edits code. — **Agreed** (AGENTS.md)
16. Before any fix PR, Claude gives Marc three lines: the cause (not the error message); every other place with the same cause, from a search shown to Marc; why it won't come back. Otherwise it is a patch. — **Agreed** (PERMANENT RULE 1, memory preferences.md)
17. A pipeline fix counts as done only when the success rate moves on real jobs. A merged PR does not count. — **Agreed** (PERMANENT RULE 2, memory preferences.md)
18. Agent replies use one line per item: DONE + proof, or BLOCKED + reason. — **Proposed** (used in handoffs since Nov 5; never set as a rule)
19. If an agent is stuck for 30 minutes, it reports BLOCKED with the reason instead of retrying in silence. — **Proposed** (no timeout rule exists)

### D. Code and deploys
20. main is the only code line. Every change is a PR based on current main. — **Agreed** (memory agent-fleet.md, Nov 6)
21. Sequencing Rule: no job that depends on a code change is sent until that change's PR is merged and deployed. — **Agreed** (Marc, 2026-07-22, PERMANENT; cited in docs/PIPELINE-CANON.md). The original wording was not found in the repo; this line restates it.
22. Pre-Merge Check: a PR that renames or replaces a component must show a diff proving no logic was lost. — **Agreed** (Marc, 2026-07-23, PERMANENT; cited in docs/PIPELINE-CANON.md, applied in docs/atlas/ATLAS-GAP2-QC-20261011-1408.md). Original wording not found; this line restates it.
23. Orion is the only one who deploys to the EC2 server. He deploys merged main from a handoff Marc pastes. — **Agreed** (memory agent-fleet.md)
24. Every deploy uses the zero-downtime script: build in the idle slot, wait for /api/version to show the new commit, switch Caddy, let the old slot finish (up to 20 minutes), then stop it. A failed build leaves the live app alone. — **Agreed** (ZERO-DOWNTIME-001, Marc 2026-11-02; scripts/ec2-deploy/zero-downtime-deploy.sh, README)
25. Each deploy handoff: stop if a build is already running; confirm the commit comes after the current one; keep the old version as the restore point; report the commit, services running and public page 200; no database writes; leave dispatch, cron, render and pool workers alone unless told. — **Proposed** (the standard handoff used since Oct 28; make it the written checklist)
26. Re-queue jobs that wait on a fix only after the new build is confirmed live. — **Proposed** (docs/DEPLOYMENT-RUNBOOK.md ATL-OPS-001, written by Atlas; covered by rule 21)

### E. Who does what
27. Orion — Chief Operating Officer. Telegram @OrionETCOO_bot, run through OpenClaw on Marc's Mac. Runs EC2 and database operations, deploys, relays agent work, verifies the ad approval system. — **Agreed** (memory agent-fleet.md)
28. Claude — writes all stories through the pipeline; builds the pipeline, app and player (since Nov 6); independent code reviewer; drafts every agent handoff. — **Agreed** (memory agent-fleet.md, Nov 6 and Nov 8)
29. Hal — runs story delivery steps and cuts ad videos. No scripts, no code. — **Agreed** (AGENTS.md; memory agent-fleet.md; Nov 1 "Confirm Hal")
30. Atlas — writes code as Orion's helper. — **Agreed** (Oct 29–30, chat "Meta campaign testing plan")
31. Susan — Chief Growth Officer: ads, go-to-market, creative. Strategos — Chief Strategy Officer: audience, market, series blueprint (steps 1–2), runs on EC2 behind a server-side key. Details in CANON-13. — **Agreed** (memory agent-fleet.md)
32. Bart — finance agent, read-only bank access. — **Agreed** (memory agent-fleet.md, /areas/endless-tales-platform.md)
33. Gemini — screens voices, sound effects and covers, and reads stories (report only). — **Agreed** (Nov 4–5, memory audio-pipeline.md project copy; chat "Apple App Store commission deals")
34. ChatGPT ("Sam") no longer works on the app or player (moved to Claude Nov 6). — **Agreed** (memory agent-fleet.md)
35. Codex: the May 2026 campaign spec names "Codex (Claude Code)" as the builder. It has no current role. — **Proposed** (see Q3)
36. Other names in Admin (Vega, Maya, Lex, Lyra, Holly, Scribe) have no role Marc approved. — **Proposed** (see Q4)

### F. AI models
37. The agent fleet runs on DeepSeek, because Claude API costs were too high (Nov 8). Strategos on DeepSeek R1; Atlas on DeepSeek V3. — **Agreed** (memory agent-fleet.md, Nov 5 and Nov 8; replaces Orion-on-Sonnet)
38. Every agent has at least one fallback model, so one empty account never stops the fleet. — **Proposed** (Nov 5 Orion outage; in Claude's handoff, not confirmed by Marc)
39. Model changes go through openclaw.json and the model-policy gate, with a backup and a dry run first. — **Proposed** (same handoff)
40. Orion works in short sessions, one task at a time, with Ollama and Docker off and the Mac awake and plugged in. — **Proposed** (Nov 7 advice; Marc chose no cloud server for now, see CANON-14 rule 55)

### G. How Claude talks to Marc
41. Instructions to Marc are short, numbered and concrete. One step at a time. No bundled actions. Large, readable text. — **Agreed** (memory preferences; profile: low vision)
42. If an agent can do a task, Claude writes a paste-ready handoff for Marc instead of walking him through terminal steps. Exceptions: physical Mac access, credentials only Marc holds, or Marc's judgment on audio or story quality. — **Agreed** (rule dated July 22, 2026, memory preferences)
43. Give an honest view, not agreement. — **Agreed** (memory preferences.md)
44. Time estimates assume AI pace, not human pace. — **Agreed** (memory preferences.md)
45. "Report 101" = a table of every open item (what Marc sent, actual state checked in the database or GitHub, done / pending / not started / needs fix), then a numbered list of Marc's to-dos. — **Agreed** (memory preferences.md)

### H. Telegram, watchdogs and alerts
46. Watchdogs only detect and alert. They never restart anything, clear cooldowns or write the database. The recovery watchdog and the alert watchdog must never fight. — **Agreed** (Marc rule 2026-07-10; scripts/watchdog/ALERTING-WATCHDOG-SPEC.md)
47. Alerts go straight to Marc through the Telegram Bot API, with no AI model involved, so they work when models are down. — **Agreed** (design locked 2026-07-10, same spec)
48. "MARC ACTION" alerts (usage limits, billing failures, revoked keys) go out at once, then at most once per 30 minutes for the same problem. — **Agreed** (Marc directive 2026-07-11, same spec)
49. Orion is "silent" after 45 minutes with no heartbeat. The check runs every 5 minutes, alerts at any hour, then every 30 minutes while still silent. A MONITORING_PAUSED file stops all alerts. — **Agreed** (Marc decisions Oct 11, 2026, same spec)
50. Every AI service used by the pipeline and agents is watched. Report 101 alerts, with a top-up link, only for services running low enough to stop the pipeline, Orion or Telegram. — **Agreed** (Nov 5, memory agent-fleet.md)
51. The progress alarm runs every 5 minutes from an EC2 timer. It only reads, apart from its own alarm notes. — **In force (code)** (scripts/ec2-deploy/endlesstales-progress-alarm.timer, ALARM-FIXES-4)
52. Cast-review voice clips go to the "Voices Ready" Telegram group (Marc + Orion's bot). — **Agreed** (memory agent-fleet.md)

### I. Keys and security
53. Never open, print, copy or paste private keys, .pem files or tokens. Report env variable NAMES only, never values. — **Agreed** (AGENTS.md; Amendment 1 §11.4)
54. **[MARC DOES]** Marc enters money-spending keys himself (for example Meta ads_management). Low-risk test keys may be passed through Orion. — **Agreed** (Oct 29–30, chat "Meta campaign testing plan")
55. Admin and pipeline write routes (/api/admin, /api/asc3 writes) need an admin login or the internal key. — **In force (code)** (middleware.ts, ASC3-AUTH-001)
56. The open /api/v2 routes (author-options, generate-script, load-story, produce-audio, save-revised-script, score-script, series-package, story-brief, validate-script) must get the same login gate. — **Proposed** (9 of 10 have no auth check; middleware lets /api/ through)
57. Leaked or exposed keys are replaced, and the old ones revoked: Orion's Telegram bot (renamed by someone Oct 26), the "default" bot, and any key written in a repo document. Bot tokens move out of plain text in openclaw.json. — **Proposed** (todo list items 12–13; not yet decided or done)
58. No key, token or password is ever written in a repo document or memory. — **Proposed** (see C6)
59. Server security updates are installed in a planned window run by Orion. — **Proposed** (todo item 16a: 17 security updates pending)

## Marc's decisions (Nov 9, 2026)

Marc answered CANON-99 on Nov 9, 2026. These decisions are **Agreed** and override any rule above that says otherwise. Each conflict or question below that they settle is marked RESOLVED.

- **Decision 12:** **Retire old manual documents** as history: STORY_PRODUCTION_PROCESS v1.2, SCRIPT_VALIDATOR.md, STORY_GRADING_RUBRIC.md, STORY_BRIEF_TEMPLATE v2.2, NEDS scoring, character-attachment scoring, MASTER_RULES.md, DEPLOY.md, DEPLOYMENT-RUNBOOK.md, HAL_SESSION_START_PROTOCOL.md, MIX_SPEC.md and MIX_NOTE_PROTOCOL.md level tables, et_mix_assembly.py, ACQUISITION-RETENTION-001 Parts A, D, E. Decided: yes, all. (01 C1, 02 C4, Q5, Q6, 03 Q7, 07 C4, C6, 13 C9, 15 C3–C5) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 59:** **Merging and database changes.** Today, AGENTS.md says nothing merges and no database change happens without your word. Older rules (Oct 11 and Nov 2) let Claude merge low-risk pipeline PRs and apply add-only migrations. Decided: keep your word required for every merge and migration (today's rule). It's simple, and you've been giving it quickly. (15 C1, C2, Q1, Q2) — **Agreed** (Marc, Nov 9, 2026, CANON-99)
- **Decision 60:** **Security, urgent.** Rotate the three exposed secrets (Susan's API key and a Telegram bot token in repository documents, an email-service key in memory) and remove them from the documents. Put a login gate on the open /api/v2 production routes. (15 C5, C6) — **Agreed** (Marc, Nov 9, 2026, CANON-99)

## Conflicts found
- C1. **[RESOLVED by decision 59, Marc Nov 9, 2026]** Merging. AGENTS.md (canon, Nov 9): never merge without Marc's explicit word. Oct 11: Claude may merge low-risk PRs after reading the diff, except billing, auth or data deletion. Nov 2 and memory agent-fleet.md: "Claude merges pipeline PRs" once tests, build and mergeability pass. Recommendation: AGENTS.md binds the OpenClaw agents; Claude keeps the pipeline-PR exception with the billing/auth/data-deletion carve-out. Write this into AGENTS.md. Marc decides.
- C2. **[RESOLVED by decision 59, Marc Nov 9, 2026]** Database changes. AGENTS.md: no migration without Marc's OK. Oct 11: Claude may apply add-only migrations; destructive ones need Marc. Recommendation: same split as C1, written into AGENTS.md. Marc decides.
- C3. **[RESOLVED by decision 12, Marc Nov 9, 2026]** MASTER_RULES.md (Jan 18, 2026) says: host on Vercel, commit straight to main from the Mac ("git add . && git commit && git push"), all text white, credits model, news briefings. These clash with the PR flow, EC2 deploys, admin light background, and news being removed. Recommendation: MASTER_RULES.md becomes history. Marc decides.
- C4. **[RESOLVED by decision 12, Marc Nov 9, 2026]** DEPLOY.md (old Vercel setup, old price tiers and credit packs) and docs/DEPLOYMENT-RUNBOOK.md (wait 3 minutes for Vercel, drivetimetales.com) clash with rule 23–24 (Orion deploys to EC2, zero downtime). Recommendation: retire both; rule 25 becomes the runbook. Marc decides.
- C5. **[RESOLVED by decision 12, 60, Marc Nov 9, 2026]** docs/HAL_SESSION_START_PROTOCOL.md (April) gives Hal script-adjacent and publishing duties, points to retired ET_Story_Rules_v3, and its recovery steps open Telegram to everyone (allowFrom "*", dmPolicy open). It also contains a live-looking Telegram bot token in plain text. Recommendation: retire it, rotate that token. Marc decides.
- C6. **[RESOLVED by decision 60, Marc Nov 9, 2026]** Secrets in documents break rule 53: docs/SUSAN-MARKETING-API.md shows Susan's API key in plain text; HAL_SESSION_START_PROTOCOL.md shows a bot token; memory /areas/endless-tales-platform.md holds a Resend key. Recommendation: rotate all three and scrub them. Marc decides.
- C7. Memory /areas/endless-tales-platform.md (Aug): "all code written directly on Mac via heredoc; commit immediately." Nov 6: PRs on main only. Recommendation: Nov 6 wins. Marc decides.
- C8. Orion's model. Nov 5: Claude Sonnet, DeepSeek fallback. Nov 8: fleet on DeepSeek. Recommendation: Nov 8 wins (memory says it supersedes). Marc decides.
- C9. **[RESOLVED: fact checked or done, Nov 9, 2026; see CANON-99 Part 2]** scripts/ec2-deploy/README.md says run-next has no auth. middleware.ts now gates all /api/admin routes. Recommendation: fix the README note. Marc decides.
- C10. workspace-orion/governance/INCIDENT-RULE-001.md is owned by Orion (failure owners, 15-minute detection) with no sign Marc approved it. Recommendation: treat as Proposed until Marc approves. Marc decides.

## Open questions for Marc
- Q1. **[RESOLVED by decision 59, Marc Nov 9, 2026]** Who may merge what? Suggested answer: Claude merges pipeline/app PRs that pass tests and build, except billing, auth, data deletion and migrations that remove data; everything else needs your word.
- Q2. **[RESOLVED by decision 59, Marc Nov 9, 2026]** May Claude apply add-only database migrations without asking? Suggested answer: yes, and report them in Report 101.
- Q3. Does Codex still have a job? Suggested answer: no; Claude does that work now.
- Q4. Which agents exist today (Vega, Maya, Lex, Lyra, Holly, Scribe)? Suggested answer: keep a one-line roster in this doc; retire names with no work.
- Q5. Six PRs (#333–#338) were self-merged with no review on Oct 11–12. Revert, accept, or re-review? Suggested answer: Claude re-reviews them and reports.
- Q6. Does Orion run on the Mac or the EC2 server? (OpenClaw was found on EC2 on Nov 5.) Suggested answer: Mac only, until the CAC test passes.
- Q7. Is Vercel still used at all (crons dead since Oct 22)? Suggested answer: EC2 only for the app; Vercel only for preview test builds.
- Q8. How long should an agent try before it reports BLOCKED? Suggested answer: 30 minutes (rule 19).

## Enforcement status
- Rule 1 → AGENTS.md (document only).
- Rules 3, 5, 6 → not enforced in GitHub (no branch protection found); depends on agents.
- Rule 9 → partly: zero-downtime script keeps the old slot as restore point.
- Rules 21–22 → not enforced in code.
- Rule 24 → enforced: scripts/ec2-deploy/zero-downtime-deploy.sh.
- Rules 46–49 → scripts/watchdog/orion-liveness.sh, openclaw-watchdog.sh; alerting half was "SPEC (build pending)".
- Rule 50 → not built (credit monitor is a todo).
- Rule 51 → enforced: EC2 timer.
- Rule 55 → enforced: middleware.ts.
- Rule 56 → not enforced (open routes).
- Rules 53, 57, 58 → broken today (C6).

## Sources reviewed
- Repo: AGENTS.md; DEPLOY.md; docs/DEPLOYMENT-RUNBOOK.md; scripts/ec2-deploy/README.md, zero-downtime-deploy.sh; MASTER_RULES.md; FLAG_RULES.md; DONE_CHECKLIST.md; docs/HAL_SESSION_START_PROTOCOL.md; scripts/watchdog/ALERTING-WATCHDOG-SPEC.md; docs/PIPELINE-CANON.md; docs/Orders/ORION_WORK_ORDER_001_REVD.txt; workspace-orion/governance/INCIDENT-RULE-001.md; docs/atlas/ATLAS-GAP2-QC-20261011-1408.md; middleware.ts; app/api/v2/*; app/admin/CommandCenter.tsx; git log.
- Memory: agent-fleet.md, preferences (snapshot), preferences.md (project), pipeline-dispatch-recovery.md, /areas/endless-tales-platform.md, audio-pipeline.md (project copy).
- Past chats: "AWS EC2 setup for Endless Tales" (Oct 11); "Clearing CEO series flag" (Oct 28 deploys, "Claude merges pipeline PRs"); "Endless Tales financial obstacles" (Oct 16); "Apple App Store commission deals" (Nov 5, todo list, model outage); "Sunset episode 8 artifact" (Nov 7); "Cover story map pattern" (route security, Nov 4); "Meta campaign testing plan".
- Project docs: not opened directly (Projects tool not available to this auditor).

## Replaces (once approved)
- MASTER_RULES.md; DEPLOY.md; docs/DEPLOYMENT-RUNBOOK.md; docs/HAL_SESSION_START_PROTOCOL.md — history.
- AGENTS.md "Agent rules" and "Hard guardrails" sections (moved here; AGENTS.md keeps the canon index and points here).
- Memory agent-fleet.md role and merge lines; /areas/endless-tales-platform.md code and DB rules — history.
- workspace-orion/governance/INCIDENT-RULE-001.md — until Marc approves it.
