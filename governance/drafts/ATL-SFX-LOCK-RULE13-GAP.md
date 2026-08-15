# ATL-SFX-LOCK-RULE13-GAP — Rule 13 Not Enforced in production-jobs Runner

**Reported:** Marc Postlewaite, 2026-07-30 19:43 EDT  
**Severity:** Gap (no harm in this instance — neither story was approved)  
**Status:** Needs Atlas spec before fix

---

## Observation

SFX-ASSET-LOCK-001 Rule 13 (`archiveBeforeClear`) did **not fire** during the
Discharge Papers EP1/EP2 production job `936d6b1d` (2026-07-30).

Both stories had zero archived files. The runner cleared and regenerated 14 voice
segments per episode with no archive step. Neither story was Marc-approved, so no
approved audio was lost — but the gap is real.

---

## Root Cause

`archiveBeforeClear()` is exported from `lib/sfxAssetLock.ts` (Rule 13) but has
**no call-site in `app/api/admin/production-jobs/run-next/route.ts`**.

ATL-SFX-WIRE-001 (PR merged 2026-07-29) wired `sfxAssetLock` enforcement into:
- `app/api/asc3/generate-voices/route.ts`
- `app/api/asc3/render-final-mix/route.ts`

It did **not** wire it into the production-jobs runner path. The runner drives
`series_generate_voices` and `series_render_final_mix` by calling
`/api/admin/production-jobs/run-next` in a step loop — that path calls the
ASC3 endpoints internally, but the runner itself has no archive gate before
clearing and re-rendering existing segments.

Confirmed: `grep -rn "archiveBeforeClear" app/api/admin/production-jobs/` → zero results.

---

## What Rule 13 Requires

> Archive all segments + final_mix BEFORE any clear. Abort if archive fails.

Archive path convention: `asc3/<story_id>/archives/<YYYYMMDD-HHMMSS>/<file>`

The function exists and is correct. It is simply not called in the runner path.

---

## What Atlas Should Spec

1. **Where exactly** in the runner should Rule 13 fire?
   - Option A: in `run-next/route.ts` at the `series_generate_voices` step,
     before the first segment of each episode is rendered (per-story archive).
   - Option B: in the ASC3 generate-voices route itself (already wired for
     direct calls, but unclear if it covers the runner's indirect invocation).
   - Determine whether ATL-SFX-WIRE-001 already covers Option B and just needs
     the runner to pass the right context, or if Option A is required separately.

2. **Guard condition**: Rule 13 only applies when approved audio exists. Spec
   should define how "approved" is determined in the runner context (Marc-approved
   workflow_state? `is_approved` flag? explicit marker in state_json?).

3. **Failure mode**: If archive fails, should the job halt (hard stop, per Rule 13
   spec) or pause for Marc intervention? The rule says "Abort if archive fails"
   — confirm this remains the right behavior in a series job context.

4. **Regression test**: Add a test asserting that `archiveBeforeClear` is called
   (or the equivalent archive step fires) before any segment clear in the
   production-jobs runner path.

---

## Do Not Fix

Atlas to spec. No code changes until spec is approved.

---

*Logged by Atlas / Marc directive 2026-07-30*
