-- FINANCE-STATEMENT-007: Claude's monthly profit suggestions (one row per month).
create table if not exists public.finance_suggestions (
  month date primary key,
  items jsonb not null,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
alter table public.finance_suggestions enable row level security;
revoke all on public.finance_suggestions from anon, authenticated;
