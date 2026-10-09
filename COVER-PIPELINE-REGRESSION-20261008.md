# COVER PIPELINE FIX — Regression Report (2026-10-08)

**Directive:** Marc 2026-10-08 22:38 EDT (`cover-pipeline-fix-oct8-2238`)
**Branch:** `feat/cover-pipeline-decouple-001` (from `origin/main`; never main, no merge)
**Series:** Alderton Inheritance `591eec91` — EP1 failed `series_voice_preflight`
(digit numeral "1" in BELLE B intro); EP2/EP3 covers missing; all 3 in `repair_queue`.
**Root defect classification: Class A pipeline defect** — `cover_generation` was
serially gated behind `series_voice_preflight` / canonical-intro / announcement /
audio-readiness, so one EP1 preflight failure blocked EP2/EP3 covers. Concretely,
cover rendering lived inside `complete-story-package` (end of pipeline, after
`render_final_mix`), cover failure returned HTTP 422 `Package incomplete`, and both
`verifySeriesPackageEpisode` and `missingReadyForReviewFields` treated a missing
`cover_url` as a hard blocker.

## CLASSIFY-BEFORE-FIX LOOP (per change)

| # | Change | Class | Rationale |
|---|--------|-------|-----------|
| 1 | Decouple cover generation from voice preflight (`COVER_DECOUPLED_FROM` contract, cover phase trigger in `generateOneSeriesEpisodeScript`) | **A** | Pipeline ordering defect → code fix |
| 2 | `cover_generation_phase` right after blueprint + episode briefs (`buildCoverPhaseState`) | **A** | Pipeline ordering defect → code fix |
| 3 | Parallel `cover_tasks[]` (`dispatchCoverTasks` via `Promise.all`) | **A** | Pipeline serialization defect → code fix |
| 4 | `cover_retry` module + retry-wrapped cover step in `complete-story-package` | **A** | Pipeline resilience defect → code fix |
| 5 | Image backend routing (`lib/cover/imageRouter.ts`, `dall-e-3` primary) | **A** | Pipeline config defect → code fix |
| 6 | Alderton tolerant of missing covers (`cover_missing` flag, non-blocking assembly) | **A** | Pipeline gating defect → code fix (Alderton core logic untouched except this gating rule, as authorised) |
| 7 | `cover_missing_alert` (after 2 failed retries, log-only, never halts) | **A** | Pipeline observability gap → code fix |
| 8 | `cover_post_publish_update` (late-cover fan-out) | **A** | Pipeline gap → code fix |
| — | EP1 numeral-preflight failure (digit "1", Class B story defect), BELLE B intro content | **B** | Story/content path — **not touched** (correctly out of scope; covers now proceed despite it) |

**PIPELINE CANON 001 Rule 3:** sequential ordering governs EPISODES
(continuity/script order), not asset generation. Parallel cover assets do not
violate it — no episode consumes another episode's cover.

## Files changed

**New (additive, no existing behaviour altered):**
- `lib/cover/imageRouter.ts` — backend priority `dalle3 → claude-art → external-renderer`;
  `resolveImageModel()` (default `dall-e-3`, `COVER_IMAGE_BACKEND`/`OPENAI_IMAGE_MODEL`
  overrides); `assertNotBelleImageAgent()` (Belle is voice-only — no Belle image
  agent existed in code; now it is rejected by construction). No API keys handled
  (Marc sets keys; credential governance unchanged).
- `lib/cover/coverRetry.ts` — `classifyCoverFailure()` (invalid_composition /
  missing_subject / failed_render / empty_asset retryable; auth/400/policy
  non-retryable), `COVER_MAX_RETRIES = 3`, `buildStrategosRetryPrompt()`,
  `withCoverRetry()` (never throws; exhaustion → `{ ok:false }`).
- `lib/cover/coverAlert.ts` — `build/shouldFire/fireCoverMissingAlert()`,
  `agentLogEntryForCoverAlert()` (agent_logs row shape, code only — no DB write
  here); every sink guarded — **never halts pipeline**.
- `lib/cover/coverPhase.ts` — `COVER_DECOUPLED_FROM` contract,
  `buildCoverPhaseTasks()` (series + episode + announcement + branding),
  `buildCoverPhaseState()` (recorded in job state right after briefs),
  `dispatchCoverTasks()` (parallel `Promise.all`, per-task retry + alert,
  missing cover → `coverMissing` flag; never throws).
- `lib/cover/assemblyTolerance.ts` — `partitionAssemblyBlockers()`,
  `isCoverMissingOnly()`, `COVER_MISSING_FLAG = 'cover_missing'` (pure, shared
  by both assembly paths).
- `lib/cover/coverPostPublish.ts` — `build/applyCoverPostPublishUpdate()`
  (episode metadata → series metadata → announcement art → series-card re-render;
  per-target results, never throws).
