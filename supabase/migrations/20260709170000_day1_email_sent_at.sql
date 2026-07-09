-- RETENTION-PATH-001: day-1 home-screen-install email dedupe marker.
-- The daily trial-emails cron scans users created 24-48h ago with
-- day1_email_sent_at IS NULL, sends the install email, then stamps this column.
alter table public.users
  add column if not exists day1_email_sent_at timestamptz;

comment on column public.users.day1_email_sent_at is
  'When the day-1 home-screen install email was sent (RETENTION-PATH-001). NULL = not sent yet.';
