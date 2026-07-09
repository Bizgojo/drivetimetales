-- PERS-FIX-002 — worker heartbeats + personalization fallback telemetry.
-- DO NOT auto-apply. Orion applies migrations (per work order).
--
-- Why (PERS-DIAG-001, 2026-07-09):
--  * The personalization pool worker logged 1,274 cycles of "processed=0"
--    unnoticed, and the render worker erred 1,485 cycles unnoticed — no
--    heartbeat surface existed for either.
--  * /api/asc3/story-playlist silently served the generic final_mix whenever
--    the personalized branch was gated off; the degradation was not countable.

-- 1) One row per background worker; upserted every cycle.
--    Alert rule (health-check): last_run_at > 2 cycle intervals stale OR
--    last_error non-null.
create table if not exists public.workers_heartbeat (
  worker_id text primary key,
  last_run_at timestamptz not null default now(),
  last_processed_count integer,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.workers_heartbeat is
  'PERS-FIX-002: one row per background worker, upserted every cycle. Alert when last_run_at is >2 cycle intervals stale or last_error is non-null.';

-- 2) One row per authenticated play that fell back to the generic final_mix,
--    with the gating reason (missing_announcement_url, name_pool_not_ready, ...).
create table if not exists public.personalization_fallbacks (
  id uuid primary key default gen_random_uuid(),
  story_id uuid,
  user_id uuid,
  pronunciation_key text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists personalization_fallbacks_created_at_idx
  on public.personalization_fallbacks (created_at desc);
create index if not exists personalization_fallbacks_reason_idx
  on public.personalization_fallbacks (reason);
create index if not exists personalization_fallbacks_story_id_idx
  on public.personalization_fallbacks (story_id);
create index if not exists personalization_fallbacks_user_id_idx
  on public.personalization_fallbacks (user_id);

comment on table public.personalization_fallbacks is
  'PERS-FIX-002: countable record of authenticated plays that fell back to generic final_mix, with the personalization gate reason.';
