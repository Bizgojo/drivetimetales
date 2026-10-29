-- AMENDMENT-1 (2026-10-29): campaign approval + test-run tables
-- Spec: docs/specs/amendment-1-ad-preview-and-testing-spec.md (Sec 4)

create table if not exists public.campaign_approvals (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  version_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','changes_requested','rejected','live','paused')),
  spend_ceiling numeric,
  decided_by text,
  decided_at timestamptz,
  launched_by text,
  launched_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (campaign_id, version_hash)
);

create table if not exists public.campaign_test_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  campaign_id text not null,
  version_hash text not null,
  check_video_audio text,
  check_destination_url text,
  check_signup text,
  check_checkout text,
  check_tracking text,
  check_mobile text,
  owner_tested_personally boolean not null default false,
  screenshots jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists campaign_approvals_campaign_idx on public.campaign_approvals (campaign_id);
create index if not exists campaign_test_runs_campaign_idx on public.campaign_test_runs (campaign_id);
