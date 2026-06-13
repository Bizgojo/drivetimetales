# Incident Log — June 2026

This document records production failures, root causes, follow-up tasks, and governance rules to prevent recurrence.

**Access control:** Readable by all agents. Updatable by Orion only (session commits). Weekly review by Orion in HEARTBEAT.

---

## INC-001: SILENCE_BUFFER False Rejection on Short Segments

**Date:** 2026-06-13T03:18:53Z  
**Incident:** Job `c5e531da` (Bridges of Bad Blood Ep 2) failed three times at `generate_voices` on `segment_0005.mp3`  
**Story:** "The Woman at Keenan Notch" (2d4b1207)  
**Status:** RESOLVED (workaround deployed; permanent fix pending Vercel deployment verification)

### Root Cause Analysis

| # | Cause | Layer | Owner |
|---|---|---|---|
| 1 | Script NARRATOR line "She said nothing." — 3 words | Script generation | Hal (acceptable) |
| 2 | ElevenLabs returns 18,016–19,688 bytes (legitimate 1-sec audio) | Vendor | ElevenLabs (working correctly) |
| 3 | `generate_voices` applies flat 20KB SILENCE_BUFFER_SIZE_THRESHOLD to all segments | Code | Atlas |
| 4 | 18KB < 20KB → rejection as silence → terminal failure | Logic | Atlas |
| 5 | Fix committed (`1938d645`) but not pushed to GitHub | Process | Orion (deployment process gap) |
| 6 | Vercel running old code; no verification before job re-queue | Process | Orion (CI/CD gate missing) |

### Timeline

| Time | Event | Actor |
|---|---|---|
| 21:00 EDT Jun 12 | Job `c5e531da` created, voice generation started | Autonomous runner |
| 22:00 EDT Jun 12 | Failure: segment_0005 SILENCE_BUFFER rejection (18,852 bytes) | generate_voices |
| 21:01 EDT Jun 12 | Atlas fix `1938d645` committed locally | Atlas |
| 21:04 EDT Jun 12 | Job re-queued, Orion assumes fix deployed | Orion |
| 23:00 EDT Jun 12 | Failure #2: same segment, same threshold (18,852 bytes) — Vercel still running old code | Vercel |
| 01:10 UTC Jun 13 | Atlas pushed fix to GitHub, force-redeploy commit `af05eb60` | Atlas |
| 02:16 UTC Jun 13 | Failure #3: segment_0005 rejected again (18,016 bytes) | Vercel (not yet redeployed) |
| 04:07 UTC Jun 13 | Orion generates segment_0005 locally (18,016 bytes, Samuel Cord voice), uploads to Supabase storage | Orion |
| 04:09 UTC Jun 13 | Job re-queued with segment_0005 in storage; runner finds and skips it, continues | Autonomous runner |
| 08:08 UTC Jun 13 | Job actively running `generate_voices`, 65 segments present, 117 remaining | Runner |

### Resolution

**Permanent fix:** Commit `1938d645` — text-length-aware SILENCE_BUFFER threshold:
- Segments < 10 words: 5,120-byte floor
- Segments ≥ 10 words: 20,480-byte floor
- "She said nothing." (3 words, 18KB) now passes

**Workaround deployed:** Segment `segment_0005.mp3` (18,016 bytes) directly uploaded to storage, bypassing the Vercel code path entirely.

**Why not just use the code fix?** Because the Vercel deployment process has a gap: no verification step between push and job re-queue. The fix existed but wasn't live on Vercel for 3+ hours after commit, causing two additional failures.

### Prevention & Governance

**Owner assignments:**

| Task | Owner | Status |
|---|---|---|
| **Prevent** — add explicit regression test for "She said nothing." (3 words, 18KB) | Atlas | **In-flight (ATL-OPS-001)** |
| **Detect** — surface failed `generate_voices` jobs within 15 minutes in Command Center alert banner | Atlas | **In-flight (ATL-OPS-001)** |
| **Repair** — none (code-level fix is sufficient once deployed) | N/A | ✅ Done |
| **Process** — add Vercel deployment verification gate before job re-queue | Orion | **OPEN** |

**Standing rule:** ORION-OPS-001 — no re-queue after code fix without deployment confirmation. See `workspace-orion/governance/ORION-OPS-001-DEPLOYMENT-GATE.md`.

---

## INC-002: Narrator Header Mismatch on NARRATOR_IS_CHARACTER Story

**Date:** 2026-06-13T01:03:37Z (detected 2026-06-13T04:07Z, +392 minutes)  
**Incident:** Job `f8abf5b2` (M-1 "The Leland Hall Case") failed at `voice_preflight`  
**Story:** "The Leland Hall Case" (ab3cd1a9)  
**Status:** RESOLVED (immediate repair done; permanent prevention pending)

### Root Cause Analysis

