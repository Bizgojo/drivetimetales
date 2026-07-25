-- RLS-FIX-001 (2026-07-24 12:00 UTC): sync go_listen_events_insert_anon policy
-- with current CHECK constraint event list.
-- Root cause: sec_30/preview_*/cta_rendered/page_view migrations updated the
-- CHECK constraint but never updated the RLS INSERT policy event whitelist.
-- All new events silently 202'd (RLS 42501 → 202 per route design).
-- Standing auth: Production Supabase SQL autonomous (CHARTER AMENDMENT 2026-07-08).

drop policy if exists go_listen_events_insert_anon on public.go_listen_events;
create policy go_listen_events_insert_anon on public.go_listen_events
  for insert to anon, authenticated
  with check (
    variant in ('a', 'b', 'bare')
    and event in (
      'play_start',
      'sec_30',
      'pct_25',
      'pct_50',
      'pct_75',
      'complete',
      'cta_click',
      'preview_started',
      'preview_completed',
      'preview_unmuted',
      'preview_to_play',
      'preview_skipped',
      'cta_rendered',
      'page_view'
    )
    and position_seconds between 0 and 21600
    and (utm_source   is null or char_length(utm_source)   <= 120)
    and (utm_campaign is null or char_length(utm_campaign) <= 120)
    and created_at between now() - interval '1 minute' and now() + interval '5 minutes'
  );
