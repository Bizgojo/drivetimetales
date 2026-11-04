# REVIEW REQUEST — progress-alarm-day1a (fresh reviewer, not Atlas/self)

Branch: `feat/atlas-progress-alarm-day1a` (fresh from origin/main 9da96441).
**DO NOT MERGE. Merge requires Marc's explicit merge word.**

## Scope (Day1A only)

Alarm code only. No publish/queue/text changes, no merges/deploys, no Meta
work, no migrations, no spend ($0 — pure logic + read-only scan).

## What to verify

1. `lib/progressAlarm.ts` (new, pure, no I/O) — stall = 30min without a
   SAVE; reminder = 2h; fingerprint = presentCount/audioUrl/step/episodeCount;
   first observation establishes baseline (never alerts on first sighting);
   recovery clears the stuck spell.
2. `app/api/admin/progress-alarm/route.ts` (new GET) — scans running jobs,
   measures SAVED artifacts (storage `asc3/{storyId}` segment count,
   `stories.audio_url`, series episode saves, `current_step`), persists ONLY
   `state_json.progress_alarm` (merges, never clobbers), emits one alert per
   stuck spell + 2h reminders via existing runner event log + webhook.
3. `lib/pipelineTruth.ts` (+~30 lines) — running job with
   `state_json.progress_alarm.stuck=true` classifies STALLED + Marc-required
   even with a fresh lock; no-flag behavior unchanged (ACTIVE/ZOMBIE as before).
4. `lib/pipeline-runner/types.ts` (+2 lines) — `progress_stall` event kind,
   `progress-alarm` source. No existing kind/source semantics touched.
5. Tests: `npx jest __tests__/progress-alarm-day1a.test.ts` (15/15) —
   Graves Nov2-4 simulation (0 saved for 31min → first alert; quiet; 2h →
   reminder; 3 segs saved → recovered), health boundary (29min ok / 31min
   stuck), pipelineTruth STALLED-vs-ACTIVE.
6. Regression: `npx jest __tests__/atl-runner-timeout-001.test.ts` (6/6);
   `tsc --noEmit` clean on all touched files.
7. Confirm no `ACTIVE`-status, publish, queue, or text-generation paths added:
   `git grep -n publish -- <new files>` should return nothing.

## Reviewer report (paste below when done)

- Reviewer:
- Date:
- Verdict: APPROVE / CHANGES-REQUESTED
- Notes:

---

# ADDENDUM — ALARM-FIXES-4 (same branch, PR #478, DO NOT MERGE)

## What changed and why

Day1A alerted any non-saving job regardless of status/activity. Fixes-4
narrows the rule to **BUSY (touched last 30min) AND NOT SAVING (nothing saved
30min)** and silences the expectable stillness:

1. `lib/progressAlarm.ts` (+pure only) — `BUSY_MS` (30min), `EXTERNAL_REMINDER_MS`
   (24h), `scanTriage()` (queued→silent / waiting_for_external→wait /
   else→running), `isJobBusy()` (updated_at/locked_at/log-tail freshness),
   `lastLogAt()`, `externalReminderDue()`, `buildWaitingMessage()` (says
   WAITING, never STUCK), `ExternalWaitState` type. Core evaluator untouched.
2. `route.ts` — triage: `queued` → reported `silent_queued`, no reads/writes/alerts;
   `running` + idle → `idle_not_busy`, silent, no state writes;
   `running` + busy → existing Day1A evaluate/persist/alert path;
   `waiting_for_external` → daily WAITING reminder (`state_json.external_wait`,
   event kind `external_wait`, needs Marc), never stuck. Select adds
   `updated_at, locked_at, logs`.
3. `lib/pipeline-runner/types.ts` (+1 line) — `external_wait` event kind.
4. `lib/admin-center/access-policy.ts` (+1 path) — `/api/admin/progress-alarm`
   joins `INTERNAL_ADMIN_PATHS` so the EC2 timer's internal token passes
   middleware (admin-session fallback unchanged).
5. `scripts/ec2-deploy/` — `progress-alarm-call.sh` (single scan pass,
   token via `x-et-internal-key`, timestamped log lines) +
   `endlesstales-progress-alarm.{service,timer}` (every 5min) + README
   install/verify block. Vercel crons dead since Oct22; EC2 owns the schedule.
6. Tests — new `__tests__/progress-alarm-fixes.test.ts` (18 tests: Graves
   busy-loop alerts; queued silent; Lake House cast-wait = waiting reminder
   only + 24h cadence + WAITING-not-STUCK wording) + 1 auth test in
   `__tests__/admin-center/model.test.ts`. Day1A 15/15 + runner-timeout 6/6
   still green; tsc clean on touched files.
7. `pipelineTruth.ts` untouched — the STALLED hook reads
   `progress_alarm.stuck`, which fixes-4 now sets only for busy+not-saving
   running jobs.

## Firing evidence (pre-merge, from this branch's script)

`[2026-11-04T15:31:44Z] progress-alarm responded HTTP 403 (expected 200; 403 = PR #478 not yet merged/deployed, no state changed)`
— call fires end-to-end (DNS → Caddy → middleware); route refuses pre-merge
(no INTERNAL_ADMIN_PATHS entry in prod), zero state change. Post-merge+deploy
+ EC2 timer install + `ADMIN_INTERNAL_TOKEN` on EC2 → HTTP 200
`stuckCount=N alertsSent=M`. EC2 `systemctl status` of the timer is a
post-merge install step (no SSH from build box).

## Delivery evidence

Direct Bot-API TEST send attempted from build box: Telegram answered
`404 Not Found` — the repo's `TELEGRAM_BOT_TOKEN` (identical in all three
env files) is stale/rotated. No key-hunting performed (credentials rule).
Handoff: Orion sends the TEST text below from the live session and records
the message ID.

TEST text: `TEST — progress-alarm delivery check (PR #478, Stabilization
Week). This is a TEST of the alert path only. No job is stuck. No action
needed.` → Marc's DM (chat 8737860822).

## Reviewer report — fixes-4 (paste below when done)

- Reviewer (fresh, not Atlas/self):
- Date:
- Verdict: APPROVE / CHANGES-REQUESTED
- Notes:
