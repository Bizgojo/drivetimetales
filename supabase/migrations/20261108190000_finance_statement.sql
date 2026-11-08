-- FINANCE-STATEMENT-001 (Marc, Nov 8 2026): Admin → Finance → Statement.
-- Private tables, service role only (RLS on, no policies). Read by
-- /api/admin/finance/statement; written by the Mercury sync (scripts/finance/mercury-sync.ts).

create table if not exists public.finance_transactions (
  id text primary key,                 -- Mercury transaction id
  posted_at timestamptz not null,
  amount numeric(14,2) not null,       -- negative = money out
  status text not null,
  kind text not null,
  counterparty text not null default '',
  bank_description text,
  card text,                           -- e.g. '••9788' (last four only)
  card_nickname text,
  mercury_category text,
  custom_category text,
  note text,
  source text not null default 'mercury',
  synced_at timestamptz not null default now()
);
create index if not exists finance_transactions_posted_idx on public.finance_transactions (posted_at);

create table if not exists public.finance_vendor_rules (
  id serial primary key,
  priority int not null default 100,   -- lower wins
  match_counterparty text,             -- ILIKE-style pattern, % = any
  match_description text,
  match_card text,
  section text not null check (section in ('Revenue','Operating Exp','Production Exp','Ad Spend','Marketing Services','R & D','Excluded','Uncategorized')),
  item text not null,
  ai_service text,
  purpose text,
  accrual_months int not null default 1 check (accrual_months between 1 and 36),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_txn_overrides (
  txn_id text primary key references public.finance_transactions(id) on delete cascade,
  section text not null check (section in ('Revenue','Operating Exp','Production Exp','Ad Spend','Marketing Services','R & D','Excluded','Uncategorized')),
  item text not null,
  accrual_months int check (accrual_months between 1 and 36),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  platform text not null default 'Meta',
  start_date date not null,
  end_date date,
  utm_campaign text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.finance_transactions enable row level security;
alter table public.finance_vendor_rules enable row level security;
alter table public.finance_txn_overrides enable row level security;
alter table public.finance_campaigns enable row level security;
revoke all on public.finance_transactions, public.finance_vendor_rules, public.finance_txn_overrides, public.finance_campaigns from anon, authenticated;

-- Pipeline's own Claude usage per day (used to split Anthropic charges: pipeline vs agent fleet/dev tools)
create or replace view public.finance_pipeline_claude_daily with (security_invoker = true) as
  select (created_at at time zone 'UTC')::date as day, round(sum(cost_usd)::numeric, 4) as usd
  from public.anthropic_usage_log group by 1;
revoke all on public.finance_pipeline_claude_daily from anon, authenticated;

-- Vendor rules (Marc's categories, Nov 8 2026). Lower priority number wins.
create unique index if not exists finance_vendor_rules_match_uidx on public.finance_vendor_rules (priority, coalesce(match_counterparty,''), coalesce(match_description,''), coalesce(match_card,''));
insert into public.finance_vendor_rules (priority, match_counterparty, match_description, match_card, section, item, ai_service, purpose, accrual_months) values
 (1,  'Mercury Credit', null, null, 'Excluded', 'Card payments (internal)', null, 'Paying the Mercury credit card from checking. Not an expense.', 1),
 (1,  'Mercury Checking%', null, null, 'Excluded', 'Card payments (internal)', null, 'Paying the Mercury credit card from checking. Not an expense.', 1),
 (1,  'Mercury Savings%', null, null, 'Excluded', 'Transfers between Mercury accounts', null, 'Internal transfer.', 1),
 (2,  'SouthState Bank%', null, null, 'Excluded', 'Owner capital', null, 'Money Marc put into the business. Not revenue.', 1),
 (2,  'Regions Bank%', null, null, 'Excluded', 'Owner capital', null, 'Money Marc put into the business. Not revenue.', 1),
 (5,  'Stripe', null, null, 'Revenue', 'Subscriptions (Stripe payouts)', null, 'Subscription payouts after Stripe fees.', 1),
 (6,  'Mercury IO Cashback', null, null, 'Revenue', 'Other', null, 'Mercury card cashback.', 1),
 (10, 'Facebook', null, null, 'Ad Spend', 'Meta ads', 'Meta Ads', 'Paid ads; counts toward CAC.', 1),
 (11, 'Metapay', null, null, 'Operating Exp', 'Orion & agent fleet — Meta AI (Muse Spark)', 'Meta Model API (Muse Spark)', 'Orion''s AI model Oct 2–Nov 5. Closed Nov 8.', 1),
 (20, 'Anthropic', null, null, 'Production Exp', 'Claude API — story pipeline', 'Claude Sonnet / Haiku', 'Writes and checks episode scripts. Charges above the pipeline''s own log move to Operating.', 1),
 (21, 'OpenAI', null, null, 'Production Exp', 'OpenAI API — voice checks & covers', 'Whisper; gpt-image-1.5', 'Listens to every voiced line; makes story covers.', 1),
 (22, 'Google Cloud', null, null, 'Production Exp', 'Gemini — quality screening', 'Gemini', 'Story read, sound, cover and voice screening.', 1),
 (23, 'Kie%', null, null, 'Production Exp', 'Music (Kie / Suno)', 'Suno V4 via Kie.ai', 'Theme and scene music.', 1),
 (24, 'ElevenLabs%', null, null, 'Production Exp', 'Voices (ElevenLabs)', 'ElevenLabs TTS', 'Every voiced line.', 1),
 (25, 'Sound Ideas%', null, null, 'Production Exp', 'Sound effects library (Sound Ideas)', 'SourceAudio', 'Licensed sound effects. One-year purchase.', 12),
 (26, 'Soundsnap%', null, null, 'Production Exp', 'Sound effects (Soundsnap)', null, 'Licensed sound effects. One-year plan.', 12),
 (27, 'Suno%', null, null, 'Production Exp', 'Music (Suno plan)', null, 'Annual plan.', 12),
 (30, 'Deepseerwea', null, null, 'Operating Exp', 'Orion & agent fleet — DeepSeek', 'DeepSeek chat / reasoner', 'Prepaid credit for the agent fleet and story ideas.', 1),
 (30, 'DeepSeek%', null, null, 'Operating Exp', 'Orion & agent fleet — DeepSeek', 'DeepSeek chat / reasoner', 'Prepaid credit for the agent fleet and story ideas.', 1),
 (31, 'OpenRouter', null, null, 'Operating Exp', 'Orion & agent fleet — OpenRouter', 'OpenRouter', 'Prepaid credit; backup for story ideas.', 1),
 (40, 'Supabase', null, null, 'Operating Exp', 'Database & storage (Supabase)', null, 'Stories, users, audio files.', 1),
 (40, 'Vercel', null, null, 'Operating Exp', 'Hosting (Vercel)', null, 'Preview builds and test environment.', 1),
 (40, 'GitHub', null, null, 'Operating Exp', 'Code hosting (GitHub)', null, 'App code and pull requests.', 1),
 (40, 'Amazon Web Services%', null, null, 'Operating Exp', 'Server (AWS)', null, 'Runs the app and the story pipeline.', 1),
 (41, 'Apple', null, null, 'Operating Exp', 'Apple subscriptions (review)', null, 'Recurring Apple charges. Confirm which are business.', 1),
 (42, 'South Carolina Business Filing%', null, null, 'Operating Exp', 'Business filings & licenses', null, 'State filing fees.', 1),
 (50, 'Airtable', null, null, 'Marketing Services', 'Airtable (campaigns base)', null, 'Marketing campaigns base. Annual plan.', 12),
 (51, 'Kit.com', null, null, 'Marketing Services', 'Email marketing (Kit)', null, 'Email list and newsletters.', 1)
on conflict do nothing;

insert into public.finance_campaigns (name, platform, start_date, end_date, utm_campaign, notes) values
 ('GVL-TEST-001', 'Meta', '2026-07-10', '2026-08-05', 'gvl-test-001', 'First funnel test. Meta bills after ads run, so early charges can land in the next campaign''s dates.'),
 ('Bell launch (Bell Arm 2)', 'Meta', '2026-08-06', '2026-09-11', 'bell_launch', 'Bell Beneath Falls Park story ads.')
on conflict (name) do nothing;
