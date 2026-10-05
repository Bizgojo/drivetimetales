-- RLS for public.voice_profiles
-- Closes the RLS gap: voice_profiles currently has RLS DISABLED (exposed to
-- anon/authenticated roles). This mirrors the EXISTING pattern on
-- public.authors / public.narrator_voices (see 20260710190000_rls_lockdown.sql):
--   public read (anon + authenticated), admin-only writes via public.is_admin().
--
-- Equivalent read access, NOT broader. All server/pipeline reads of
-- voice_profiles use the service_role client (RLS-exempt), so enabling RLS does
-- not affect the admin Authors & Narrators pages or the generation pipeline.
--
-- Idempotent: safe to re-run.

alter table public.voice_profiles enable row level security;

-- public read (matches authors_select_public / narrators_select_public)
drop policy if exists voice_profiles_select_public on public.voice_profiles;
create policy voice_profiles_select_public on public.voice_profiles
  for select to anon, authenticated using (true);

-- admin-only writes (matches authors_admin_insert/update/delete)
drop policy if exists voice_profiles_admin_insert on public.voice_profiles;
create policy voice_profiles_admin_insert on public.voice_profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists voice_profiles_admin_update on public.voice_profiles;
create policy voice_profiles_admin_update on public.voice_profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists voice_profiles_admin_delete on public.voice_profiles;
create policy voice_profiles_admin_delete on public.voice_profiles
  for delete to authenticated using (public.is_admin());
