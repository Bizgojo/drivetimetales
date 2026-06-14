create table if not exists public.user_travel_insights_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('always', 'never', 'while_using')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_travel_insights_preferences enable row level security;

drop policy if exists "Users can view own travel insights preference" on public.user_travel_insights_preferences;
create policy "Users can view own travel insights preference"
  on public.user_travel_insights_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own travel insights preference" on public.user_travel_insights_preferences;
create policy "Users can insert own travel insights preference"
  on public.user_travel_insights_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own travel insights preference" on public.user_travel_insights_preferences;
create policy "Users can update own travel insights preference"
  on public.user_travel_insights_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_travel_insights_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_travel_insights_preferences_updated_at on public.user_travel_insights_preferences;
create trigger set_user_travel_insights_preferences_updated_at
  before update on public.user_travel_insights_preferences
  for each row
  execute function public.set_user_travel_insights_preferences_updated_at();