| # | Cause | Layer | Owner |
|---|---|---|---|
| 1 | Story script has `NARRATOR_IS_CHARACTER: true` — narrator is a character voice | Script design | Hal (acceptable) |
| 2 | Script prompt does not clearly specify: NARRATOR header must be voice name, never character name | Script generation | Hal |
| 3 | Script generated with `NARRATOR: Detective Collier` (character name, not voice name) | Script generation | Hal |
| 4 | DB correctly has `narrator_voice_name: Ray Dolan` but script header uses character name | Data inconsistency | Hal (script) |
| 5 | `voice_preflight` Rule 2 checks script NARRATOR against `narrator_voices` — fails (Detective Collier not a narrator voice) | Code | Atlas |
| 6 | Error message does not suggest valid narrator names or mention the DB `narrator_voice_name` | Error messaging | Atlas |
| 7 | Job sat in `status=failed` for 392 minutes with no detection mechanism | Monitoring | Atlas / Orion |
| 8 | Manual DB lookup required to find the fix (update script NARRATOR header to Ray Dolan) | Recovery process | Orion |

### Timeline

| Time | Event | Actor |
|---|---|---|
| 19:28 UTC Jun 12 | Job `f8abf5b2` created (M-1 Story #1) | Orion |
| 19:28 UTC Jun 12 | Story queued at `voice_preflight` | Autonomous runner |
| 01:03 UTC Jun 13 | Failure: NARRATOR "Detective Collier" not found in narrator_voices → Rule 2 fails | voice_preflight |
| 01:03–04:07 UTC Jun 13 | Job sits in `status=failed`, no detection | Nothing |
| 04:07 UTC Jun 13 | Orion discovers failure while investigating Bridges Ep2 incident | Orion |
| 04:07 UTC Jun 13 | Orion updates script in DB: `NARRATOR: Detective Collier` → `NARRATOR: Ray Dolan` | Orion |
| 04:07 UTC Jun 13 | Job reset to `queued / voice_preflight` | Orion |
| 04:10 UTC Jun 13 | Runner picks up job (after Bridges Ep2 releases lock) | Autonomous runner |

### Resolution

**Immediate fix:** Updated script NARRATOR header in DB from "Detective Collier" to "Ray Dolan". Job re-queued.

**Why it worked:** The DB `narrator_voice_name` was always correct ("Ray Dolan"). The script header was the mistake. `voice_preflight` now passes because "Ray Dolan" is found in `narrator_voices`.

### Prevention & Governance

**Owner assignments:**

| Task | Owner | Status |
|---|---|---|
| **Prevent** — update script generation prompt to unambiguously require voice names, never character names, even when `NARRATOR_IS_CHARACTER: true` | Hal | **OPEN (HAL-SCRIPT-001)** |
| **Prevent** — audit all existing `NARRATOR_IS_CHARACTER: true` stories; fix any with character names in NARRATOR header | Hal | **OPEN (HAL-SCRIPT-002)** |
| **Detect** — surface failed `voice_preflight` jobs within 15 minutes with full context | Atlas | **In-flight (ATL-OPS-001)** |
| **Repair** — improve error message to include: script value, DB value, list of valid narrator names, fix recommendation | Atlas | **In-flight (ATL-OPS-001)** |
| **Repair** — add DB fallback in `voice_preflight`: if script NARRATOR fails Rule 2 but `narrator_voice_name` is set AND valid, use DB value and update script header | Atlas | **OPEN (ATL-PIPE-004)** |

**Standing rule:** INCIDENT-RULE-001 — Known failures must become prevention, automatic repair, or alert-with-clear-repair-path within 15 minutes. See `workspace-orion/governance/INCIDENT-RULE-001.md`.

---

## Governance Rules

### INCIDENT-RULE-001: Failure Recurrence Prevention Standard

**Effective:** 2026-06-13  
**Owner:** Orion  
**Scope:** All production pipeline failures that have occurred before

**Rule:**
When a production failure is root-caused, the following sequence must occur within one development cycle (max 1 week):

1. **Classify:** Is this caused by bad data, bad code, bad process, or vendor behavior?
2. **Assign prevention owner:** If data → Hal; if code/process → Atlas/Orion
3. **Assign detection owner:** Atlas (monitoring/alerting)
4. **Assign repair owner:** Depends on classification
5. **Implement one of:**
   - **Prevention:** Code fix or process rule so the failure cannot happen again (preferred)
   - **Auto-repair:** Code that detects the condition and fixes it automatically (e.g., DB fallback)
   - **Fast alert:** Monitoring that surfaces the failure within 15 minutes with enough context (story title, series, episode, error message, fix recommendation) for Orion to fix it without further investigation

6. **Regression test:** Every failure-prevention fix must have a test case that would fail on the old code and pass on the new code
7. **Track:** The fix task is added to the agent's current assignment and marked in the tracker with acceptance criteria
8. **Verify:** After deployment, confirm the same failure-case can no longer reach terminal state

**Consequences of failure to implement this rule:**
- The same failure will likely recur within days
- Detection time increases (each recurrence takes longer to identify)
- Repair becomes more manual and error-prone
- Production readiness degrades

---

## Backlog Items (Linked)

See:
- `workspace-orion/BACKLOG.md` — Hal, Atlas, Orion task assignments
- `proposals/ATL-OPS-001-PIPELINE-OBSERVABILITY.md` — Observatory fixes in-flight
- Agent state updates in OpenClaw: Hal, Atlas, Orion current tasks

---

**Last updated:** 2026-06-13T04:09Z  
**Next review:** Weekly heartbeat by Orion  
**Archive plan:** Once all backlog items resolve, move this to `INCIDENT-LOG-ARCHIVE-2026-06.md`
