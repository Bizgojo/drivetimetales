# Pipeline Finish-Line Roadmap

**Goal:** Input a story premise, genre, episode count, and length → get back a finished, PUBLISHED series with correct voices, no duplicated phrases, no artifacts, and emotionally-timed music — fully autonomous from premise to publish, no human ear required at any point.

---

## CURRENT EXECUTION ORDER

*(Updated Aug 30, 2026 — phase NUMBERS never change; this list tracks only the order phases are actually being worked in. If this list and a phase's own stated prerequisites ever disagree, the prerequisites win — this list is a sequencing convenience, not a new source of truth.)*

1. Phase 0 — complete
2. Phase 1 — in process
3. Phase 3 — needs revision
4. Phase 4 — in process
5. Phase 7 — moved up (its own stated prerequisite is Phase 3 + 4, nothing else)
6. Phase 5
7. Phase 6
8. Phase 8
9. Phase 9
10. Phase 10
11. Phase 11
12. Phase 2 — moved here, paused (see phase entry below for status)
13. Phase 12
14. Phase 13
15. Phase 14

---

## CANON REGISTRY

*(Aug 29, 2026, NEW — supersedes individual canon blocks below)*

A permanent, standalone Canon Registry now exists as the single source of truth for all story/audio/product/agent rules:

**https://docs.google.com/document/d/1UkzkrDQjSwjZf0LOTEHKmFmgRswxg9XotUbCUZpmQmI**

72 rules across categories including STING, MUSIC, VOICE, GARBLE, ORPHAN, BELLE, CONTENT, LANGUAGE, PROCESS, CANON, PLAYER, AUTH, QUEUE, TRIAL, NAMES, and one category per agent (ORION, ATLAS, HAL, SUSAN, BART, LEX, MAYA, VEGA) defining role and authority.

Per CANON-001 in that registry, it takes precedence over any conflicting rule recorded elsewhere, including the individual CANON blocks embedded below (STING-001, MUSICBED-001, VOICE-001, GARBLE-001, ORPHAN-001). Those blocks are left in place since they contain useful incident history, but the canon registry is the authoritative current text for these rules going forward.

**Not yet actioned:** identifying and removing true duplicates between this roadmap and the registry.

---

## CRITICAL FINDING (Aug 29, 2026)

The canon registry's rules are NOT wired into any actual pipeline yet. Writing a rule down does not make Hal, the render pipeline, or any agent check it automatically.

Specifically confirmed: Hal has TWO distinct pathways —

1. **Manual session Hal** — which wrote all of Sunset and is proven good, loads the full canonical story bible and STAGE2 prompt per HAL_SESSION_START_PROTOCOL.md
2. **The automated /api/v2/generate-script pathway** — the one that would actually have to run unattended for this roadmap's stated goal to be real — uses a thin, partial inline prompt with near-zero canon awareness, and does not call loadActiveExcellenceLessons()

This is a different, more fundamental gap than anything previously tracked in Phase 4/8 below, since it means the goal's core promise (premise in, good story out, unattended) has never had its script-generation half proven at all, independent of the audio-pipeline problems tracked below.

**CANON ENFORCEMENT — PHASE 2 dispatched to Orion (Aug 29, 2026):** port ET_Story_Rules_v3_CANONICAL.md, STAGE2_SCRIPT_PROMPT.md, canon registry rule references, and loadActiveExcellenceLessons() into the automated path's prompt construction. Branch only, no merge, no real story test until Marc reviews the diff. Awaiting Orion's report.

---

## Intro/Outro Content Requirement

*(Added Aug 26, 2026)*

Every episode's intro must include a sting, personalization, and setup, delivered by Belle. Every episode's outro must have Belle recap the episode and tease the next one — EXCEPT the final episode of a series, where Belle recaps the solution/ending instead, since there is no next episode to tease.

This requires the system to know an episode's position within its series (ties to Phase 8's facts table).

**Open question, not yet resolved:** existing canon elsewhere states a standard episode's Belle intro is "ONE line" — shorter than the multi-sentence personalized welcome reserved for a listener's very first episode. Decide whether this new requirement replaces that rule for every episode, or whether personalization + setup need to be compressed into that single line.

---

## CANON — STING-001

*(Marc ruling, Aug 28, 2026)*

The sting plays exactly once per episode — at the very start of the intro, before Belle's first line. It never appears anywhere else in the episode: not before the outro, not mid-story. Separated into its own atomic rule specifically so it can be tested independently of the music bed, after EP10 v4 dropped both due to them being conflated in one undifferentiated build step.

---

## CANON — MUSICBED-001

*(Marc ruling, Aug 28, 2026, REVISED same day)*

