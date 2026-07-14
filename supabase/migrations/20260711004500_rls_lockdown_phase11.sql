-- ATL-RLS-LOCKDOWN-011 (2026-07-10, Security Advisor export part 10)
-- openai_usage_log (309 rows) + anthropic_usage_log (22,301 rows): LLM cost
-- telemetry was anon-readable; only server-side loggers/admin routes use them
-- (service role, verified). RLS on, no client policies.
alter table public.openai_usage_log    enable row level security;
alter table public.anthropic_usage_log enable row level security;

-- genres: 14-row taxonomy read CLIENT-SIDE (library filters, admin approval
-- console) → public read, admin write (authors pattern).
alter table public.genres enable row level security;
create policy genres_select_public on public.genres
  for select to anon, authenticated using (true);
create policy genres_admin_write on public.genres
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- genre_authors: empty taxonomy join table; asc3 internal tool reads via anon
-- client → same taxonomy pattern.
alter table public.genre_authors enable row level security;
create policy genreauthors_select_public on public.genre_authors
  for select to anon, authenticated using (true);
create policy genreauthors_admin_write on public.genre_authors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
