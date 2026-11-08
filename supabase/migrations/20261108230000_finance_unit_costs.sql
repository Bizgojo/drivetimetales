-- FINANCE-STATEMENT-004 (Marc, Nov 8 2026): ElevenLabs cost per story from credits used,
-- and script length per story for splitting voice cost.
create table if not exists public.finance_el_daily (
  day date primary key,
  credits numeric not null,
  synced_at timestamptz not null default now()
);
create table if not exists public.finance_el_plan (
  captured_on date primary key,
  tier text,
  credit_limit bigint,
  monthly_price_usd numeric(10,2),
  billing_period text,
  price_source text,          -- next_invoice | manual
  synced_at timestamptz not null default now()
);
alter table public.finance_el_daily enable row level security;
alter table public.finance_el_plan enable row level security;
revoke all on public.finance_el_daily, public.finance_el_plan from anon, authenticated;

create or replace view public.finance_story_chars with (security_invoker = true) as
  select id, length(coalesce(script, '')) as chars from public.stories
  where status = 'published' and published_on is not null and is_hidden = false;
revoke all on public.finance_story_chars from anon, authenticated;
