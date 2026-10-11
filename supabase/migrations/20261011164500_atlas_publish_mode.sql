-- ATLAS PUBLISH-MODE SWITCH — Canon Rule 4 (PIPELINE-CANON-001, approved 2026-10-04)
--
-- CLASSIFICATION: Tier-2 (new table + seed). FEATURE-BRANCH ONLY.
-- NEVER applied to production by the building agent; applied only via the
-- reviewed merge + deploy path. ROLLBACK (instant, single-setting flip):
--   update public.atlas_settings set value = 'rfr', updated_by = 'marc-rollback',
--     updated_at = now() where key = 'publish_mode';
-- Readers (lib/publishMode.ts getPublishMode) re-read on every RFR completion
-- with no cache, so the flip restores rfr-hold behavior immediately.
--
-- STORE CHOICE: new tiny key/value table `atlas_settings`.
-- Rationale: no existing settings table exists in this codebase (verified:
-- no *settings* table referenced anywhere under app/, lib/, supabase/).
-- A KV table (not a single-purpose single-row table) holds the one approved
-- setting today and absorbs future single-value switches without a new
-- migration per switch. Writes restricted by change authority (Marc only,
-- one-line instruction) at the application layer; RLS default-deny with no
-- anon/authenticated policies so only service_role (server routes) can read
-- or write.

create table if not exists public.atlas_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

comment on table public.atlas_settings is
  'Atlas single-value switches. Canon Rule 4: publish_mode rfr|direct (initial direct, approved 2026-10-04). Change authority: Marc only.';

alter table public.atlas_settings enable row level security;

-- Seed the canon initial value. ON CONFLICT DO NOTHING so a re-run never
-- clobbers a value Marc has since changed.
insert into public.atlas_settings (key, value, updated_by)
values ('publish_mode', 'direct', 'canon-rule4-seed')
on conflict (key) do nothing;
