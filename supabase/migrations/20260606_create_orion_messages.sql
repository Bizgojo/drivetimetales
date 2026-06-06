-- Migration: orion_messages — Orion Terminal chat history
-- Powers the two-way Orion Terminal in the Command Center.

create table if not exists orion_messages (
  id          uuid        primary key default gen_random_uuid(),
  role        text        not null check (role in ('marc','orion','hal','atlas','maya','susan','vega','bart','system')),
  agent       text        not null default 'orion',
  content     text        not null,
  created_at  timestamptz not null default now()
);

-- RLS: allow authenticated reads; writes via service role only
alter table orion_messages enable row level security;

create policy "admin_read_orion_messages" on orion_messages
  for select using (auth.role() = 'authenticated');

-- Index for fast time-ordered fetches
create index orion_messages_created_at_idx on orion_messages (created_at desc);

comment on table orion_messages is
  'Chat message history for the Orion Terminal in the Command Center. Written by API routes using service role; read by authenticated admins.';
