# CANON-08 — Quality Gates & Marc's Review
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: every automatic check from brief to publish, in order; what each checks; pass, fail and retry; how failures are classified and fixed; what Marc reviews and how. Does not cover: the writing rules a check enforces (writer canon), Belle wording (CANON-04), voice casting (CANON-05), sound and mix (sound/mixing canon), publishing mechanics and visibility (publishing canon), the player (docs/PLAYER-RULES.md).

## Where Marc decides

Every rule in this document that needs Marc. **[MARC DECIDES]** = Marc approves, chooses or gives his OK. **[MARC DOES]** = something only Marc does himself (tests on his phone, listens, enters a key). The same tag marks each rule below.

- **Rule 14 [MARC DECIDES]:** Premise gate (PREMISE-UNIQUENESS-001), before writing → the premise is not a near-copy of another story → sent back for a new premise variant, up…
- **Rule 17 [MARC DECIDES]:** validate_script → (a) story-card copy rules, (b) no duplicated passages (Gate 4), (c) AI validator. Failures go back to the writer, up to 2 times,…
- **Rule 35 [MARC DECIDES]:** Final audio always needs Marc's ear before going live, except in "direct" mode, which waives it fully. Nothing may assume Marc catches bad audio…
- **Rule 36 [MARC DECIDES]:** One publish switch, set only by Marc: "Review" (hold at ready for review) or "Direct" (go live without review). It is read at the moment a story…
- **Rule 39 [MARC DECIDES]:** Episode Correction Loop: Marc listens → approves or sends corrections → the corrected version comes to him as a link, not published → Marc…
- **Rule 41 [MARC DOES]:** Marc checks player changes on a real phone before they are accepted.
- **Rule 44 [MARC DECIDES]:** A Gemini final read of the whole series decides publish / fix (2 rounds) / hold, and Marc gets one message only on hold.
- **Still open:** 8 conflicts and 5 questions at the end of this document wait for Marc's decision (all listed in CANON-99).

## Rules

