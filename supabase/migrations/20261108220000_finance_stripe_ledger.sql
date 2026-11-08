-- FINANCE-STATEMENT-003 (Marc, Nov 8 2026): revenue comes from the Stripe ledger.
-- Every charge, refund, dispute and fee (test accounts included: they were real money).
create table if not exists public.finance_stripe_txns (
  id text primary key,                -- Stripe balance transaction id (txn_…)
  created_at timestamptz not null,
  type text not null,                 -- charge, refund, stripe_fee, payout, adjustment…
  reporting_category text,
  amount numeric(14,2) not null,      -- dollars; refunds negative
  fee numeric(14,2) not null default 0,
  net numeric(14,2) not null,
  currency text not null default 'usd',
  status text,
  description text,
  source_id text,
  interval text,                      -- 'month' / 'year' for subscription charges and their refunds
  customer_email text,
  synced_at timestamptz not null default now()
);
create index if not exists finance_stripe_txns_created_idx on public.finance_stripe_txns (created_at);
alter table public.finance_stripe_txns enable row level security;
revoke all on public.finance_stripe_txns from anon, authenticated;

-- Mercury lines: cashback is its own line; real bank interest is Interest income.
update public.finance_vendor_rules set item = 'Card cashback rewards', purpose = 'Mercury card cashback.'
 where match_counterparty = 'Mercury IO Cashback' and section = 'Revenue';
insert into public.finance_vendor_rules (priority, match_counterparty, match_description, match_card, section, item, ai_service, purpose, accrual_months)
values (7, '%Interest%', null, null, 'Revenue', 'Interest income (Mercury)', null, 'Interest Mercury pays on balances.', 1)
on conflict do nothing;
update public.finance_vendor_rules set section = 'Excluded', item = 'Stripe payouts (transfer)', purpose = 'Money moved from the Stripe balance to Mercury. Revenue is counted from Stripe itself.'
 where match_counterparty = 'Stripe' and section = 'Revenue';
