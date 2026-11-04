-- PROGRESS-ALARM-OWN-STATE-001 (Stabilization Week, PR #478 follow-up).
--
-- The progress-alarm scanner keeps its alert state in its OWN table,
-- keyed by job_id. It NEVER writes production_jobs (no state_json writes,
-- no logs/updated_at writes). Reads production_jobs/stories/storage only.
--
-- ⚠️ Marc-SIDE APPLY REQUIRED: run this file against the production
-- database before (or with) the PR #478 merge. Until applied, the scanner
-- runs in stateless mode (baseline each scan, alerts still fire on the
-- 30-min rule but reminders fall back to first-alert cadence).
--
-- Rollback: drop table public.progress_alarm_state;

create table if not exists public.progress_alarm_state (
  job_id uuid primary key,
  fingerprint text not null,
  last_saved_at timestamptz not null,
  last_alert_at timestamptz null,
  stuck boolean not null default false,
  wait_last_reminder_at timestamptz null,
  updated_at timestamptz not null default now()
);

comment on table public.progress_alarm_state is 'PROGRESS-ALARM-OWN-STATE-001: alarm scanner state keyed by production_jobs.id. Scanner writes HERE ONLY; never touches production_jobs rows.';
comment on column public.progress_alarm_state.fingerprint is 'Last observed saved-artifact fingerprint (presentCount/audio_url/step/episodeCount).';
comment on column public.progress_alarm_state.last_saved_at is 'Last time the fingerprint moved (= last save).';
comment on column public.progress_alarm_state.last_alert_at is 'Last stuck-alert timestamp for the current stuck spell (2h reminder cadence).';
comment on column public.progress_alarm_state.stuck is 'True while the job is in a stuck spell.';
comment on column public.progress_alarm_state.wait_last_reminder_at is 'Last daily WAITING reminder for waiting_for_external jobs (24h cadence). Separate from stuck state.';
