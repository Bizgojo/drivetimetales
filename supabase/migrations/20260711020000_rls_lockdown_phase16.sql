-- ATL-RLS-LOCKDOWN-016 (2026-07-10, Security Advisor export part 15)
-- Name-personalization pipeline set, all anon-readable before: name_pools (56),
-- name_opener_clips (5,600 clip rows), name_overrides, user_opener_history
-- (48 rows w/ user_id). All references service-role (asc3 story-playlist client
-- verified L9-11, ensureNamePool, nameKey). RLS on, no client policies.
alter table public.name_pools          enable row level security;
alter table public.name_opener_clips   enable row level security;
alter table public.name_overrides      enable row level security;
alter table public.user_opener_history enable row level security;
