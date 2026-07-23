-- CTA-INSTRUMENTATION-001 (2026-07-22) — add 'cta_rendered' to the
-- go_listen_events event enum (CHECK constraint + RLS insert policy).
-- ⚠️ NOT APPLIED ANYWHERE YET. Marc reviews + applies manually (standing
-- DDL rule, OPS-CHARTER-001-R1). No agent applies DDL.
--
-- PURPOSE (Susan CTA instrumentation): record the first time the bottom
-- sheet trial CTA becomes visible to the user (ctaRevealed latch at 45s
-- cumulative listening). Separates "saw the CTA but didn't click" from
-- "never even saw the CTA" — a signal Susan needs for conversion
-- optimization work.
--
-- EVENT FIRED: once per session (one-shot ref guard in the page, same
-- pattern as other events). position_seconds = audio position at the
-- moment of reveal. Does NOT fire on completion-pulse or heading changes.
--
-- SHIP ORDER IS SAFE EITHER WAY: the client/API code already whitelists
-- cta_rendered and treats a constraint/policy rejection as a quiet 202,
-- so deploying code before this DDL only means cta_rendered rows are
-- silently dropped until Marc applies it. No table rewrite.
--
-- EVENT MODEL AFTER THIS MIGRATION:
--   play_start · sec_30 · pct_25 · pct_50 · pct_75 · complete · cta_click · cta_rendered

-- 1) CHECK constraint: replace the event enum with the cta_rendered superset.
alter table public.go_listen_events
  drop constraint if exists go_listen_events_event_check;
alter table public.go_listen_events
  add constraint go_listen_events_event_check
  check (event in ('play_start', 'sec_30', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click', 'cta_rendered'));

-- 2) RLS insert policy: same enum superset in WITH CHECK (drop+recreate).
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

-- 3) Keep the table comment honest about the event model.
comment on table public.go_listen_events is
  'ATL-GO-LISTEN-001 + INSTRUM-001 + CTA-INSTRUMENTATION-001: anonymous /go sample-player listen events (play_start, sec_30 depth, 25/50/75% milestones, complete, cta_click, cta_rendered). session_id = random per-visit UUID, no PII. Inserted by /api/go-listen (anon key, server-side); read by /api/admin/listen-report.';
