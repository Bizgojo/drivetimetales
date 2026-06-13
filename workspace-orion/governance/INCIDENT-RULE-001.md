# INCIDENT-RULE-001: Failure Recurrence Prevention Standard

**Status:** Active  
**Effective date:** 2026-06-13  
**Owner:** Orion  
**Enforcer:** Weekly review in HEARTBEAT, monthly audit in tracker

---

## The Rule

When a production failure is root-caused and documented, the following sequence must occur within one development cycle (max 1 week):

### 1. Classify

Determine the failure's origin:
- **Data defect** (script header, narrator mismatch, missing field) → Hal owns prevention
- **Code defect** (logic, threshold, condition) → Atlas owns prevention
- **Process defect** (missing verification, stale deployment, bad handoff) → Orion owns prevention
- **Vendor issue** (ElevenLabs API, Supabase, Vercel) → Document assumption and accept risk

### 2. Assign Prevention Owner

| Classification | Owner | Example |
|---|---|---|
| Script/content | Hal | Script generation prompt, content audit |
| Logic/threshold/code | Atlas | Fixed threshold, better validator, fallback logic |
| Deployment/verification | Orion | Runbook gate, manual process rule |

### 3. Assign Detection Owner

**Always: Atlas**. Every failure detected in production must surface to a person (Marc, Orion, or agent) within **15 minutes** of occurrence, with enough context to repair without re-investigation.

Context required: story title, series (or "Standalone"), episode number (or "—"), failed step, error message, milliseconds since failure, recommended repair.

### 4. Assign Repair Owner

| Failure Type | Repair Approach | Owner | Effort |
|---|---|---|---|
| Data defect | Manual DB/file fix by Orion, plus prevention by Hal | Orion + Hal | Low |
| Code defect with permanent fix | Deploy code fix; test covers failure case | Atlas | Medium |
| Code defect without prevention | Add DB fallback or auto-repair logic | Atlas | Medium |
| Code defect without auto-repair option | Add 15-min alert with clear repair path | Atlas | Low |
| Process defect | Add runbook step or gating check | Orion | Low |

### 5. Implement Prevention, Auto-Repair, or Fast Alert

**Choose exactly one (in priority order):**

**A) Prevention (best)**
- Code change or prompt change so the failure cannot happen again
- The old data/code would produce the failure; new code does not
- Example: SILENCE_BUFFER threshold fix `1938d645` — short segments no longer rejected

**B) Auto-repair (second best)**
- Code detects the bad state and fixes it automatically, then continues
- No manual intervention needed; repair is silent or logged
- Example: `voice_preflight` DB fallback — if script NARRATOR is wrong but DB is correct, use DB and fix the script, then pass validation

**C) Fast alert (third best)**
- The failure still happens, but is surfaced within 15 minutes with enough context for Orion to fix without investigation
- Error message includes: what went wrong, current values, expected values, valid options, one-line fix instruction
- Example: Narrator preflight error including list of valid voice names and "Update script NARRATOR header to: Ray Dolan"

### 6. Add Regression Test

**Every prevention or auto-repair fix must have a test.**

Test file: `__tests__/[feature].test.js`  
Test case: reproduce the exact failure condition, verify it throws/fails on old code, verify it passes on new code

Example for INC-001:
```javascript
test('SILENCE_BUFFER: short segment under 10 words with 18016 bytes should NOT throw', () => {
  const shortText = 'She said nothing.';  // 3 words
  const bytes = 18016;
  expect(() => validateSilenceBuffer(bytes, shortText)).not.toThrow();
});
```

### 7. Track the Fix

**Backlog item created:** In `workspace-orion/BACKLOG.md`

Fields:
- Task ID (e.g., `HAL-SCRIPT-001`)
- Description
- Owner
- Status (Open / In-progress / Claimed Complete / Verified Complete / Blocked)
- Acceptance criteria
- Test ID (if code change)
- Commit ID (when done)
- Completion date

**Assignment:** Add to agent's `currentTask` in `agent-state.json` and announce in OpenClaw

### 8. Verify

After the fix is deployed:

**If prevention code fix:**
1. Confirm the old failure-case in a test environment fails on old code
2. Deploy new code
3. Confirm the test case now passes
4. Verify zero regressions in other tests

**If auto-repair:**
1. Trigger the failure condition (bad data)
2. Confirm the system detects it and repairs automatically
3. Confirm post-repair state is correct (DB updated, script fixed, etc.)
4. Verify job continues and completes

**If fast alert:**
1. Trigger the failure condition
2. Confirm alert appears in Command Center within 60 seconds
3. Confirm alert includes: what went wrong, valid options, fix instruction
4. Manually apply the fix and re-queue
5. Confirm job completes

---

## When This Rule is Violated

If a failure is not root-caused within 48 hours, or if a root-cause fix is not completed within one week, Orion escalates to Marc:

```
[ESCALATION] Failure [ID] still unresolved after 1 week.
Root cause: [description]
Assigned to: [owner]
Status: [blocked/stalled/not started]
Blocker: [what's preventing fix]
Recommendation: [shift priority / unblock / reassign]
```

---

## Examples from Recent Incidents

### INC-001: SILENCE_BUFFER False Rejection

| Step | What Happened |
|---|---|
| 1. Classify | Code defect (threshold too aggressive) |
| 2. Assign prevention | Atlas |
| 3. Assign detection | Atlas |
| 4. Assign repair | Atlas (code) |
| 5. Implement | **A) Prevention** — code fix `1938d645` (text-length-aware threshold) |
| 6. Test | `__tests__/silence-buffer-threshold.test.js` with "She said nothing." case |
| 7. Track | Added to `BACKLOG.md` as `ATLAS-SILENCE-001` |
| 8. Verify | Test passes; regression test added |

**Status:** ✅ Prevention + test deployed (pending Vercel verification gate from ORION-OPS-001)

### INC-002: Narrator Header Mismatch

| Step | What Happened |
|---|---|
| 1. Classify | Data defect (script prompt) + Code defect (no fallback) |
| 2. Assign prevention | Hal (prompt), Atlas (fallback code) |
| 3. Assign detection | Atlas |
| 4. Assign repair | Orion (immediate), Hal + Atlas (permanent) |
| 5. Implement | **A) Prevention** — Hal fixes prompt (OPEN); **B) Auto-repair** — Atlas adds DB fallback (OPEN) |
| 6. Test | Code test for DB-fallback scenario (OPEN) |
| 7. Track | Added to `BACKLOG.md` as `HAL-SCRIPT-001`, `HAL-SCRIPT-002`, `ATLAS-PIPE-004` |
| 8. Verify | Pending implementation |

**Status:** ⚠️ Immediate repair done, permanent fixes OPEN (due by 2026-06-20)

---

## Related Documents

- `INCIDENT-LOG-2026-06.md` — specific incident records
- `ORION-OPS-001-DEPLOYMENT-GATE.md` — process rule for code deployment verification
- `workspace-orion/BACKLOG.md` — task tracking
