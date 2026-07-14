-- ATL-RLS-LOCKDOWN-013 (2026-07-10, Security Advisor export part 12)

-- play_events: 162 rows of user listening telemetry (user_id/progress/device)
-- were anon-readable. Primary write path = /api/analytics/play-event (service
-- role), but lib/analytics.ts writes DIRECTLY as client-side fallback → keep
-- own-row INSERT/UPDATE for authenticated; no client SELECT (reads go via
-- service/aggregates). Guest fallback writes fail closed; guests still log via
-- the API route.
alter table public.play_events enable row level security;
create policy playevents_insert_own on public.play_events
  for insert to authenticated with check (user_id = auth.uid());
create policy playevents_update_own on public.play_events
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- pipeline_runner_state: read client-side by admin approval console → admin
-- read; runner itself is service role.
alter table public.pipeline_runner_state enable row level security;
create policy runnerstate_admin_select on public.pipeline_runner_state
  for select to authenticated using (public.is_admin());

-- story_excellence_lessons (12 rows of Marc-rejection lessons) +
-- character_voices (718-row EL voice catalog): pipeline/admin-API only
-- (service role) → sealed, no client policies.
alter table public.story_excellence_lessons enable row level security;
alter table public.character_voices         enable row level security;
