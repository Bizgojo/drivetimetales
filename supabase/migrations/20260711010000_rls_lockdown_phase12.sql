-- ATL-RLS-LOCKDOWN-012 (2026-07-10, Security Advisor export part 11)
-- style_references (26 rows internal creative style bios), active_missions
-- (internal ops/learning-system missions; missionContext takes injected
-- service-role client), story_belle_personalized_cache (11 rows with user_id +
-- preferred_name + personalized audio — PII, was anon-readable; personalization
-- pipeline is service-role). No client-side code references any of them.
alter table public.style_references               enable row level security;
alter table public.story_belle_personalized_cache enable row level security;
alter table public.active_missions                enable row level security;
