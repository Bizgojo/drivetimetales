# ATL-OPS-001 — Pipeline Observability & Failure Surface

**Status:** Approved — implement immediately  
**Author:** Orion  
**Date:** 2026-06-13  
**Priority:** P1 — blocks launch readiness

---

## Problem Statement

Three incidents in the June 12–13 production run exposed the same pattern:
- A job fails terminally
- The failure sits undetected for 30–392 minutes
- When surfaced, the error report lacks story/series/episode context ("unknown series/unknown episode")
- Root cause investigation requires manual DB queries
- Orion cannot report accurately to Marc without running additional lookups

These are not one-off bugs. They are gaps in the observability layer that will recur on every production run until fixed.

---

## Four Required Changes

---

### CHANGE 1: ATL-MON — Story Metadata in All Error Reports

**Gap:** The monitor reads `error_json.voiceGenerationReport.failures[0]` but does not join to `stories` to get `title`, `series_name`, `episode_number`. Reports say "unknown series / unknown episode" even when `story_id` is present in the job record.

**Required behavior:** Every Command Center error display must include:
```
Story: "The Woman at Keenan Notch" (job c5e531da)
Series: Bridges of Bad Blood | Episode: 2
Step: generate_voices | Segment: segment_0005.mp3
Error: SILENCE_BUFFER — ElevenLabs returned 18852 bytes
```

**Files to change:**
- `app/api/admin/production-console/route.ts` — enrich `failedJobs` array with story metadata via join
- `app/admin/production/console/page.tsx` — render enriched fields in failed job display
- `app/api/admin/org-status/route.ts` — include story title/series/episode in any blocker that references a job

**Acceptance criteria:**
- [ ] All failed job displays include: story title, series name (or "Standalone"), episode number (or "—")
- [ ] No failed job display shows "unknown series" or "unknown episode" when `story_id` is present
- [ ] Applies to both Command Center console and agent card error text

---

### CHANGE 2: ALERTING — 15-Minute Failed Job Visibility Gate

**Gap:** Jobs can sit in `status=failed` for hours without surfacing anywhere Marc or Orion actively monitors. The PIPELINE_ALERT_WEBHOOK_URL is unset (no reachable external endpoint), so webhook-based push notifications cannot be used.

**Required behavior:** The Command Center must expose a "PIPELINE ALERT" banner/section that:
1. Queries all jobs with `status = 'failed'` and `updated_at > NOW() - INTERVAL '24 hours'`
2. Displays each with: story title, series, episode, failed step, error summary, time since failure
3. Renders as a red alert banner at the top of the admin console, not buried in a list
4. Auto-refreshes every 60 seconds (same as current polling interval)
5. Clears when all failed jobs are re-queued or resolved

**Files to change:**
- `app/api/admin/production-console/route.ts` — add `recentFailures` array to response (all failed jobs in last 24h with story metadata)
- `app/admin/production/console/page.tsx` — render `recentFailures` as a persistent top-of-page alert section
- Alert section: red border, ⚠️ icon, story title, error summary, "X minutes ago"

**15-minute gate (Acceptance Criteria):**
- [ ] Any job with `status=failed` updated within last 24h appears in the `recentFailures` section on every page load
- [ ] The section is the FIRST visible element on the production console page
- [ ] It auto-refreshes every 60 seconds without page reload
- [ ] When the queue is clear (no recent failures), the section is hidden (not an empty box)

---

### CHANGE 3: PREFLIGHT-DATA — Narrator Validation Error Must Be Actionable

**Gap:** Current error: `NARRATOR "Detective Collier" not found in narrator_voices`

This tells you WHAT failed but not HOW to fix it. It does not include: which story, what valid narrator names exist, whether this is a NARRATOR_IS_CHARACTER mismatch, or what the DB `narrator_voice_name` field says.

