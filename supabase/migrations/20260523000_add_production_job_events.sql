create table if not exists production_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references production_jobs(id) on delete cascade,
  story_id uuid references stories(id) on delete set null,
  series_id uuid,
  series_title text,
  episode_count integer,
  stage text not null,
  status text not null check (status in ('started', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_job_events_job_id
  on production_job_events(job_id);

create index if not exists idx_production_job_events_series_id
  on production_job_events(series_id);

create index if not exists idx_production_job_events_created_at
  on production_job_events(created_at desc);

create index if not exists idx_production_job_events_stage_status
  on production_job_events(stage, status);
