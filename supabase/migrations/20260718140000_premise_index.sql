-- PREMISE-UNIQUENESS-001 (2026-07-18) — premise_index table.
-- ⚠️ NOT APPLIED ANYWHERE YET. This file lives on feat/premise-uniqueness-001 only.
-- Marc reviews and pastes this into the Supabase SQL editor himself — no DDL
-- runs from agent machines. After applying, Marc runs the backfill:
--   node scripts/backfill-premise-index.js --apply   (service-role key, DML only)
--
-- CANON RULE (Marc ruling 2026-07-18 09:24 EDT): no new brief proceeds to
-- Stage 2 with a premise substantially similar to any story that is published
-- or in ready_for_review / repair_queue / approved_ready. Cold storage is
-- exempt — those premises are reusable. "Substantially similar" = same core
-- hook + same central situation; shared genre/setting alone does not collide.
-- Full rule text: governance/PREMISE-UNIQUENESS-001.md
--
-- Design:
--  - One row per story whose premise is currently reserved (story is in one
--    of the four protected workflow states above).
--  - Rows are upserted by the workflow_state writers via
--    lib/premiseIndex.ts (syncPremiseIndexForTransition) and removed when a
--    story enters cold_storage. scripts/backfill-premise-index.js repopulates
--    the whole index from the stories table at any time (idempotent upsert).
--  - core_hook is extracted deterministically from the premise (first
--    sentence, extended to the second sentence when the first carries fewer
--    than 6 content tokens — see lib/premiseGate.ts header for the rule).
--  - premise / logline hold the comparison text: premise = brief_json.premise
--    (fallback: stories.description for legacy rows); logline = the story-card
--    description.
--  - series_id lets the gate exclude sibling episodes of the same series
--    (episodes of one series legitimately share the series premise).

create table if not exists public.premise_index (
  id          bigint generated always as identity primary key,
  story_id    uuid        not null unique references public.stories(id) on delete cascade,
  series_id   uuid,
  title       text,
  status      text        not null,
  genre       text,
  logline     text,
  core_hook   text,
  premise     text,
  updated_at  timestamptz not null default now()
);

comment on table public.premise_index is
  'PREMISE-UNIQUENESS-001: premises reserved by stories in published/ready_for_review/repair_queue/approved_ready. Read by the mandatory brief gate before Stage 2. Cold storage rows are deleted (premise freed).';
comment on column public.premise_index.story_id is
  'stories.id owning this premise reservation (cascade-deleted with the story)';
comment on column public.premise_index.series_id is
  'stories.series_id — the gate skips sibling episodes of the candidate series';
comment on column public.premise_index.status is
  'workflow_state at last index sync (published | ready_for_review | repair_queue | approved_ready)';
comment on column public.premise_index.logline is
  'story-card description (stories.description) at last sync';
comment on column public.premise_index.core_hook is
  'deterministic hook extraction from the premise — see lib/premiseGate.ts CORE HOOK EXTRACTION RULE';
comment on column public.premise_index.premise is
  'full premise text (brief_json.premise, fallback stories.description) — central-situation comparison source';

create index if not exists premise_index_series_id_idx on public.premise_index (series_id);
create index if not exists premise_index_status_idx on public.premise_index (status);

-- RLS: same posture as ATL-RLS-LOCKDOWN-001 / launch_metrics — admin-only
-- reads via the shared public.is_admin() predicate; no client writes. The
-- brief gate and the workflow writers run with the service-role key, which
-- bypasses RLS.
alter table public.premise_index enable row level security;

drop policy if exists premise_index_select_admin on public.premise_index;
create policy premise_index_select_admin on public.premise_index
  for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: client roles cannot write.
