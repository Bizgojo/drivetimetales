-- GO-VARIANT-CONFIG-001 (2026-07-22)
-- Combines PR #5 (CTA config) + PR #7 (preview columns)
-- Marc approval: msg 3732+3736, 2026-07-22. Explicit apply authorization.
-- Story metadata NOT in this table — belongs in lib/landing.ts.

create table if not exists public.go_variant_config (
  variant              text        primary key,
  heading              text,
  subheading           text,
  cta_label            text,
  reveal_sec           integer,
  active               boolean     default true,
  notes                text,
  created_at           timestamptz default now(),

  -- GO-PREVIEW-001 preview columns (PR #7)
  preview_clip_url     text,
  preview_captions_url text,
  preview_continue_sec integer     -- position in full episode to continue after preview (138 = 2:18 for Falls Park)
);

-- RLS
alter table public.go_variant_config enable row level security;

-- anon can SELECT active rows (needed by /go page SSR)
drop policy if exists go_variant_config_read_anon on public.go_variant_config;
create policy go_variant_config_read_anon
  on public.go_variant_config for select
  to anon
  using (active = true);

-- Seed default rows for existing variants
insert into public.go_variant_config (variant, heading, subheading, cta_label, reveal_sec, active)
values
  ('a',    'Keep the story going.',   '14-day free trial · Card required', 'Start free trial', 45, true),
  ('b',    'Keep the story going.',   '14-day free trial · Card required', 'Start free trial', 45, true),
  ('bare', 'Keep the story going.',   '14-day free trial · Card required', 'Start free trial', 45, true)
on conflict (variant) do nothing;
