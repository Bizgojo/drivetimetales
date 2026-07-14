-- ATL-RLS-LOCKDOWN-003 (2026-07-10, Security Advisor export part 2)
-- AnalyticsEvent/Download: empty Prisma-era legacy. ApiKey: 1 row with keyHash +
-- permission flags was ANON-READABLE. test_stories: 84 rows of internal scripts
-- were ANON-READABLE; only server-side admin API routes (service role) use it.
-- Enable RLS with no client policies = deny anon/authenticated; service role bypasses.
alter table public."AnalyticsEvent" enable row level security;
alter table public."ApiKey"         enable row level security;
alter table public."Download"       enable row level security;
alter table public.test_stories     enable row level security;
