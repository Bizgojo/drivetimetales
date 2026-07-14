-- ATL-RLS-LOCKDOWN-014 (2026-07-10, Security Advisor export part 13)
-- character_voice_assignments (590), series_character_roster (267),
-- personalized_intro_openers (100 intro templates): internal production/
-- personalization data, was anon-readable. All references are server-side
-- service-role (run-next, generate-voices, personalizedFinalMix — verified).
-- RLS on, no client policies.
alter table public.character_voice_assignments enable row level security;
alter table public.series_character_roster     enable row level security;
alter table public.personalized_intro_openers  enable row level security;
