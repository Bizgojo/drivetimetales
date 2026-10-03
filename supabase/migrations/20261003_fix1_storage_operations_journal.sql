-- FIX-1 STORAGE IDEMPOTENCY (Fix 1a): storage_operations journal table
--
-- Journal-first idempotency ledger for storage writes. Every put/move/promote
-- records intent (pending) BEFORE any bytes move, then advances
-- pending → staging → verifying → committed | rolled_back.
--
-- SCOPE: this table ONLY. Do NOT add device tables, story_objects, or
-- canonical-pointer columns here — those depend on §10 Q2/Q5 answers
-- (blocked on Marc).
--
-- Access: service-role only (RLS enabled, no public policies). Pipelines run
-- server-side with the service key; no client should read/write this ledger.

create table if not exists public.storage_operations (
  id uuid primary key default gen_random_uuid(),

  -- Deterministic: sha256(storyId:inputsHash:kind). Unique = replay-noop enforcement at the DB layer.
  idempotency_key text not null unique,

  story_id text not null,
  kind text not null check (kind in ('put', 'move', 'promote')),

  -- Live key is NEVER written with upsert:true; only promoteObject touches it.
  live_key text not null,
  -- Idempotency-scoped staging key; upsert:true against staging keys is safe.
  staging_key text,

  status text not null default 'pending'
    check (status in ('pending', 'staging', 'verifying', 'committed', 'rolled_back')),

  expected_sha256 text not null,
  expected_bytes bigint not null check (expected_bytes >= 0),
  actual_sha256 text,
  actual_bytes bigint,

  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists storage_operations_story_id_idx
  on public.storage_operations (story_id);
create index if not exists storage_operations_status_idx
  on public.storage_operations (status);

-- Keep updated_at fresh on status transitions.
create or replace function public.storage_operations_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists storage_operations_touch_updated_at on public.storage_operations;
create trigger storage_operations_touch_updated_at
  before update on public.storage_operations
  for each row execute function public.storage_operations_touch_updated_at();

-- Service-role only: enable RLS with no public policies.
alter table public.storage_operations enable row level security;