Music bed is silent during the intro. The instant the intro ends and the story body begins, the music bed enters LOUD — signals the start of the story. Shortly after, it ducks down under dialogue for the sustained story-body level (target 13%, verified existing code implements ~12% — close enough, not requiring a code change). The instant the story body ends and the outro begins, the music bed goes LOUD again — signals the end of the story. It then ducks to 6% under the outro (under Belle's voice) — REVISED from initial 13% outro-duck spec after Marc reviewed the real gap between spec (13%) and existing code (~2%) and set 6% as the actual target, neither extreme. Immediately after the outro/Belle finishes speaking, the music bed begins fading to 0 over exactly 3 seconds.

---

## CANON — VOICE-001

*(Marc ruling, Aug 28, 2026)*

Every character's spoken segment must use the exact voice_id currently assigned to that character in character_voice_assignments (or series_character_roster for a series). If a character is ever recast to a new voice, EVERY existing segment for that character must reflect the new voice — no segment may play in a stale or prior voice, regardless of when it was originally rendered. Directly motivated by EP10's segment_0089, which played Hector in his old voice after a recast to tCH56KaAwBhcxel3EYcI, because that one segment was never regenerated.

---

## CANON — GARBLE-001

*(Marc ruling, Aug 28, 2026, reformatted from existing Phase 4 item 1 spec — no change in substance)*

Every segment's actual rendered audio must match its script line. A segment fails this canon if Whisper-transcribing the real audio and diffing against the DB script line produces WER > 40%. This has already been built and merged (garble-detection-gate.js, PR #170) — reformatting here only for consistency with the atomic-canon pattern below.

---

## CANON — ORPHAN-001

*(Marc ruling, Aug 28, 2026, reformatted from existing Phase 4 item 5 spec — no change in substance)*

Every segment file present in an episode's storage folder must correspond to a real line in the current script. A segment at a script position beyond the current script length, or left over from a prior script revision, is an orphan and must be excluded from the final mix. This has already been built and merged (orphan-detection.js, PR #169), field-tested successfully on EP10 (3 candidates flagged, all 3 confirmed correct by Marc's ear) — reformatting here only for consistency with the atomic-canon pattern below.

---

## STANDING RULE — CANON-BEFORE-BUILD

*(Marc ruling, Aug 28, 2026)*

Before any new Phase 4 detector (or any future audio-structure check) is dispatched to be built, its canon must be written first — as its own atomic rule, on its own, not bundled into prose describing a different concern. This is deliberately NOT a mandate to write canon for every conceivable concern today. Concerns without a canon yet (loudness, LLM judgment, publish-step behavior, etc.) stay undocumented until they are actually about to be built — writing specs speculatively for things not yet causing problems is wasted effort. But writing precise canon right before building is cheap and is exactly what would have prevented EP10 v4's sting/music failure, where the underlying requirement existed only as vague, bundled prose no detector could be built against.

---

## STANDING RULE — SINGLE VERIFIED ASSEMBLY PATH, TOP PRIORITY

*(Marc ruling, Aug 28, 2026)*

Rules and canon documents describing what a build SHOULD do are not sufficient on their own — they depend on someone remembering to follow them, which fails under session saturation, pipeline drift, or simple human forgetting. The permanent fix is architectural, not procedural: one canonical shared function (assembleAndVerifyFinalMix(), see Phase 4 item 13) becomes the ONLY code path any pipeline is allowed to use to produce a finished episode mix. Verification checks (orphan, garble, and voice-mapping once built) are called INSIDE that function, structurally unskippable — the code path to produce an output file must not exist until they pass, not merely "should" run first. A fix proven on one pipeline automatically applies to all pipelines, because there is only one pipeline for this step going forward. This does not replace the individual canon rules (STING-001, MUSICBED-001, VOICE-001, GARBLE-001, ORPHAN-001) — it's the mechanism that actually enforces all of them, permanently, rather than relying on an agent remembering to check each one correctly every time.

**STATUS UPDATE, VERIFIED (Aug 29, 2026):** assembleAndVerifyFinalMix.ts was reported built in a prior session, but direct verification (raw GitHub content checks, both by branch name and by commit hash, cross-checked against a known-good commit as a control) confirmed it does NOT exist on GitHub — the branch and commit describing it could not be located anywhere in the actual repository. This item remains genuinely [NOT STARTED] at the architecture level, despite earlier reports to the contrary. Any future report that this module is complete must be verified the same way before being trusted.

---

## STANDING RULE — THREE PIPELINES

*(Aug 27, 2026, EXPANDED Aug 28, 2026)*

This project has THREE separate code paths that produce or modify audio:

1. **core.ts** — production/fresh-generation pipeline
2. **render-correction-mix.js** — correction pipeline for already-generated episodes, rebuilds from existing storage segments only, no EL calls
3. **recast-character.js** — targeted single-character voice recast; re-renders ALL of that character's segments via ElevenLabs every run (not just broken ones), has NO separate music-bed logic at all (only concatenates intro+segments+outro+silence), and — critically — WRITES stories.audio_url TO PRODUCTION IMMEDIATELY upon completing its mix rebuild, with no pause for human approval, unlike the other two paths

Confirmed twice on EP8 alone that a fix landing in one path silently does NOT apply to another. Whenever ANY fix is made to audio assembly, mixing, voice handling, or structure, it must be explicitly confirmed which of the THREE pipelines it needs to apply to — and verified as actually present in each relevant one, not assumed. Before using recast-character.js for ANY targeted fix, confirm whether its auto-publish-on-completion behavior is acceptable for that specific case, or whether a --dry-run + manual review step is required first.

