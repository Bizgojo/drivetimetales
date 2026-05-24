create table if not exists production_learning_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references production_jobs(id) on delete set null,
  story_id uuid references stories(id) on delete set null,
  series_id uuid,
  series_title text,
  episode_title text,
  stage text,
  failure_type text not null,
  root_cause text,
  fix_applied text,
  fix_type text,
  prevention_rule text,
  reusable boolean not null default false,
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists idx_production_learning_events_created_at
  on production_learning_events(created_at desc);

create index if not exists idx_production_learning_events_job_id
  on production_learning_events(job_id);

create index if not exists idx_production_learning_events_story_id
  on production_learning_events(story_id);

create index if not exists idx_production_learning_events_series_id
  on production_learning_events(series_id);

create index if not exists idx_production_learning_events_failure_type
  on production_learning_events(failure_type);

create index if not exists idx_production_learning_events_reusable
  on production_learning_events(reusable)
  where reusable = true;