- `lib/cover/index.ts` — barrel.
- `__tests__/cover-pipeline-decouple-001.test.ts` — 17 tests, all mocked.

**Modified (small diffs):**
- `app/api/asc3/regenerate-cover/route.ts` — model selection via
  `selectImageBackend()` (default was `gpt-image-1`, now `dall-e-3` primary per
  Task 5; `OPENAI_IMAGE_MODEL` env still overrides). No Belle-image references
  existed; none added.
- `app/api/admin/complete-story-package/route.ts` — cover step wrapped in
  1+3 attempts with Strategos `coverFeedback` regeneration per attempt; alert
  after 2 failed attempts (log-only sink); exhaustion → `warning` step +
  `cover_missing` (was: `failed` step → HTTP 422 `Package incomplete`).
  `cover_url` removed from blocking `missingReviewReadyFields`; responses carry
  `coverMissing` / `coverWarnings`.
- `app/api/admin/production-jobs/run-next/route.ts` —
  (a) cover-phase trigger recorded in job `state_json.coverPhase` when all
  episode scripts exist (plus idempotent backfill path); pure state write, **no
  image API calls** (spend governance — render spend needs Marc's separate word);
  never throws.
  (b) `verifySeriesPackageEpisode`: cover demoted to `coverMissing` flag;
  `runSeriesPackageCompletion` propagates `coverMissingByEp` and assembles.
  (c) `verifyStandaloneReadyForReview`: same demotion (`coverMissing` /
  `coverWarnings` in result + state).

**Deliberately NOT changed (with reason):**
- `lib/publishReadiness.ts` (`hasRenderedProduction`) and `isApprovedReady` /
  `isReviewReady` / `episodeBlockingReasons` in `content-approval` — Marc's
  approval + publish surfaces. Publishing without cover art would ship a broken
  card; human visibility of missing covers is retained there by design.
- Story engine, EP1 numeral defect (Class B), Belle prompts/voices — out of scope.
- `ARTIFACT-GATE-002` already treated cover as warning-only — cited as precedent,
  left as-is.
- No migration, no DB write, no deploy triggered during this work.

## Regression results (mocked image calls — $0 spend)

`npx jest __tests__/cover-pipeline-decouple-001.test.ts` → **17/17 pass** (0.3s):

| Scenario | Result |
|----------|--------|
| 3-ep series | 6 tasks (series+3ep+announcement+branding), max concurrency 6, all `done` |
| 10-ep series | 13 tasks, max concurrency 13, all `done`, no stall |
| Failed EP1 (numeral preflight) | EP2/EP3 covers `done` — preflight failure has no path to block covers |
| Missing announcement | 5 done, `announcement_art` → `coverMissing`, alert fired, rest unaffected |
| Missing cover (persistent failure) | 1+3 attempts, alert after 2 fails, `coverMissing=true`, dispatch **resolves** (no throw/hang) |
| Retry-then-succeed | Holly prompt regenerated per attempt, `ok` on attempt 3 |
| Failure classification | 4 trigger kinds retryable; 401/400-policy non-retryable |
| Alert | log shape + Holly notify; throwing sinks swallowed (never halts) |
| Assembly tolerance | `cover_url`-only → blocking empty + flag; real blockers (audio/status/review) still block |
| Post-publish | late cover fans out to episode + series + announcement + card; persistence failure never throws |
| Image routing | primary `dall-e-3`; `belle` rejected as image backend |
| Phase trigger | state recorded post-briefs with decoupling contract + task count |

**Typecheck:** `npx tsc --noEmit` → 40 errors before, 40 after; **zero in touched/new
files** (all pre-existing, e.g. `lib/belleGenerator.ts` line 42). No new type errors.

## What could NOT be verified (needs Marc / production)

- Live image render (DALL·E 3 / secondary / fallback) — intentionally not called
  (spend governance). Only mocked paths proven.
- End-to-end series run against staging DB — no migration/DB writes permitted in
  this task; `state_json.coverPhase` and `coverMissingByEp` shapes are new keys
  (additive, old readers ignore them) but unexercised against a live job.
- `agent_logs` persistence sink for `cover_missing_alert` — module returns the row
  shape; production wiring injects the sink explicitly (not done here, by design).
- Alderton `591eec91` EP2/EP3 themselves — recovery/requeue of those episodes is
  a production action, not taken here.

## How to finish the Alderton recovery (for Marc — no action taken)

1. Merge this branch only on Marc's explicit word (not merged).
2. EP2/EP3 covers can now generate via existing `regenerate-cover` (retry-wrapped
   downstream) or parallel `dispatchCoverTasks`; late covers land via
   `cover_post_publish_update` payload shape.
3. EP1's numeral defect remains a Class B story fix (spell out the digit) on the
   normal repair path — it no longer blocks any cover work.
