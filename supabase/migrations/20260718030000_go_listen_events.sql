-- ATL-GO-LISTEN-001 (2026-07-17) — go_listen_events: first-party listen
-- analytics for the /go ad landing page sample player.
-- ⚠️ NOT APPLIED ANYWHERE YET. This file lives on feat/go-listen-001 only.
-- Marc reviews + applies manually (standing DDL rule). No agent applies DDL.
--
-- PURPOSE: distinguish "listened 60s+ then left" (CTA/layout problem) from
-- "bounced in 5s" (ad-promise mismatch) for the Sunday zero-signup decision.
-- Vercel Analytics gives pageviews only; this table records what the sample
-- audio actually did per anonymous visit.
--
-- PRIVACY: session_id is a random client-generated UUID minted per page
-- visit (crypto.randomUUID) — NOT persisted across days, NOT tied to any
-- user id, cookie, or IP. No PII columns exist; utm_* are our own campaign
-- labels. IPs are used transiently for API rate limiting and never stored.
--
-- EVENT MODEL (one row per event, at-most-once per event type per session,
-- enforced client-side; the unique index below backstops it server-side):
--   play_start — first time the visitor starts the sample
--   pct_25/50/75 — playback position crossed 25/50/75% of the sample
--   complete   — <audio> 'ended' fired
--   cta_click  — visitor clicked a "Start free trial" CTA (sheet or footer)
-- position_seconds = audio position when the event fired (complete ≈ sample
-- length; cta_click = where they were when they clicked).

create table if not exists public.go_listen_events (
  id               bigint generated always as identity primary key,
  session_id       uuid        not null,
  variant          text        not null
                   check (variant in ('a', 'b', 'bare')),
  utm_source       text        check (utm_source   is null or char_length(utm_source)   <= 120),
  utm_campaign     text        check (utm_campaign is null or char_length(utm_campaign) <= 120),
  event            text        not null
                   check (event in ('play_start', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click')),
  position_seconds integer     not null default 0
                   check (position_seconds >= 0 and position_seconds <= 21600),
  created_at       timestamptz not null default now()
);

comment on table public.go_listen_events is
  'ATL-GO-LISTEN-001: anonymous /go sample-player listen events (play_start, 25/50/75% milestones, complete, cta_click). session_id = random per-visit UUID, no PII. Inserted by /api/go-listen (anon key, server-side); read by /api/admin/listen-report.';
comment on column public.go_listen_events.session_id is
  'Random client-generated UUID per page visit (crypto.randomUUID). Not persisted across days; no user linkage.';
comment on column public.go_listen_events.variant is
  'Which story actually served: a | b (live A/B variants) | bare (default/control story — bare /go or unknown ?v=).';
comment on column public.go_listen_events.position_seconds is
  'Audio position (seconds, clamped 0–21600 = 6h) when the event fired.';

-- At-most-once per (session, event) — the client dedupes; this backstops
-- replays/retries so milestone percentages can never exceed 100%.
create unique index if not exists go_listen_events_session_event_uniq
  on public.go_listen_events (session_id, event);

-- Report access patterns: time-windowed scans, per-variant funnels,
-- per-source splits.
create index if not exists go_listen_events_created_at_idx
  on public.go_listen_events (created_at);
create index if not exists go_listen_events_variant_event_idx
  on public.go_listen_events (variant, event);
create index if not exists go_listen_events_utm_source_idx
  on public.go_listen_events (utm_source);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- POLICY CHOICES (documented per ATL-GO-LISTEN-001 spec):
--
-- 1. INSERT for anon — allowed, THIS TABLE ONLY. /go is a public page and
--    the ingest API (/api/go-listen) inserts server-side with the ANON key
--    (never the service key; the service key never ships client-side).
--    The policy's WITH CHECK re-states the shape guarantees so a leaked anon
--    key still cannot insert garbage beyond the CHECK constraints: valid
--    variant/event enums, bounded position, bounded utm lengths, and a
--    created_at that the client cannot backdate/forward-date (must be
--    default now(); we simply require it within a minute of now()).
-- 2. NO SELECT/UPDATE/DELETE for anon or authenticated non-admins — listen
--    events are business telemetry; visitors can write their own events but
--    nobody can read/mutate the stream without admin or service role.
-- 3. SELECT for admins only — same public.is_admin() predicate as
--    ATL-RLS-LOCKDOWN-001 (email allowlist mirrors app/admin/layout.tsx).
--    The admin API route actually reads with the service role (bypasses
--    RLS); this policy exists so admins in the Supabase dashboard / SQL
--    editor with their own JWT can also read.
-- 4. Belt-and-braces REVOKEs: even though RLS already denies, we revoke
--    update/delete outright from client roles so no future permissive
--    policy can accidentally re-open mutation.

alter table public.go_listen_events enable row level security;

drop policy if exists go_listen_events_insert_anon on public.go_listen_events;
create policy go_listen_events_insert_anon on public.go_listen_events
  for insert to anon, authenticated
  with check (
    variant in ('a', 'b', 'bare')
    and event in ('play_start', 'pct_25', 'pct_50', 'pct_75', 'complete', 'cta_click')
    and position_seconds between 0 and 21600
    and (utm_source   is null or char_length(utm_source)   <= 120)
    and (utm_campaign is null or char_length(utm_campaign) <= 120)
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
  );

drop policy if exists go_listen_events_select_admin on public.go_listen_events;
create policy go_listen_events_select_admin on public.go_listen_events
  for select to authenticated
  using (public.is_admin());

-- No update/delete policies for client roles + explicit revoke (see #4).
revoke update, delete on public.go_listen_events from anon, authenticated;
