-- ATL-RLS-LOCKDOWN-017 (2026-07-10, Security Advisor export part 16 — pipeline core)
-- production_jobs: 5,093 rows of full pipeline state were anon-readable. Admin
-- approval console reads it CLIENT-SIDE (authenticated) → is_admin policies;
-- runner/dispatch/API routes are service-role.
alter table public.production_jobs enable row level security;
create policy prodjobs_admin_all on public.production_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- workers_heartbeat (2 rows, was anon-readable): workers write via service
-- role; no client code refs. personalization_fallbacks: telemetry lib takes an
-- injected service-role client (verified). Sealed, no client policies.
alter table public.workers_heartbeat        enable row level security;
alter table public.personalization_fallbacks enable row level security;
