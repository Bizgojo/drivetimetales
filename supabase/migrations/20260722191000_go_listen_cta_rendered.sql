-- INSTRUM-PR5 (2026-07-22) — add 'cta_rendered' to go_listen_events insert policy
-- Marc authorization: msg 3736, 2026-07-22 15:56 EDT
-- Single change: 'cta_rendered' added to the event IN allowlist.
-- All other guards (variant, position_seconds, utm_source/campaign lengths, created_at window) unchanged.
-- BACKUP saved to workspace-orion/drafts/GO_LISTEN_EVENTS_RLS_POLICY_BACKUP_20260722.sql
-- Verification: play_start accepted (baseline), cta_rendered blocked before this migration.

-- Drop + recreate in a single statement (policy replacement is atomic in PostgreSQL)
drop policy if exists go_listen_events_insert_anon on public.go_listen_events;

create policy go_listen_events_insert_anon on public.go_listen_events
  for insert to anon, authenticated
  with check (
    variant in ('a', 'b', 'bare')
    and event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click', 'cta_rendered')
    and position_seconds between 0 and 21600
    and (utm_source   is null or char_length(utm_source)   <= 120)
    and (utm_campaign is null or char_length(utm_campaign) <= 120)
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
  );
