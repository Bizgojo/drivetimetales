# ATL-RUNNER-TIMEOUT-001 — Branch Summary (2026-07-20)

**Branch:** `fix/runner-timeout-fix` (off `main`)
**Commit:** `f5ab9169d59e002f9f2baf9963426a29bd04f218`
**Status:** Branch only. NOT merged, NOT pushed to main, NOT deployed. Merge awaits Marc's explicit sign-off after review.
**Authorization:** Marc Postlewaite, 2026-07-20 15:27 EDT — "Fix first. Atlas on a branch, I authorize the merge after review. Ep4 holds until it lands." (OPS-CHARTER-001-R1 bug-fix scope.)

## What was changed, and where

### 1. `lib/pipeline-runner/runner.ts` — the actual fix

The 90s abort lived in `callRunNext()`:

```ts
signal: AbortSignal.timeout(90_000)
```

This aborted **every** run-next fetch at 90s regardless of step. `render_final_mix` on longer episodes (segment downloads + ffmpeg concat + two-pass loudnorm + upload) legitimately exceeds 90s. The abort killed the fetch client-side while the render kept going server-side; the job stayed `running`+locked, heartbeat/zombie cleanup eventually reset it to `queued`, the next invocation re-rendered from scratch, hit the same 90s wall — zombie lock thrash. Systemic, not Sunset-specific.

**Fix — per-step abort budget:**

- New exported `runNextTimeoutMs(step)`:
  - `render_final_mix` → **600_000 ms (10 min)**
  - `series_render_final_mix` → **600_000 ms** (same code path for series episodes; same defect)
  - everything else → **90_000 ms** (unchanged default)
- Configurable per step via the exported `RUN_NEXT_TIMEOUT_MS_BY_STEP` map (add a step, done). Guarded with `hasOwnProperty` so prototype keys can't resolve as overrides.
- `callRunNext(jobId, holderId, currentStep)` now takes the current step (already available at the single call site in the inner step loop) and applies the budget.

**Deliberately NOT touched** (per ticket scope):

- `LOCK_STALE_MS` (10 min), `LEASE_DURATION_MS` (850s), `RUNNER_DEADLINE_MS` (740s), `HEARTBEAT_ZOMBIE_MS` (15 min), stall threshold (45 min). Global runner lock timeout is unchanged.

**Budget-fit check:** 600s < 740s runner deadline (render fits inside one invocation) and 600s < 900s heartbeat-zombie threshold (a healthy in-flight render is never reset by self-healing — heartbeat refreshes just before the call, so worst-case staleness during a max-length render is ~600s).

### 2. `__tests__/atl-runner-timeout-001.test.ts` — new test (10 assertions across 6 tests)

- Final-mix steps (both variants) get 600s.
- 11 representative ordinary steps keep 90s.
- `null` / `undefined` / unknown / prototype-key steps fall back to the 90s default (never 0, never unlimited).
- Every map override is positive, ≥ default, < runner deadline (740s), and < zombie threshold (15 min) — so nobody can later bump the map past the self-healing envelope without a red test.

**Test run:** `npx jest atl-runner-timeout-001 runner-self-healing` → 2 suites, 20 tests, all pass. `tsc --noEmit`: no new errors introduced (3 pre-existing pipeline-runner errors exist on `main` unchanged: `classify.ts` ×2 `text` used-before-declaration, `runner.ts` heartbeat `.catch` on PromiseLike — verified identical via stash).

## SFX question — NOT included, noted for separate ticket

**Answer: No — the incremental (per-segment) voice path never generates `sfx_NNNN` files, and it is NOT a one-line fix.**

Evidence:

- Full-batch mode (`app/api/admin/generate-voices/route.ts` ~line 3267) handles `type === 'sfx'` via `generateSFX()` → `sfx_NNNN.mp3`. ✅
- Incremental mode (`retryMissingOnly: true, segmentNumber` — what run-next's `runStandaloneVoiceSegment` uses) has three compounding gaps:
  1. `expectedSegmentNames` (~line 3052) filters to `narrator|character|beat|pause` only — SFX lines are excluded from the inventory, so `missingSegments` never lists them and job completion never waits for them.
  2. The runner's walker (`firstMissingSegmentNumber` over `missingSegments`) therefore skips SFX indices entirely — they're never requested.
  3. Even if an SFX index were requested, the targeted-retry branch throws `Targeted retry does not support sfx lines` (~line 3160), which run-next treats as a hard failure.
- Downstream effect: `render-final-mix/core.ts` interleaves whatever `sfx_NNNN.mp3` files exist (soft-skip if absent), so incrementally-produced episodes silently ship **without SFX** rather than failing.

A real fix needs: SFX-aware inventory (separate `sfx_` file pattern + existing-file check), a `generateSFX` branch in targeted retry, walker/completion-criteria changes in run-next, and a policy decision on SFX soft-fail (in batch mode `generateSFX` returns `null` on failure — making SFX required in incremental completion could stall jobs forever on a flaky SFX provider). That's a design decision + multi-file change → **separate ticket recommended** (suggest: ATL-SFX-INCR-001).

## Risk notes

- **Slower failure detection on genuinely-hung final-mix calls:** a truly wedged render now takes up to 600s to abort instead of 90s. Mitigated by: circuit breaker (5 consecutive failures → needs_attention), stall detection (45 min), and the fact that 90s was producing far more waste via re-render thrash.
- **Lock staleness edge:** `LOCK_STALE_MS` is 10 min — equal to the new budget. A render taking the full 600s could have its job lock appear stale to a competing runner at the boundary. In practice the distributed lease (only one runner invocation active) and story-affinity pickup make this a narrow theoretical race; if renders routinely approach 600s we should revisit (raise lock refresh inside run-next, not the global timeout). Worth a note in review.
- **Vercel function ceiling — verified OK:** run-next's `maxDuration` is 800s (governed by `vercel.json`, per comment at route.ts:19) and `render-final-mix/route.ts` declares `maxDuration = 800`. The new 600s abort budget fits inside both, so the runner's abort remains the binding client-side limit with 200s of platform headroom.
- No DB schema, no prod writes, no deploy, no dependency changes. Two files touched.
