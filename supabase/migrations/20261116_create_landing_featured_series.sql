-- LANDING-MOCKUP-001 (Marc, 2026-11-16): which series appear on www.endless-tales.com
--
-- The landing page (endless-tales-landing) shows a "Sample these stories" grid.
-- Before this table the four series were hardcoded in the HTML. Now Marc picks
-- them in Admin → Landing Page, and the page reads the list at load time.
--
-- Design notes:
--  * Keyed on series_id (the stable key) with series_name kept as a human label.
--    stories.series_id is NOT NULL for every published series, so a row here can
--    always be resolved back to real stories.
--  * sort_order drives display order in the grid; ties broken by series_name so
--    the page is stable even if two rows share a number.
--  * active lets Marc hide a series without deleting its row (keeps the choice
--    and its position for later re-enabling).
--  * RLS mirrors the existing landing_stories pattern (20260711001500): public
--    read for the marketing site, admin-only writes. Verified against that file.
--
-- Rollback:
--   drop policy if exists landing_featured_select_public on public.landing_featured_series;
--   drop policy if exists landing_featured_admin_write  on public.landing_featured_series;
--   drop table if exists public.landing_featured_series;

create table if not exists public.landing_featured_series (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null,
  series_name text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per series: re-adding a series updates it instead of duplicating it.
create unique index if not exists landing_featured_series_series_id_key
  on public.landing_featured_series (series_id);

-- The page always reads "active rows, in display order".
create index if not exists landing_featured_series_active_order_idx
  on public.landing_featured_series (active, sort_order, series_name);

comment on table public.landing_featured_series is
  'Series shown in the "Sample these stories" grid on www.endless-tales.com. Managed in Admin → Landing Page.';

alter table public.landing_featured_series enable row level security;

create policy landing_featured_select_public on public.landing_featured_series
  for select to anon, authenticated using (true);

create policy landing_featured_admin_write on public.landing_featured_series
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- updated_at maintenance, matching the trigger style used elsewhere in this schema.
create or replace function public.touch_landing_featured_series()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists landing_featured_series_touch on public.landing_featured_series;
create trigger landing_featured_series_touch
  before update on public.landing_featured_series
  for each row execute function public.touch_landing_featured_series();

-- Seed with the four series the page currently hardcodes, so the page looks the
-- same the moment it switches over to reading this table. These are the real
-- stories.series_id values (verified against Episode 1 rows, all published); the
-- similar-looking hex ids in the landing HTML are storage folder names, not
-- series_id values, and must not be used here. ON CONFLICT keeps the seed
-- idempotent and non-destructive if any of these already exist.
insert into public.landing_featured_series (series_id, series_name, sort_order)
values
  ('78882d57-fd50-4095-99ab-0a577472eb9a', 'The Widow Who Watched',   1),
  ('d1f90c2a-44c2-4b3c-b489-fb10882490bd', 'Second Rise',             2),
  ('d6af80a4-1ac9-48ae-8e7a-1fb71357e4ad', 'Weekend Wife in Miami',   3),
  ('8a7ab253-f1d7-4b22-95df-e27da9423ff7', 'The Nanny''s Rule',       4)
on conflict (series_id) do nothing;
