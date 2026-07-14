-- ATL-RLS-LOCKDOWN-009 (2026-07-10, Security Advisor export part 8)
-- user_name_clips (empty, no refs) + el_usage_log (EL cost telemetry, was
-- anon-readable; server-side el-logger/el-sync only): RLS on, no client policies.
-- groups (taxonomy, read client-side by admin approval console) + landing_stories
-- (public marketing content, may be read directly by landing site): public read,
-- admin-only writes — same pattern as authors/narrator_voices.
alter table public.user_name_clips enable row level security;
alter table public.el_usage_log    enable row level security;

alter table public.groups          enable row level security;
create policy groups_select_public on public.groups
  for select to anon, authenticated using (true);
create policy groups_admin_write on public.groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.landing_stories enable row level security;
create policy landing_select_public on public.landing_stories
  for select to anon, authenticated using (true);
create policy landing_admin_write on public.landing_stories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