**Required error format:**
```
voice_preflight failed for "The Leland Hall Case" (ab3cd1a9):
  Script NARRATOR header: "Detective Collier"
  DB narrator_voice_name: "Ray Dolan"
  Mismatch: script header contains a character name, not a narrator voice name
  NARRATOR_IS_CHARACTER: true (narrator IS a story character — use the voice name, not character name)
  Valid narrator voice names: Cole Hargrove, Elliott Crane, Finn Calloway, Iris Calloway,
    James Alcott, June Harlow, Marcus Hale, Morgan Veil, Nora Ashby, Quinn Merritt,
    Ray Dolan, Sage Wilder, Samuel Cord
  Fix: Update script NARRATOR header to "Ray Dolan" (or another valid narrator voice name)
```

**Files to change:**
- `app/api/admin/production-jobs/run-next/route.ts` — `validateNarratorAssignmentSync()`:
  - Pass available narrator names into the function
  - When Rule 2 fails: include script value, DB value, NARRATOR_IS_CHARACTER flag, list of valid names, and fix instruction
  - When Rule 5 fails (script/DB mismatch): clearly identify which field is wrong and which to trust

**Acceptance criteria:**
- [ ] `narratorIssues` array entries always include: script header value, DB `narrator_voice_name`, NARRATOR_IS_CHARACTER value, top 5 valid narrator voice names, and a one-line fix recommendation
- [ ] The fix recommendation alone is enough for Orion or Hal to repair without additional DB queries
- [ ] Tested with: character-name-in-narrator-header, blank narrator header, DB mismatch scenarios

---

### CHANGE 4: SILENCE-BUFFER — Regression Test + Vercel Deploy Verification

**Gap:** The text-length-aware SILENCE_BUFFER fix (commit `1938d645`) was committed but did NOT deploy to Vercel for 3+ hours because: (a) the commit was not immediately pushed to GitHub, (b) after push, Vercel's deployment was not verified before the job was re-queued.

**Two sub-fixes:**

**4a — Regression test for short segments:**

Add to `__tests__/silence-buffer-threshold.test.js` (or create if it doesn't cover this):
- Case: text = "She said nothing." (3 words), bytes = 18016 → must NOT throw
- Case: text = "She said nothing." (3 words), bytes = 2048 → must throw
- Case: text = "She said nothing." (3 words), bytes = 5120 → must throw (boundary: ≤ not <)
- Case: text = "She said nothing." (3 words), bytes = 5121 → must NOT throw
- Verify error message format when it does throw: must include word count and "short-segment threshold"

**4b — Deployment verification step (process/runbook):**

After any code push that changes pipeline behavior:
1. Check GitHub: `git log origin/main --oneline -1` — confirm commit is on origin
2. Wait 3 minutes for Vercel build
3. Hit the production console health endpoint to confirm the new build is live
4. ONLY THEN re-queue any waiting job that depends on the fix

Document this in `docs/DEPLOYMENT-RUNBOOK.md` (create if needed).

**Files to change:**
- `__tests__/silence-buffer-threshold.test.js` — add cases listed above
- `docs/DEPLOYMENT-RUNBOOK.md` — create with deployment verification steps

**Acceptance criteria:**
- [ ] All regression test cases pass with the current code
- [ ] The "She said nothing." case (18016 bytes, 3 words) passes explicitly
- [ ] Deployment runbook exists and covers: push → build → verify → re-queue sequence
- [ ] Vercel deploy confirmation step is documented

---

## Implementation Order

1. CHANGE 3 (PREFLIGHT-DATA) — smallest, no new UI, pure error message improvement
2. CHANGE 4 (SILENCE-BUFFER regression) — test only, no behavior change
3. CHANGE 1 (ATL-MON metadata) — API + UI, moderate
4. CHANGE 2 (ALERTING) — largest, UI + API, most impact

All four changes: single Atlas subagent run, single PR. Must pass `tsc --noEmit` and `npm run build`.

---

## Acceptance Test (End-to-End)

1. Intentionally fail a test job with a voice_preflight narrator mismatch
2. Confirm error message includes story title, script value, DB value, valid names, fix instruction
3. Confirm Command Center shows the failure with story title + series + episode within 60 seconds
4. Confirm the failure appears in the red alert banner at top of page
5. Re-queue the job
6. Confirm alert banner clears

---

**Owner:** Atlas  
**Reviewer:** Orion  
**Marc approval required:** No — operational quality fix, within Atlas authority
