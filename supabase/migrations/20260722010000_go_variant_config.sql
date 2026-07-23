-- CTA-INSTRUMENTATION-001 BUILD 2 (2026-07-22) — go_variant_config: per-variant
-- CTA copy + reveal configuration for the /go landing page.
-- ⚠️ NOT APPLIED ANYWHERE YET. Marc reviews + applies manually (standing
-- DDL rule, OPS-CHARTER-001-R1). No agent applies DDL.
--
-- PURPOSE: decouple CTA copy (heading, subheading, cta_label) from code
-- deploys. Susan owns copy changes — she can edit rows without a PR.
-- Structural changes (reveal_sec, new columns) remain gated to Marc.
--
-- APPROVAL GATE (Marc, msg 3616, 2026-07-22):
--   copy columns  (heading, subheading, cta_label) = Susan's call, logged as decision.
--   reveal_sec + any new columns                   = comes to Marc.
--
-- FALLBACK GUARANTEE: the /go page reads this table at render time but falls
-- back to hardcoded values if the table row is missing, the row has
-- active=false, or the DB is unavailable. The page will NEVER crash because
-- this table doesn't exist yet.
--
-- NOTE: Migration must be applied to production DB before table reads work;
-- page falls back to hardcoded values until then.

create table if not exists public.go_variant_config (
  variant      text        primary key
               check (variant in ('a', 'b')),
  heading      text,
  subheading   text,
  cta_label    text,
  reveal_sec   integer
               check (reveal_sec is null or reveal_sec > 0),
  active       boolean     not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);

comment on table public.go_variant_config is
  'CTA-INSTRUMENTATION-001: per-variant CTA copy + reveal config for /go. Susan owns heading/subheading/cta_label. Marc gates reveal_sec + structural changes. Page falls back to hardcoded GoStory values when rows missing/inactive or table pre-migration.';
comment on column public.go_variant_config.heading is
  'Susan-owned: initial bottom-sheet CTA heading shown before any pct milestone or completion. Null = page uses hardcoded default ("Keep the story going").';
comment on column public.go_variant_config.subheading is
  'Susan-owned: optional second line below the heading (currently reserved; not yet rendered). Null = omit.';
comment on column public.go_variant_config.cta_label is
  'Susan-owned: pre-completion CTA button label. Null = page uses hardcoded default ("Start free trial").';
comment on column public.go_variant_config.reveal_sec is
  'Marc-gated: override cumulative listened seconds before CTA reveals. Null = page uses GoStory.ctaRevealSeconds (70s for a, 100s for b).';
comment on column public.go_variant_config.active is
  'false = row ignored (page uses hardcoded fallbacks). Allows disabling a config without deleting the row.';

-- ── Seed rows (existing variants; copy values = current hardcoded defaults) ─
-- These rows wire the existing constants through the table WITHOUT changing any
-- copy. Heading / cta_label match the current hardcoded values in lib/landing.ts
-- (GO_CTA_COPY_DEFAULT). reveal_sec matches GoStory.ctaRevealSeconds per variant.
-- Marc approval gate: copy = Susan, reveal_sec = Marc per the gate above.

insert into public.go_variant_config
  (variant, heading, subheading, cta_label, reveal_sec, active, notes)
values
  -- Variant a: Commuter of the Year (Comedy, episode 1)
  -- ctaRevealSeconds=70 (Whisper timing: fraud clear 0:41, plaque 1:09 — Marc 2026-07-14)
  ('a',
   'Keep the story going',
   null,
   'Start free trial',
   70,
   true,
   'Commuter of the Year ep1. reveal_sec=70 per Marc WALK-BUG-0713 #1. Copy seeded at CTA-INSTRUMENTATION-001 launch (2026-07-22).'),

  -- Variant b: Murder at Falls Park (Mystery, episode 1)
  -- ctaRevealSeconds=100 (Falls Park hook lands ~1:36 — Marc 2026-07-13)
  ('b',
   'Keep the story going',
   null,
   'Start free trial',
   100,
   true,
   'Murder at Falls Park ep1. reveal_sec=100 per Marc WALK-BUG-0713 #1 amendment. Copy seeded at CTA-INSTRUMENTATION-001 launch (2026-07-22).')
on conflict (variant) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- SELECT: public read (anon + authenticated) — config data is not sensitive;
-- the /go server component reads with the service role key, but this policy
-- also lets the Supabase dashboard and anon-key callers read config.
-- INSERT/UPDATE/DELETE: admin-only (service role bypasses RLS entirely).

alter table public.go_variant_config enable row level security;

drop policy if exists go_variant_config_select_public on public.go_variant_config;
create policy go_variant_config_select_public on public.go_variant_config
  for select to anon, authenticated
  using (true);

-- No insert/update/delete policies for client roles — config edits go through
-- Supabase dashboard or migrations only (OPS-CHARTER-001-R1).
revoke insert, update, delete on public.go_variant_config from anon, authenticated;