---

## STANDING RULE — MERGE SCOPE

*(Marc ruling, Aug 28, 2026)*

Merge approval authorizes ONLY the branch merge. It does NOT authorize any resulting database write, publish action, or config change — even when it seems like the obvious next step. Each of those requires its own separate explicit word, every time.

---

## DOCUMENT FORMAT — LOCKED

*(Aug 28, 2026, Marc requirement)*

Every item uses exactly one status pill, placed immediately after the bullet dash: [NOT STARTED], [IN PROCESS], [COMPLETED], or [NEEDS REVISION]. This is a fixed, permanent format — any Claude session editing this document, regardless of which chat, must preserve this exact four-state system and must NOT revert to checkboxes or invent other labels. When a status changes, update the pill in place. [COMPLETED] items keep their "Completed" note underneath describing exactly what was done and when. [NEEDS REVISION] means real work was done but a defect or blocker was found requiring a different approach — not the same as [NOT STARTED].

---

## LESSON LOGGED — Reporting Hygiene (Aug 29, 2026)

Orion sent the identical "Bell Arm2 activation" report eight times, every 2 hours overnight, with the same numbers reworded each time, without noting that nothing had actually changed. Instructed to report deltas only going forward, not repeat unchanged data on a schedule. Separately, Orion's PM and AM briefs on the same day gave two different, contradicting answers (6% vs 12%) for the same code value in the not-yet-verified assembleAndVerifyFinalMix.ts module — a contradiction that turned out to be moot once the module itself was confirmed not to exist (see STATUS UPDATE above).

---

## LESSON LOGGED — Session Saturation + Untracked Script Gap (Aug 28, 2026)

Orion produced THREE different, mutually contradicting "confirmed" and "definitive" answers in a row for where v3's sting/music came from, while its own session repeatedly reported saturation. The second answer included specific-sounding fabricated details (exact line numbers, exact code percentages) that were entirely wrong per the third. The third answer was ultimately correct — but only confirmed as correct after Marc personally verified via his own terminal (ls -la, then a direct grep of the actual file), not by trusting Orion's session output. Reinforces the standing rule at maximum strength: specificity and confidence in a report are not evidence of accuracy, especially from a session that has explicitly reported tool failures.

Separately, a real NEW gap surfaced: v3 — real production audio Marc approved — was built by ep10_v3_hector_recast.js, an untracked, never-committed script sitting at the repo root since Aug 25. This is invisible to any GitHub-based verification, unbacked-up, and unreviewable. Retroactive commit recommended but not yet actioned.

---

## LESSON LOGGED — EP10 v4 Sting/Music Mystery (Aug 28, 2026)

EP10 v4 dropped BOTH the sting and the music bed, despite v3 (a different build) having had both correctly. Root cause not yet found — neither script reviewed so far (recast-character.js, the bespoke ep10-v4-concat.js) shows any sting-insertion or music-layering logic at all; both just concatenate intro+segments+outro. Where v3's sting and music actually came from is an open mystery, not yet resolved. Marc's diagnosis: bundling multiple audio-structure concerns (sting + music bed) into one undifferentiated "assemble the episode" task, with no separate automated check per concern, is why these keep breaking together and going unnoticed until his ear catches it. Response: split into atomic, independently-testable canon rules (STING-001, MUSICBED-001 above) — each needs its own narrow detector, same pattern as garble-detection-gate.

---

## LESSON LOGGED — Phase 4/EP10 recast-character.js (Aug 28, 2026)

Orion proposed a rebuild command using recast-character.js for EP10's segment_0089 orphan fix. Direct code inspection found two serious problems: (1) recast-character.js writes stories.audio_url to PRODUCTION immediately upon completing its mix rebuild, with no pause for Marc's approval; (2) it re-renders ALL of a character's segments via ElevenLabs every run, not just the broken one — wasteful and risks already-approved audio. Also surfaced: recast-character.js is a genuinely THIRD pipeline with its own distinct behavior, not covered by the existing dual-pipeline rule — rule expanded to cover all three paths.

---

## LESSON LOGGED — GitHub Rate Limit False Negatives (Aug 28–29, 2026)

Claude's own first-pass GitHub verification returned a false "commit not found" result — caused by hitting GitHub's unauthenticated API rate limit, misread as an actual absence. Corrected by checking raw file content on main instead. Reinforces: a failed or empty verification result must itself be checked for a mundane cause (rate limit, wrong endpoint) before being treated as evidence of a problem.

RECURRED (Aug 29, 2026): same false-negative pattern hit again during verification of assembleAndVerifyFinalMix.ts's GitHub presence — this time correctly identified as a rate-limit artifact by cross-checking against a known-good commit, before concluding the module was genuinely absent (that conclusion held even after ruling out the rate-limit explanation).

---

## Phase 0 — Governance Decisions (Do This First)

