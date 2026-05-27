create table if not exists public.play_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  story_id uuid references public.stories(id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds_played integer not null default 0,
  progress_pct integer not null default 0,
  stop_reason text,
  device_type text,
  device_os text,
  browser text,
  is_offline boolean not null default false,
  origin text,
  referrer_url text,
  genre text,
  author text,
  narrator text,
  duration_mins numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_play_events_user_started
  on public.play_events (user_id, started_at desc);

create index if not exists idx_play_events_story_started
  on public.play_events (story_id, started_at desc);

create index if not exists idx_play_events_session
  on public.play_events (session_id);

alter table public.play_events enable row level security;

drop policy if exists "Users can view own play events" on public.play_events;
create policy "Users can view own play events"
  on public.play_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own play events" on public.play_events;
create policy "Users can insert own play events"
  on public.play_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own play events" on public.play_events;
create policy "Users can update own play events"
  on public.play_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_play_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_play_events_updated_at on public.play_events;
create trigger set_play_events_updated_at
  before update on public.play_events
  for each row
  execute function public.set_play_events_updated_at();
