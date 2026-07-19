-- INSTRUM-001 / UX-GO-001 (2026-07-19) — add 'sec_30' to the
-- go_listen_events event enum (CHECK constraint + RLS insert policy).
-- ⚠️ NOT APPLIED ANYWHERE YET. Marc reviews + applies manually (standing
-- DDL rule, OPS-CHARTER-001-R1). No agent applies DDL.
--
-- PURPOSE (Susan FUNNEL-DIAG-001 v2): pct_25 of the ~12.6-min Grave sample
-- is ~189s, so today the funnel is blind between play_start (0s) and 189s —
-- exactly where ad-traffic bounce behavior lives. sec_30 records that
-- playback position crossed 30 seconds (absolute, duration-independent),
-- splitting "bounced in seconds" from "listened 30s+ then left".
--
-- SHIP ORDER IS SAFE EITHER WAY: the client/API code (same commit) already
-- whitelists sec_30 and treats a constraint/policy rejection as a quiet 202,
-- so deploying code before this DDL only means sec_30 rows are dropped until
-- Marc applies it. Applying this DDL before the code deploy is equally safe
-- (no code writes sec_30 yet). No table rewrite; both statements are
-- metadata-only + constraint validation of existing rows (all existing rows
-- pass — the new enum is a strict superset).
--
-- EVENT MODEL AFTER THIS MIGRATION:
--   play_start · sec_30 · pct_25 · pct_50 · pct_75 · complete · cta_click

-- 1) CHECK constraint: replace the event enum with the sec_30 superset.
--    (go_listen_events_event_check is the auto-generated name of the inline
--    column CHECK in 20260718030000_go_listen_events.sql; verify with
--    \d+ public.go_listen_events if in doubt.)
alter table public.go_listen_events
  drop constraint if exists go_listen_events_event_check;
alter table public.go_listen_events
  add constraint go_listen_events_event_check
  check (event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click'));

-- 2) RLS insert policy: same enum superset in WITH CHECK (drop+recreate —
--    identical to the original policy except the event list).
drop policy if exists go_listen_events_insert_anon on public.go_listen_events;
create policy go_listen_events_insert_anon on public.go_listen_events
  for insert to anon, authenticated
  with check (
    variant in ('a', 'b', 'bare')
    and event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click')
    and position_seconds between 0 and 21600
    and (utm_source   is null or char_length(utm_source)   <= 120)
    and (utm_campaign is null or char_length(utm_campaign) <= 120)
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
  );

-- 3) Keep the table comment honest about the event model.
comment on table public.go_listen_events is
  'ATL-GO-LISTEN-001 + INSTRUM-001: anonymous /go sample-player listen events (play_start, sec_30 depth, 25/50/75% milestones, complete, cta_click). session_id = random per-visit UUID, no PII. Inserted by /api/go-listen (anon key, server-side); read by /api/admin/listen-report.';
