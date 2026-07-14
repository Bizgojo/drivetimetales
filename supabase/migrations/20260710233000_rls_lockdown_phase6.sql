-- ATL-RLS-LOCKDOWN-006 (2026-07-10, Security Advisor export part 5)
-- referral_notifications (0 rows) + story_reviews (0 rows): only server-side
-- routes touch them (service role, verified). RLS on, no client policies.
-- When customer reviews ship, story_reviews gets own-row policies then.
-- (user_library + referral_offers from this export chunk: already covered in
-- phase 1 — verified live: user_library sealed, referral_offers public-read BY
-- DESIGN for the refer page.)
alter table public.referral_notifications enable row level security;
alter table public.story_reviews          enable row level security;