### A. Standing rules for every gate
1. Classify before fixing. Every stuck story is either (A) a pipeline defect: fix the code and add a guard so it can't recur, or (B) a story defect: send the story back for correction automatically and reprocess it automatically when fixed. Every block report says A or B. — **Agreed** (PIPELINE-CANON Rule 1, Oct 4; CLASSIFY-BEFORE-FIX LOOP, Oct 3)
2. No fix work starts until the A/B call is written down. — **Agreed** (Rule 1 Defaults)
3. Every check must be able to stop the run. A check never logs a warning and continues. New checks block by default. — **Agreed** (PIPELINE-CANON Rule 2, Oct 4)
4. A check may warn instead of block only if its own definition says, in writing: what it checks, why warning is safe, and which later blocking check catches the problem. — **Agreed** (Rule 2)
5. A failure record names the check, the field or line, and expected vs. actual, so it can be classified without re-investigating. — **Agreed** (Rule 2 Interactions)
6. Series run one episode at a time. A failure holds only the current episode. Passed episodes stay locked and are never re-checked. — **Agreed** (PIPELINE-CANON Rule 3)
7. The publish setting never weakens or skips a check. All checks run before the publish decision. — **Agreed** (Rule 2 and Rule 4)
8. A failed check command that couldn't run is "unverified", never a pass. — **Agreed** (PIPELINE-CANON Defaults, several rules)
9. Before any fix: a three-line root-cause note (the cause; every other place with the same cause, found by a search shown to Marc; why it won't come back). Without it, it is a patch. — **Agreed** (Marc PERMANENT RULE 1, memory /projects/…/preferences.md)
10. A fix counts as done only when the success rate moves on real jobs. A merged PR doesn't count. — **Agreed** (Marc PERMANENT RULE 2, memory preferences.md)
11. No job is dispatched before its fix PR is merged. — **Agreed** (Sequencing Rule, Marc Jul 22, PERMANENT, listed in PIPELINE-CANON)
12. Text fixes are made by the pipeline writer. No agent writes or edits scripts by hand. — **Agreed** (AGENTS.md Agent rules; PIPELINE-CANON STORY-CLARITY Defaults)

### B. The gates, in order (standalone story)
Each line: step name → what it checks → on failure.
13. Brief guard (ATL-BRIEF-GUARD-001) → a missing brief never wipes an existing script → job fails, story flagged needs_attention. — **In force (code)** run-next/route.ts
14. **[MARC DECIDES]** Premise gate (PREMISE-UNIQUENESS-001), before writing → the premise is not a near-copy of another story → sent back for a new premise variant, up to 2 tries, then parked. Override only by Marc's recorded word in the brief. A "similar cluster" only warns. — **In force (code)** run-next enforcePremiseGateBeforeStage2; lib/unifiedGateEngine.ts. Warn on clusters is **Agreed** (Marc ruling Jul 18, 09:47 EDT).
15. generate_script (writer).
16. validate_voice_conformance → the script matches the author's voice profile; skipped when the author has none. — **In force (code)**
17. **[MARC DECIDES]** validate_script → (a) story-card copy rules, (b) no duplicated passages (Gate 4), (c) AI validator. Failures go back to the writer, up to 2 times, then parked. Author-written stories are never sent back; they fail to Marc. — **In force (code)** run-next validateStandaloneScript (MAX_RETRIES 2)
18. validate_story_resolution → the story answers its main question. Failure → writer rewrite. — **In force (code)**
19. Story clarity gate (7 checks: three-sentence test, goal clear in about 480 words, cast limit, no unexplained insider words, every scene has a purpose, recap line in Episode 2+, easy to follow by ear) → before any voicing → any failure sends the script back to the writer with quoted lines; nothing is voiced. Fail-closed. Until built, a reviewer applies it by hand before voicing. — **Agreed** (STORY-CLARITY RULE, PIPELINE-CANON, Marc Nov 8). Not built.
20. voice_preflight, the last stop before spending → narrator voice exists, numbers written as words (Gate 5, back to writer up to 3 tries), runtime floor 12.5 minutes, Belle intro/outro rules, no stage directions in spoken lines, required fields. — **In force (code)** run-next ~4250–4420; generate-voices preflight. Runtime floor **Agreed** (Marc Oct 26).
21. generate_voices → Belle line check (may block), cast collision, stale-file purge. — **In force (code)**
22. generate_belle_assets → validate_belle_assets → validate_belle_quality → repair_belle_quality: failures are repaired automatically, up to 2 rounds, then parked. — **In force (code)** MAX_BELLE_BLOCKED_RETRIES = 2
23. generate_music → render_final_mix. Before the mix: every audio line matches a script line (ORPHAN-001), uses the current voice (VOICE-001), and matches its words (GARBLE-001, 40% error limit); near-silent lines block (LOUDNESS-001); Belle structure check (BELLE-001 to 006). Failures re-record or re-render, up to 2 times, then parked. — **In force (code)**; LOUDNESS-001 **Agreed** (Sep 7).
24. complete_story_package, then four checks in this order:
   - ARTIFACT-GATE-002: final mix file exists. Missing cover only warns (cover can be added later). — **In force (code)**
   - HOOK-GATE-001: seven checks (hook early, sound-cue count, genre, Belle, audio, cover, stale audio). Failure → writer hook rewrite, up to 2, then parked. — **In force (code)** lib/hookGate.ts. Hook within 15 spoken words is **Agreed** (memory /areas/story-pipeline.md; Marc ruling Jul 24, 2026). See Conflict C1.
   - RUNTIME-GATE-001: finished length within ±10% of the brief. Mismatch → parked for a person (no automatic rewrite). — **In force (code)** lib/runtimeGate.ts. See C2.
   - QUALITY-GATE-001: AI scores the story out of 30. 24 or more passes. Under 24 → automatic rewrite, up to 3 times, then parked. If the scorer itself fails, the story is parked, never passed. — **In force (code)** lib/storyQualityGate.ts. See C3.
25. ready_for_review gate → required fields present (including the eBook text), final_mix.mp3 really in storage, Belle position rules. Missing narrator credit is auto-fixed up to 2 times, then parked and Marc is told. — **In force (code)** verifyStandaloneReadyForReview; ATL-PIPE-012
26. Every story needs a complete eBook before review and before publish. — **Agreed** (EBOOK-COMPLETENESS RULE, Oct 4)
27. Publish checks (every publish path): publication hold off; Belle copy gate with no waiver; name-free Belle intro audio exists; episodes numbered 1..N with no gaps; all episodes of a release go live together. — **In force (code)** lib/directPublish.ts, lib/publicationBelleGate.ts, lib/personalization/publishGuard.ts. Numbering and all-together are **Agreed** (EPISODE-NUMBERING, EPISODE-ADDITION, Oct 4; Marc Nov 8).

### C. The gates, in order (series)
28. generate_episode_script → whole-series plan first (SERIES-OUTLINE-001); writer self-check (WRITER-SELF-CHECK-001) runs the same free checks the later steps run (format, numbers, runtime, Belle rules, cast list, stock AI phrases) and rewrites with the exact failures, at most 2 rewrites (3 drafts), then fails closed. At most 2 failed writer runs per episode before a person resets it (WRITER-SPEND-CAP-001). Every episode shares a cast with Episode 1 (SERIES-CAST-CONTINUITY-001). — **In force (code)**. Whole-series plan and continuity check are **Agreed** (Marc Oct 29, permanent, memory story-pipeline.md).
29. score_validate_package → earlier episodes unchanged since later ones were written (continuity pin); all episodes read together for contradictions (SERIES-CONTINUITY-001); facts checked against cast lists (SERIES-FACTS-001); package validator. Failures send the episode back for rewrite. A Gemini read of the whole series is stored as a report and does not block. — **In force (code)** scoreValidateSeriesPackage
30. series_voice_preflight → same as rule 20, per episode. — **In force (code)**
31. series_generate_voices → series_generate_belle_assets (Belle retries up to 3) → series_generate_music → series_render_final_mix (same pre-mix checks as rule 23) → complete_story_package → ready_for_review for the whole series → one publish decision for the whole series. — **In force (code)**
32. Series must get the same final checks as standalones (hook, runtime, quality) per episode before review. — **Proposed** (today HOOK-GATE-001, RUNTIME-GATE-001 and QUALITY-GATE-001 run for standalones only; see C4)

### D. When a check fails
33. Story defect → automatic send-back to the writer or a metadata fix, then automatic reprocessing. No standing human step. — **Agreed** (Rule 1)
34. Each automatic fix has a cap (usually 2, numbers 3, quality 3). After the cap, the story is flagged needs_attention and the job stops. — **In force (code)** lib/unifiedGateEngine.ts
35. **[MARC DECIDES]** Final audio always needs Marc's ear before going live, except in "direct" mode, which waives it fully. Nothing may assume Marc catches bad audio after a direct publish. — **Agreed** (Rule 1 and Rule 4 option A, Oct 4, 10:34–10:35 EDT)

### E. Marc's review
36. **[MARC DECIDES]** One publish switch, set only by Marc: "Review" (hold at ready for review) or "Direct" (go live without review). It is read at the moment a story is ready to publish and stays until Marc changes it. — **Agreed** (PIPELINE-CANON Rule 4; PLAYER-RULES "What listeners can see" 4, Nov 8)
37. Marc's current choice: Direct. — **Agreed** (Rule 4 initial value; memory story-pipeline.md Oct 27). See Q1.
38. A story waiting for review is hidden from listeners and shows in the admin Review tab. — **In force (code)** ATL-PIPE-014; Marc's M-1 rule (no manual visibility fixes).
39. **[MARC DECIDES]** Episode Correction Loop: Marc listens → approves or sends corrections → the corrected version comes to him as a link, not published → Marc approves → only then it replaces or publishes. — **Agreed** (Marc Aug 21, PERMANENT, PIPELINE-CANON)
40. A series is reviewed and published as one unit. No per-episode review holds. — **Agreed** (Rule 3, Rule 4)
41. **[MARC DOES]** Marc checks player changes on a real phone before they are accepted. — **Agreed** (PLAYER-RULES Design 5)
42. Status reports count only what was checked directly (database row, file line, command output). Relayed claims are "unverified". — **Agreed** (memory pipeline-dispatch-recovery.md, Oct 16; profile: "verified results over reported ones")
43. Marc wants production to run without him; he steps in when he chooses. — **Agreed** (Marc Nov 7, memory story-pipeline.md)
44. **[MARC DECIDES]** A Gemini final read of the whole series decides publish / fix (2 rounds) / hold, and Marc gets one message only on hold. — **Proposed** (Marc asked for it Nov 7, but the Story Production Spec is a draft he has not approved to build)

## Conflicts found
- C1. Hook deadline. Canon says the hook lands within 15 spoken words (memory /areas/story-pipeline.md; Marc ruling Jul 24 "start at canon"; HOOK-001 note). lib/hookGate.ts passes up to 30 words (HOOK_PASS_WORD_LIMIT = 30), and its "warn" band is empty. Recommendation: 15 words, blocking. Marc decides.
- C2. Length tolerance. LENGTH-002 (Canon Registry, Aug 28): each episode within ±20% of the commissioned length. RUNTIME-GATE-001 (code, Oct 11 decision): ±10%. Writer self-check also uses ±10%. Recommendation: ±10% (newer, and the floor is 12.5 min). Marc decides.
- C3. Quality score bar. June canon (memory /areas/story-pipeline.md): "30-point rubric gates publish at 22+, 26 gold". Code: 24 or more passes. Recommendation: 24 (newer code, stricter). Marc decides.
- C4. Series skip three final checks. HOOK-GATE-001, RUNTIME-GATE-001 and QUALITY-GATE-001 run only for standalones; series episodes go straight to review or publish. Rule 2 says every check must be able to stop the run. Recommendation: run them per episode (rule 32). Marc decides.
- C5. Warn-only checks without written justification (Rule 2 requires one): hook-gate genre check, garble stop-line when its report is missing (continues), runtime gate when length can't be measured (continues), Belle structure "inconclusive" results, Gemini series read (report only). Covered: missing cover (COVER-PIPELINE-DECOUPLE-001), premise clusters (Marc Jul 18). Recommendation: each one gets its written justification or becomes blocking.
- C6. Who hears about parked stories. Quality-gate exhaustion: "do NOT notify Marc" (code). Ready-for-review exhaustion: notify Marc (GAP2-NOTIFY). Nov 7: Marc wants to be left out. Recommendation: one daily list of parked stories, nothing else. Marc decides.
- C7. Hand-written fixes. Rule 1 and AGENTS.md: the pipeline writer makes text fixes. In practice Claude wrote replacement Belle outros for Orion → Hal to paste (Rerouted EP2–3, Nov 7). Recommendation: always route through the writer with the failure quoted.
- C8. Where the AI read goes. Story-clarity rule (Nov 8): before voicing, blocking. Production Spec draft (Nov 7): Gemini read before publishing decides publish. Claude advised on Nov 7 that the read should come before voicing. Recommendation: clarity gate before voicing (approved); final Gemini read only after Marc approves the spec.

## Open questions for Marc
- Q1. Is the publish switch on Direct right now, and is the global publication hold on or off? It was turned back on Oct 23–24 during a test (chat "Clearing CEO series flag"). Suggested answer: report both values in every status report.
- Q2. Who runs the story clarity check by hand until the gate is built? Suggested answer: a fresh AI reviewer (not the writer), output stored with the episode.
- Q3. After a story is parked (needs_attention), who clears it and how often? Suggested answer: Orion reviews the parked list daily, classifies A/B, and only asks Marc when a rule is unclear.
- Q4. In "Review" mode, how does Marc get the play link: admin Review tab, Telegram, or both? Suggested answer: one Telegram message per series with one play link per episode, plus the Review tab.
- Q5. Does the Belle structure check (BELLE-004 to 006) stay at assembly, or move to the writer self-check so it fails before spend? Suggested answer: writer self-check and voice preflight, both using the same function.

## Enforcement status
- Rules 1–2, 33 → partly: unifiedGateEngine.ts routes known failure kinds automatically; reports' A/B labels not checked.
- Rule 3–5 → partly (see C5).
- Rule 6, 40 → partly: one production job per series; per-episode locking not fully built (Rule 3 "implementation is a separate track").
- Rules 7, 8, 13–18, 20–25, 27–31, 34 → enforced in code at the paths named.
- Rule 19 → not built (manual).
- Rule 26 → enforced at ready_for_review (prose_text required); publish side unverified.
- Rules 9–12, 39, 41–43 → working rules, not code.
- Rule 32, 44 → not built.
- Rules 35–37 → lib/directPublish.ts (publish_mode, PUBLICATION-HOLD-001).
- Rule 38 → run-next ATL-PIPE-014.

## Sources reviewed
- Repo /tmp/dtt: app/api/admin/production-jobs/run-next/route.ts (step constants lines 223–252; gates at ~3635, ~3926, ~4250–4420, ~5440–5545, ~6030–6130, ~6810–6990, ~7628–8010, ~8190–8270, ~13540–14790), lib/hookGate.ts, lib/runtimeGate.ts, lib/storyQualityGate.ts, lib/scriptReadiness.ts, lib/scriptRuntimeEstimate.ts, lib/unifiedGateEngine.ts, lib/publicationBelleGate.ts, lib/directPublish.ts, lib/numeralPreTtsScan.ts, docs/PIPELINE-CANON.md, docs/PLAYER-RULES.md, AGENTS.md, Bible/CANON_REGISTRY_STORY_RULES.md, git log (only 18 commits in this clone; few rule IDs).
- Memory: /areas/story-pipeline.md, /projects/…/areas/story-pipeline.md, /projects/…/preferences.md, /projects/…/areas/pipeline-dispatch-recovery.md, /projects/…/areas/player-rules.md, /projects/…/areas/hook-series.md.
- Past chats: "Clearing CEO series flag" (writer self-check, publication hold), "Cover story map pattern" (Nov 7 production spec draft, Gemini final read), "AWS EC2 setup for Endless Tales" (publish-mode review decisions), "Gemini sound replacement loop".
- NOT reviewed: Claude project docs (claude/story-clarity-gate.md, claude/stabilization-week-plan.md, claude/autonomy-plan-2026-11-06.md, claude/recovery-findings.md). The Projects tool was not available to this auditor.

## Replaces (once approved)
- The gate descriptions scattered in code comments become references to this doc (code stays the enforcement).
- Gate sections of memory "/areas/story-pipeline.md" (June canon list) as history.
- docs/SCRIPT_VALIDATOR and DONE_CHECKLIST.md gate lists, where they disagree (not fully audited).
- PIPELINE-CANON Rules 1–2 and the STORY-CLARITY RULE stay in PIPELINE-CANON; this doc points to them.
