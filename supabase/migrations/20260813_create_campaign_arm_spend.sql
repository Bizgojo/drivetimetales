-- Migration: create campaign_arm_spend
-- Created: 2026-08-13 (Atlas, Bell campaign analytics)
--
-- Stores manually-entered Meta ad spend per arm for the Bell campaign A/B test.
-- Applied via: supabase db push  OR  supabase migration up
--
-- DO NOT EXECUTE AUTOMATICALLY — apply intentionally after review.

create table if not exists campaign_arm_spend (
  arm         text primary key,   -- 'bell-arm1', 'bell-arm2', 'bell-arm3'
  spend_usd   numeric(10,2) not null default 0,
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

insert into campaign_arm_spend (arm) values
  ('bell-arm1'), ('bell-arm2'), ('bell-arm3')
on conflict (arm) do nothing;
