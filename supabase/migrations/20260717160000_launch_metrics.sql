-- ATL-LAUNCH-REPORT-001 (2026-07-17) — launch_metrics table for /admin/launch-report.
-- ⚠️ NOT APPLIED ANYWHERE YET. This file lives on feat/launch-report-001 only.
-- Marc reviews + applies manually, then populates via his own local script
-- (service-role key, bypasses RLS). No agent credentials involved.
--
-- Purpose: holds the FETCHED rows of the Launch Report that we cannot compute
-- from our own DB: Impressions, Clicks to Landing Page, TikTok/Meta/Anthropic/
-- OpenAI/ElevenLabs/Other expenses, and Money in Mercury Bank.
--
-- Design: one row per (metric_key, window). Marc's script computes each window
-- value itself (from the ad platform / provider dashboards) and upserts all
-- three windows per metric. `as_of` is the freshness timestamp shown in the UI
-- ("as of [time]" is mandatory for every fetched row).
--
-- metric_key values the report reads (windows: '4h' | '24h' | 'total'):
--   impressions          — ad impressions (Meta + TikTok combined, or Meta-only pre-TikTok)
--   lp_clicks            — clicks to landing page
--   tiktok_expenses      — $0 until TikTok launch (report defaults to $0.00 if absent)
--   meta_expenses
--   anthropic_expenses
--   openai_expenses
--   el_expenses          — ElevenLabs
--   other_expenses
--   mercury_balance      — point-in-time; only window='total' is meaningful,
--                          report shows '—' for its 4h/24h columns.
-- (total_expenses is COMPUTED by the report as the sum of the six expense rows;
--  CAC is computed as (meta_expenses + tiktok_expenses, total) / total trials.)

create table if not exists public.launch_metrics (
  id          bigint generated always as identity primary key,
  metric_key  text        not null,
  "window"    text        not null default 'total'
              check ("window" in ('4h', '24h', 'total')),
  value       numeric     not null default 0,
  as_of       timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (metric_key, "window")
);

comment on table public.launch_metrics is
  'ATL-LAUNCH-REPORT-001: externally-sourced launch KPIs (impressions, ad spend, provider costs, Mercury balance). Upserted by Marc''s local script; read by /api/admin/launch-report.';
comment on column public.launch_metrics.metric_key is
  'impressions | lp_clicks | tiktok_expenses | meta_expenses | anthropic_expenses | openai_expenses | el_expenses | other_expenses | mercury_balance';
comment on column public.launch_metrics."window" is
  '4h = last 4 hours, 24h = last 24 hours, total = since launch anchor 2026-07-17 13:55 UTC';
comment on column public.launch_metrics.as_of is
  'When this value was true at the source (shown as "as of [time]" in the admin UI)';

-- RLS: same posture as ATL-RLS-LOCKDOWN-001 — admin-only reads via the shared
-- public.is_admin() predicate; no client writes (Marc's script uses the
-- service-role key, which bypasses RLS; the API route also uses service role).
alter table public.launch_metrics enable row level security;

drop policy if exists launch_metrics_select_admin on public.launch_metrics;
create policy launch_metrics_select_admin on public.launch_metrics
  for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: client roles cannot write.

-- ── Example upsert for Marc's local script (service-role key) ────────────────
-- insert into public.launch_metrics (metric_key, "window", value, as_of, updated_at)
-- values
--   ('impressions',        '4h',    1234,    now(), now()),
--   ('impressions',        '24h',   5678,    now(), now()),
--   ('impressions',        'total', 9999,    now(), now()),
--   ('lp_clicks',          'total', 321,     now(), now()),
--   ('meta_expenses',      'total', 150.25,  now(), now()),
--   ('tiktok_expenses',    'total', 0,       now(), now()),
--   ('anthropic_expenses', 'total', 42.10,   now(), now()),
--   ('openai_expenses',    'total', 3.55,    now(), now()),
--   ('el_expenses',        'total', 88.00,   now(), now()),
--   ('other_expenses',     'total', 12.00,   now(), now()),
--   ('mercury_balance',    'total', 25000.00, now(), now())
-- on conflict (metric_key, "window")
-- do update set value = excluded.value, as_of = excluded.as_of, updated_at = now();
