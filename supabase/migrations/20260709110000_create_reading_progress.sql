create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  paragraph_index integer not null default 0,
  char_offset integer not null default 0,
  page_number integer,
  total_pages integer,
  percent numeric(5,2) not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint reading_progress_user_story_unique unique (user_id, story_id)
);

create index if not exists idx_reading_progress_user
  on public.reading_progress (user_id, updated_at desc);

alter table public.reading_progress enable row level security;

drop policy if exists "Users can read own reading progress" on public.reading_progress;
create policy "Users can read own reading progress"
  on public.reading_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reading progress" on public.reading_progress;
create policy "Users can insert own reading progress"
  on public.reading_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own reading progress" on public.reading_progress;
create policy "Users can update own reading progress"
  on public.reading_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
