-- Migration: create org_state table
-- Used by the Command Center API (/api/admin/org-status) to persist
-- organizational state (agents, missions, blockers, readiness, reports).
-- Each logical data set is stored as a single JSONB row keyed by name.

create table if not exists org_state (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz default now(),
  updated_by text
);

-- RLS: only authenticated users can read; writes are via service role key only
alter table org_state enable row level security;

create policy "admin_read" on org_state
  for select
  using (auth.role() = 'authenticated');

-- Index for fast lookup by key (already covered by primary key, but explicit)
-- No additional indexes needed for a small KV store.

comment on table org_state is
  'Key/value store for Command Center organizational state. Written by API routes using the service role; read by authenticated admin users.';

comment on column org_state.key is
  'Logical data set name: agents | missions | blockers | readiness | reports';
comment on column org_state.value is
  'JSONB payload matching the shape expected by the Command Center page.';
comment on column org_state.updated_at is
  'Timestamp of last write.';
comment on column org_state.updated_by is
  'Identifier of the agent or process that wrote this row.';
