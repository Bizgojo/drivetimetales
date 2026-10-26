-- CREEK-PAUSE-AND-REPAIR (B): per-episode spend ledger.
-- STATUS: UNAPPLIED — rides the feature branch; Marc applies with explicit word.
-- Enforces the $10 routine-production cap per story episode. Every paid
-- operation records one row with a clearly-labeled ESTIMATED cost; historical
-- or unattributable spend is cost_basis='unknown' (NEVER zero) and flagged.
-- Until applied, app/lib/spend-ledger.ts fails OPEN (warn + continue) so
-- production is never broken by the missing table.

create table if not exists episode_spend_ledger (
  id uuid primary key default gen_random_uuid(),
  -- null story_id = unattributed / unknown-story spend: flagged, never silently dropped
  story_id text null,
  provider text not null,
  operation text not null,
  -- null when cost_basis='unknown'; NEVER use 0 for unknown spend
  estimated_cost_usd numeric null,
  cost_basis text not null default 'estimated' check (cost_basis in ('estimated', 'unknown')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists episode_spend_ledger_story_id_idx on episode_spend_ledger (story_id);
create index if not exists episode_spend_ledger_created_at_idx on episode_spend_ledger (created_at);