**STATUS: ✅ COMPLETE (Aug 27, 2026)**

- [COMPLETED] **Hal Focus Directive review.** Est. 1–2 hrs
  Completed (Aug 27, 2026): Directive stays in place and lifts ONLY once all 26 Sunset episodes are fully corrected and ear-approved by Marc. Not tied to Phase 9's stress-test — Sunset completion alone is the trigger.

- [COMPLETED] **Orion publish-authority policy.** Est. 2–4 hrs
  Completed (Aug 27, 2026): Orion gets NO autonomous publish authority until BOTH Phase 4 (Vega's correctness gates) AND Phase 10 (the creative judge) are built AND PROVEN — not merely built. Until then, every publish still requires Marc's explicit word.

- [COMPLETED] **Susan/Vega/Maya staffing decision.** Est. 1–2 hrs
  Completed (Aug 27, 2026): DECIDED Option 1 — staff all three as real, distinct active roles, not folded into Orion/Atlas/Hal. Triggers/cadence set: Vega starts immediately alongside Phase 4's build. Maya starts immediately on Phase 2's build side only (autonomous operation gated on Hal directive lifting + Phase 11's Lex check). Susan starts immediately, not phase-gated (standing daily Bell campaign-health check).

**Phase 0 total: 4–8 hrs — ACTUAL: same day**

---

## Phase 1 — Player Reliability

*(Every downstream phase that involves listening depends on the player being trustworthy)*

- [IN PROCESS] **Confirm the two P0 fixes shipped Aug 26 hold up under real-world use.** Est. 2–4 hrs
  (Aug 27: monitoring window starts now.)

- [COMPLETED] **Install server-side error visibility (Sentry).** Est. 3–5 hrs
  Completed: PR #168 merged (commit b10fee6), org/project "endless-tales." CORRECTION (Aug 27, later): earlier note claiming Vercel env vars were already set was WRONG — verified false via direct Vercel dashboard check. DSN was in .env.local only until this session; Vercel env vars (NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, all scoped Production) were actually added and a fresh Production deploy of b10fee6 completed today, confirmed Ready via Vercel dashboard screenshot. Sentry is now genuinely live in production for the first time.

- [COMPLETED] **Verify it captures a real or simulated player failure end-to-end.** Est. 2–3 hrs
  COMPLETE (Aug 27, 2026): Atlas ran a full simulation triggering all three P0 conditions. All confirmed delivered with real SDK event IDs. Marc independently confirmed 4 distinct issues visible in the live Sentry dashboard, tagged simulated:true / test_source:atlas-verification-2026-08-27.

  REAL-TRAFFIC MONITORING WINDOW (starts Aug 27, ~3:21 PM): recommend checking Sentry Issues for P0-001a/b and P0-002 in 48–72 hrs.

**Phase 1 total: 7–12 hrs — 2 of 3 items complete, 1 in monitoring window**

---

## Phase 2 — Autonomous Story Selection & Scheduling (Maya)

*(Decides WHAT to make. Human sets cadence once — e.g. "one series a day" — until changed. Can be BUILT alongside Phases 3–9; should not be ACTIVATED until Phase 0's Hal directive is lifted and Phase 11's Lex check exists.)*

**MOVED + PAUSED (Aug 30, 2026, Marc ruling):** sequenced after Phase 11 in execution order — Phase 2's own stated prerequisites already required this, this just reflects it in the actual work order. Build work on this phase is deliberately paused, not just deprioritized — no new Maya build work proceeds until this phase is reached in sequence. Phase number stays 2, permanently.

- [IN PROCESS] Build internal listener-data research. Est. 6–10 hrs
  (Aug 27: Maya has begun DB audit of go_listen_events, users, stories tables — in progress, not yet verified complete.)
  **PAUSED (Aug 30, 2026):** work on this item is on hold along with the rest of Phase 2 — resume when Phase 2 is reached in the execution order.

- [NOT STARTED] Build external trend-sourcing (TikTok/X/Facebook/Instagram). Est. 8–14 hrs

- [NOT STARTED] Build genre/length/subject decision logic. Est. 4–8 hrs

- [NOT STARTED] Build prompt generation for Hal. Est. 3–5 hrs

- [NOT STARTED] Build schedule-adherence mechanism. Est. 2–4 hrs

- [NOT STARTED] Human-override/suggestion mechanism. Est. 6–10 hrs
  Open decision: does a suggestion REPLACE the next scheduled slot, or ADD an extra one on top? Recommend "replaces" as default.

**Phase 2 total: 29–51 hrs**

---

## Phase 3 — Finish the Sunset Correction Work In Progress

*(Currently active)*

- [COMPLETED] **EP8 — APPROVED (Aug 27, 2026).** Est. 3–8 hrs — ACTUAL: ~2 days, v6 through v14
  Completed: After 8+ versions and multiple false "verified fixed" reports, EP8 is genuinely done. Root causes found and fixed, in order: (1) stale local /tmp cache in the original correction script silently serving old files; (2) wrong intro/outro music format (old 4-sting IO pattern instead of the canon crescendo/fade); (3) stories.audio_url never updated across any version — NOW CLOSED (Aug 28, 2026): audio_url updated in production for both EP8 and EP9; (4) orphaned old-voice segments left behind by a script edit that shifted line positions; (5) a genuinely corrupted ElevenLabs render on segment_0103. Final build v14 verified independently before Marc's listen. Marc confirmed by ear: artifact gone, approved.

- [COMPLETED] **EP9 — APPROVED (Aug 27, 2026).** Est. 3–6 hrs — ACTUAL: same day, v6 through v9
  Completed: v9 delivered a real, story-specific background_music.mp3 (previously EP9 had zero music files in storage and was silently falling back to the shared intro_outro_music.mp3). File landing verified directly via Supabase. Marc confirmed by ear: music bed okay, approved.

- [COMPLETED] **Finish the stale-segment sweep.** Est. 3–6 hrs
  Completed (Aug 27, 2026): orphan-detection.js built and wired into recast-character.js — commit f6d0dc9c. Confirmed working correctly on EP9's dry run: Mechanism B orphans auto-excluded with no ambiguity, Mechanism A candidates correctly halted for human confirmation.

- [COMPLETED] **Marc listens and approves both with real confidence.** Est. 1–2 hrs
  Completed (Aug 27, 2026): EP8 and EP9 both listened to and approved by Marc's ear.

- [NEEDS REVISION] **EP10.**
  v3 listened to by Marc: no sting issue, background music bed good, BUT confirmed duplicate-voice defect — Hector plays in both old and new (tCH56KaAwBhcxel3EYcI) voice. Root cause found: v3 built Aug 25, two days before orphan-detection.js existed (Aug 27) — this build predates the fix entirely.

  **MYSTERY RESOLVED (Aug 28, 2026):** v3 was built by an untracked, never-committed one-off script (ep10_v3_hector_recast.js, Aug 25, root of repo). The "sting" Marc heard in v3 was baked into outro_corrected.mp3 itself — a real STING-001 violation.

  **v5 STATUS (Aug 28–30, 2026):** final_mix_ep10_v5.mp3 produced using render-correction-mix.js segments mode with --exclude segment_0089. Duration: 1025.35s (23.5MB). HTTP 200 confirmed. segment_0089 exclusion VERIFIED (Aug 30) — audio position clip confirms clean 0088→0090 transition; segment_0089 is absent from the v5 mix. All 8 actual Hector segments (0027, 0030, 0032, 0033, 0042, 0044, 0088, 0090) confirmed in correct new voice by Marc's ear.

  v5 STILL NOT APPROVED: Marc heard two Hector voices. Diagnosis complete Aug 30: 0089 is NOT in the mix, all 8 Hector segments are correct. Source of second voice unresolved — candidates are segments 0026 (NARRATOR, N-1 of Hector pos 27) and 0029 (JOINER, N-1 of Hector pos 30), which may create a voice-collision percept. PRE-LISTEN-SCAN-001 scan failing — staging URL not yet delivered to Marc. Oldest open blocker in the entire roadmap.

**Phase 3 total: 10–22 hrs (EP10 resolution time now several days beyond original estimate)**

---

## Phase 4 — Build the Missing Quality Checks (Vega)

**Owner: Vega (Audio Quality Manager)** — activated Aug 27, 2026. Distinct from Phase 10's creative judge; Vega owns correctness AND ongoing post-publish curation.

*Build order matters here (decided Aug 27, 2026): Artifact/garble detection is built FIRST.*

- [COMPLETED] **1st — Artifact/garble detection, raised to hard-gate confidence.** Est. 8–14 hrs
  MERGED (Aug 28, 2026): garble-detection-gate.js built on branch feat/garble-detection-gate, merged to main as PR #170, commit 1f0bf8cd. WER > 40% = hard fail; WER > 20% = warn only. ACCEPTANCE TEST RESULTS: synthetic validation using known-corrupted text: WER 0.952 = correctly FAILED.
  KNOWN TECH DEBT: parser logic is inlined in the gate script, duplicated from lib/scriptLineIndex.ts — must be manually kept in sync.
  OPEN QUESTION: did the synthetic test run corrupted AUDIO through real Whisper transcription, or just compute WER between two text strings directly?

- [NOT STARTED] **2nd — Check 3 — voice mapping (hard fail), tied to canon VOICE-001.** Est. 6–12 hrs
  NOTE (Aug 30, 2026): sfx-manifest.json approach is DEAD — voice_segments field was never populated (0% coverage) by any pipeline run. Architecture needs rethink before building.

- [NOT STARTED] **3rd — Check 1 Layer 2 — automated LLM judgment (not Hal-routing).** Est. 6–10 hrs

- [NOT STARTED] **4th — Loudness check.** Est. 2–4 hrs

- [COMPLETED] **5th — Orphaned-segment sweep wired in as mandatory gate.** Est. 1–3 hrs
  COMPLETE (Aug 28, 2026): orphan-detection.js merged to main via PR #169, commit 94691c4b.
  NOTE: confirmed this detector is wired into recast-character.js only — NOT into render-correction-mix.js. This gap directly caused v5's persisting duplicate-voice defect and is the reason item 13 below was elevated to top priority.

- [NOT STARTED] **6th — Automated publish step, after Phase 0's Orion policy.** Est. 5–8 hrs

- [NOT STARTED] **7th — Post-publish performance monitoring (Vega).** Est. 9–26 hrs
  RESOLVED (Aug 29, 2026): a review system DOES exist — "reviews" table, 15 real rows. Two other empty, similarly-named tables ("story_reviews", "ai_review_analysis") also exist — which is authoritative still needs confirming. Thresholds for "too many bad reviews" / "too high abandonment" still not set.

- [NOT STARTED] **8th — Intro/outro content-structure check.** Est. 4–7 hrs
  Note (Aug 29, 2026): the canon registry now has detailed, atomic versions of this requirement (BELLE-001 through BELLE-008) — use those as the specification when this item is built.

- [NOT STARTED] **9th — Pipeline fix verification, THREE paths.** Est. 3–5 hrs
  Verify any fix meant to apply across pipelines is actually present in ALL relevant ones — core.ts, render-correction-mix.js, AND recast-character.js.

- [NOT STARTED] **10th — Pipeline currency gate.** Est. TBD
  Hard pre-render block that verifies the local checkout is at the current main-branch commit for ALL mandatory pipeline files before ANY render/correction/recast job runs. Directly motivated by EP10 v3 (built Aug 25, 2 days before orphan-detection.js existed).

- [NOT STARTED] **11th — Sting detector.** Est. TBD
  Verify the sting appears exactly once, at the very start of the intro, before Belle's first line, and nowhere else. Tied to canon STING-001.

- [NOT STARTED] **12th — Music-bed structure detector.** Est. TBD
  Verify the full loud/duck/loud/duck/fade envelope per MUSICBED-001. Tied to canon MUSICBED-001.

- [NOT STARTED] **13th — ARCHITECTURAL FIX, TOP PRIORITY: assembleAndVerifyFinalMix().** Est. TBD
  One canonical shared function replacing the current situation where core.ts, render-correction-mix.js, and recast-character.js each independently assemble final mixes with inconsistent behavior. This becomes the ONLY code path allowed to produce a finished episode mix. MANDATORY, structurally unskippable calls to orphan-detection.js and garble-detection-gate.js (and voice-mapping once built) happen INSIDE this function.

  **STATUS UPDATE, VERIFIED (Aug 29, 2026):** despite prior reports that this was built, direct GitHub verification confirmed the branch and commit do NOT exist anywhere in the actual repository. This item is genuinely [NOT STARTED].

**Phase 4 total: 44–89 hrs**

---

## Phase 5 — Fix Cover Generation

- [NOT STARTED] Route future cover batches through the existing content-aware pipeline instead of one-off scripts. Est. 3–6 hrs

**Phase 5 total: 3–6 hrs**

---

## Phase 6 — Emotional-Tempo Music

- [NOT STARTED] Decide build approach (A/B/C). Est. 0.5–1 hrs
- [NOT STARTED] Build beat/scene structure. Est. 4–8 hrs
- [NOT STARTED] Build multi-cue Suno generation. Est. 3–6 hrs
- [NOT STARTED] Build ffmpeg mid-episode crossfade. Est. 6–10 hrs
- [NOT STARTED] Test on one episode, iterate. Est. 3–5 hrs

**Phase 6 total: 16.5–30 hrs**

---

## Phase 7 — Apply Fixes to the Rest of Sunset

*(Requires Phase 3 + Phase 4 complete)*

**MOVED (Aug 30, 2026, Marc ruling):** sequenced directly after Phase 4 in execution order. This phase's own stated prerequisite has always been Phase 3 + Phase 4 only. Phase number stays 7, permanently.

- [NOT STARTED] Batch-run 16 safe episodes, incl. spot-check listening. Est. 6–14 hrs
- [NOT STARTED] Individually fix 7 remaining unsafe episodes. Est. 10–21 hrs
- [NOT STARTED] EP26 decision + execution. Est. 1–8 hrs
- [NOT STARTED] EP1–EP6 correction pass. Est. 8–14 hrs

**Phase 7 total: 25–57 hrs**

---

## Phase 8 — Standing Safeguards for All Future Stories

*(Positioned before the stress test — changes the generation process itself)*

- [NOT STARTED] Series facts table format + process. Est. 5–9 hrs
- [NOT STARTED] Asset property checks (ffprobe pre-render validation). Est. 4–7 hrs
- [NOT STARTED] Cross-episode continuity validator. Est. 10–20 hrs
- [NOT STARTED] Two-stage generation (skeleton/beats, then per-episode prose). Est. 14–24 hrs
- [NOT STARTED] Intro/outro content template. Est. 5–8 hrs
  Note (Aug 29, 2026): this is exactly the gap CANON ENFORCEMENT — PHASE 2 targets for the automated script-generation path specifically — treat as the same underlying work, not a separate build.

**Phase 8 total: 38–68 hrs**

---

## Phase 9 — The Real Test: Stress-Test Fresh Generation

*(Prerequisites: Phase 1's player reliability; Phases 4, 5, 6, 8 wired into core.ts specifically)*

- [NOT STARTED] Confirm Phase 4/5/6/8 gates are wired into core.ts, not just the correction tool. Est. 2–4 hrs
- [NOT STARTED] Generate one new episode via core.ts from a premise. Est. 2–4 hrs
- [NOT STARTED] Forensically verify: waveform, voice-ID, duplicates, artifacts. Est. 5–10 hrs
- [NOT STARTED] Iteration if issues found — genuinely unknown. Est. 0–30+ hrs

NOTE (Aug 29, 2026): this phase is the actual, direct test of this roadmap's stated goal — premise in, story out, unattended. It has never been attempted, even once. Running it before CANON ENFORCEMENT — PHASE 2 (script side) and Phase 4 item 13 (audio side) are both real would likely just reproduce EP10's chaos on a new episode.

**Phase 9 total (excluding worst case): 9–18 hrs, +unknown**

---

## Phase 10 — Creative/Taste Quality Without Marc's Ear

*Decided: Option B+C. Best calibrated after Phase 8's generation process is finalized. Depends on Phase 1's player reliability for audit sampling.*

- [NOT STARTED] Build the AI quality judge (30-point rubric). Est. 5–8 hrs
- [NOT STARTED] Calibration against historical decisions. Est. 6–12 hrs
- [NOT STARTED] Define audit sampling plan. Est. 1 hr
- [NOT STARTED] Define disagreement protocol. Est. 1 hr

**Phase 10 total: 13–22 hrs (+ recurring ongoing audit time thereafter)**

---

## Phase 11 — Governance & Guardrails: Remaining Builds

*(Decisions made in Phase 0. Must finish before Phase 2 is activated for real autonomous production.)*

- [NOT STARTED] Bart — automated cost circuit-breakers. Halts production if per-episode/per-day cost exceeds threshold. Est. 4–8 hrs
- [NOT STARTED] Lex — automated compliance check. Defamation, sensitive subject matter, voice-cloning ToS, content canon rules. Est. 6–12 hrs

**Phase 11 total: 10–20 hrs**

---

## Phase 12 — Operational Safety Nets for Sustained Autonomous Operation

*(Reaching autonomy once is different from operating it indefinitely, unattended)*

- [NOT STARTED] Rollback/unpublish mechanism. Est. 4–6 hrs
- [NOT STARTED] Pipeline stall/failure alerting. Est. 5–8 hrs
- [NOT STARTED] Define the "go/no-go" bar for full autonomy. Est. 3–5 hrs
- [NOT STARTED] Cost-at-scale validation. Est. 4–6 hrs
- [NOT STARTED] ElevenLabs ToS review at commercial scale. Est. 3–5 hrs
- [NOT STARTED] Safe pipeline-change process (canary testing). Est. 6–10 hrs

**Phase 12 total: 25–40 hrs**

---

## Phase 13 — Closing the Loop: System-Wide Learning

*(Depends on Phase 2, Phase 4, and Phase 10 all existing first)*

- [NOT STARTED] Performance-feedback loop into Maya. Est. 8–14 hrs
- [NOT STARTED] Failure-pattern-to-prevention pipeline. Est. 6–10 hrs
- [NOT STARTED] Lightweight A/B testing capability. Est. 8–12 hrs
- [NOT STARTED] System-level learning metrics dashboard. Est. 4–6 hrs

**Phase 13 total: 26–42 hrs**

---

## Phase 14 — Autonomous Marketing Spend System (Orion-Susan-Bart Loop)

*(Original design: Orion dispatches Susan against subscriber targets → Susan estimates campaign cost → Orion asks Bart to verify funds via Mercury bank access → if available, Orion authorizes Susan to launch → Bart moves funds to a campaign-scoped debit card → Susan can only spend what's on that card. Real separation-of-duties design. Positioned last: depends on Bart/Lex existing (Phase 11) and shouldn't activate until the content Susan would be acquiring subscribers INTO is itself trustworthy.)*

**STATUS UPDATE (Aug 29, 2026):** Bell campaign confirmed paused by Marc's explicit, intentional action.

Decision-first:

- [NOT STARTED] Spend-authority threshold decision. Est. 1–2 hrs
  Recommend tying this to: Phase 3 (Sunset correction) complete AND Phase 4 (Vega's gates) has a real track record.

- [NOT STARTED] GAP FLAGGED: Bart staffing was never explicitly decided. Phase 0's staffing decision covered Susan/Vega/Maya only. Bart — who has the most sensitive scope of any of them, given real Mercury bank access — needs the same explicit staffing decision, triggers, and probation treatment. Est. 1–2 hrs

Build — Bart's financial infrastructure:

- [NOT STARTED] Mercury bank API integration + fund verification mechanism. Est. 8–14 hrs
- [NOT STARTED] Hard technical spend cap — not a conversational relay. Est. 6–10 hrs
  Given context saturation risks: fund availability must be a HARD TECHNICAL CONSTRAINT (the debit card/transfer mechanism itself physically incapable of moving more than what's actually available), not something that depends on Orion correctly relaying what Bart said.
- [NOT STARTED] Overspend/anomaly alerting. Est. 3–5 hrs

Build — Susan's estimation capability:

- [NOT STARTED] Cost-per-subscriber estimation model. Est. 6–10 hrs
- [NOT STARTED] Validate estimates against real outcomes before trusting them autonomously. Est. 4–8 hrs
- [NOT STARTED] Decide and wire in: does Susan's launch authority include ad creative content, or is creative separately gated by Lex? Est. 3–5 hrs

Build — the authorization loop itself:

- [NOT STARTED] Orion-Susan-Bart dispatch and authorization workflow, with a full audit trail. Est. 6–10 hrs

**Phase 14 total: 38–66 hrs**

---

## Total Project Estimate

| Phase | Status | Low (hrs) | High (hrs) |
|-------|--------|-----------|------------|
| 0 — Governance decisions | ✅ COMPLETE | 4 | 8 |
| 1 — Player reliability | 2 of 3 complete, 1 in monitoring | 7 | 12 |
| 2 — Autonomous story selection (Maya) | In progress (PAUSED) | 29 | 51 |
| 3 — Finish Sunset correction | EP8 & EP9 approved; EP10 open, oldest blocker | 10 | 22 |
| 4 — Missing quality checks + curation (Vega) | Items 1 & 5 merged; item 13 NOT STARTED | 44 | 89 |
| 5 — Cover generation fix | Not started | 3 | 6 |
| 6 — Emotional-tempo music | Not started | 16.5 | 30 |
| 7 — Apply fixes to rest of Sunset | Not started | 25 | 57 |
| 8 — Standing safeguards | Not started | 38 | 68 |
| 9 — Stress-test fresh generation | Not started; never attempted | 9 | 18+ |
| 10 — Creative quality judge + audit | Not started | 13 | 22 |
| 11 — Governance builds (Bart, Lex) | Not started | 10 | 20 |
| 12 — Operational safety nets | Not started | 25 | 40 |
| 13 — Closing the loop: system learning | Not started | 26 | 42 |
| 14 — Autonomous marketing spend (Orion-Susan-Bart) | Not started; Bell campaign paused | 38 | 66 |
| **TOTAL** | **1 of 15 phases complete** | **~297.5** | **~556** |

Realistic framing: call it 295–555+ hours of real, sitting-and-watching time. At 4–6 working hours/day, that's roughly 1.6–4.6 months of calendar time. Phase 9 remains the biggest technical wildcard; Phase 0 (done) was the cheapest but most consequential; Phase 13 is the one most likely to feel skippable and isn't; Phase 14 handles real money and deserves the same rigor as everything that touches publish authority — arguably more, since financial harm from a bad autonomous decision is harder to undo than a bad episode.

**NEW, NOT YET COSTED (Aug 29, 2026):** the canon-registry work (72 rules) and CANON ENFORCEMENT — PHASE 2 (porting proven Hal inputs into the automated script-generation path) are real, necessary work not reflected in the phase totals above. Recommend adding these as an explicit sub-item under Phase 8 once Orion's Phase 2 report comes back.

---

## Not Yet Verified / Open Questions

- Does the orphaned-segment bug exist in core.ts (fresh generation) or is it truly correction-tool-specific?
- Belle-variants cost leak (71k calls in July vs 250 in August) — root cause never confirmed
- Whether Check 3, once built, would have caught all three voice bugs found in one day (Pierce, Ruth, Hector) — needs testing against these known-bad cases specifically
- Garble-detection-gate's synthetic acceptance test (WER 0.952 fail on known-corrupted text) — did it run real audio through Whisper transcription, or just compute WER between two text strings directly?
- NEW (Aug 29, 2026): does the app's trial-length field currently support per-campaign configuration, or does it assume one fixed number everywhere? Needed to make canon registry's TRIAL-001 enforceable.
- RESOLVED (Aug 28, 2026): "pct_50 sessions post-fix" milestone — corrected count of 136 independently confirmed via direct Supabase query. Milestone genuinely cleared.

---

## Document Notes

**AUTHORITATIVE VERSION:** Google Drive (link at top of this file's commit message). This GitHub copy is a manual mirror committed Aug 30, 2026. Whenever the Drive version is updated, a fresh copy will be committed here — treat any version of this file older than what Marc confirms is current as stale.

**GOOGLE DRIVE SOURCE:** https://drive.google.com/file/d/1xLjEjliUVmHCclO2tYZjpzWXKkqCSrpj/view?usp=sharing

**Canon Registry (separate doc):** https://docs.google.com/document/d/1UkzkrDQjSwjZf0LOTEHKmFmgRswxg9XotUbCUZpmQmI

*Last updated: Aug 30, 2026*
