-- INSTRUM-PR5-CHECK (2026-07-22) — add 'cta_rendered' to go_listen_events CHECK constraint
-- Marc authorization: msg 3749, 2026-07-22 16:04 EDT
-- Companion to 20260722191000_go_listen_cta_rendered.sql (RLS policy update)
-- BACKUP saved: workspace-orion/drafts/GO_LISTEN_EVENTS_CHECK_CONSTRAINT_BACKUP_20260722.sql
-- Single change: 'cta_rendered' added. All other event types identical.
-- Verification: test cta_rendered + play_start inserts required after apply.

alter table public.go_listen_events
  drop constraint if exists go_listen_events_event_check;

alter table public.go_listen_events
  add constraint go_listen_events_event_check
  check (event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click', 'cta_rendered'));
