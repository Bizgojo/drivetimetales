-- C6 Cover Performance Tracking (LAUNCH-READINESS-001 addendum)
-- cover_impressions: one row per story-card viewport entry (batched client writes)
-- cover_taps: one row per story-card tap
-- Band views: aggregate by page + position band (1-3 / 4-10 / 11+) for TTR comparison.

create table if not exists public.cover_impressions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  anon_id text,
  page text not null,
  list_position integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_cover_impressions_story_created
  on public.cover_impressions (story_id, created_at desc);

create index if not exists idx_cover_impressions_page
  on public.cover_impressions (page, created_at desc);

alter table public.cover_impressions enable row level security;
-- No policies: writes/reads go through service-role API routes only.

create table if not exists public.cover_taps (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  anon_id text,
  page text not null,
  list_position integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_cover_taps_story_created
  on public.cover_taps (story_id, created_at desc);

create index if not exists idx_cover_taps_page
  on public.cover_taps (page, created_at desc);

alter table public.cover_taps enable row level security;
-- No policies: writes/reads go through service-role API routes only.

-- Position bands keep placement from polluting the TTR signal.
create or replace view public.cover_impression_bands
with (security_invoker = on) as
select
  story_id,
  page,
  case
    when coalesce(list_position, 0) between 1 and 3 then '1-3'
    when coalesce(list_position, 0) between 4 and 10 then '4-10'
    else '11+'
  end as position_band,
  count(*)::int as impressions
from public.cover_impressions
group by 1, 2, 3;

create or replace view public.cover_tap_bands
with (security_invoker = on) as
select
  story_id,
  page,
  case
    when coalesce(list_position, 0) between 1 and 3 then '1-3'
    when coalesce(list_position, 0) between 4 and 10 then '4-10'
    else '11+'
  end as position_band,
  count(*)::int as taps
from public.cover_taps
group by 1, 2, 3;
