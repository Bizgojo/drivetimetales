-- ATL-RLS-LOCKDOWN-005 (2026-07-10, Security Advisor export part 4)
-- user_intro_cache (0 rows), wishlists (0 rows), checklist_overrides (39 rows of
-- internal ops-task status, was anon-readable). Zero client-side code references
-- (app/lib/components grepped); any pipeline usage is service-role (bypasses RLS).
-- If wishlists ships as a customer feature later, add own-row policies then.
alter table public.user_intro_cache    enable row level security;
alter table public.checklist_overrides enable row level security;
alter table public.wishlists           enable row level security;
