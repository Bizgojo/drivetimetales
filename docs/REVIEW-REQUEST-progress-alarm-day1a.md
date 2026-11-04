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
