-- ATL-RLS-LOCKDOWN-004 (2026-07-10, Security Advisor export part 3)
-- news_delivery_queue/news_access: empty, no client usage (news gen is server lib).
-- intro_outro_templates (120 rows) + narrator_audio (300 rows): internal
-- personalization assets, were anon-readable; only server-side admin seed route
-- (service role, verified) touches them. RLS on, no client policies.
alter table public.news_delivery_queue   enable row level security;
alter table public.intro_outro_templates enable row level security;
alter table public.narrator_audio        enable row level security;
alter table public.news_access           enable row level security;
