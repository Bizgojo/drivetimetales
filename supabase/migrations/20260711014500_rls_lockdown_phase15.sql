-- ATL-RLS-LOCKDOWN-015 (2026-07-10, Security Advisor export part 14)
-- user_intro_opener_clips (empty), name_pool_jobs (57 rows — user first-name
-- pronunciation jobs, mild PII, was anon-readable), genre_tone_cluster (21-row
-- taxonomy; asc3 playlist route reads via service-role client — verified L9-11),
-- personalize_debug (user_id + error traces, was anon-readable). All references
-- service-role (personalizedFinalMix, ensureNamePool). RLS on, no client policies.
alter table public.user_intro_opener_clips enable row level security;
alter table public.name_pool_jobs          enable row level security;
alter table public.genre_tone_cluster      enable row level security;
alter table public.personalize_debug       enable row level security;
