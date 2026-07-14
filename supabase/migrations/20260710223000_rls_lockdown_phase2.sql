-- ATL-RLS-LOCKDOWN-002 (2026-07-10, Marc: fold Security Advisor export into tonight's scope)
-- Phase 2: legacy tables without RLS + SECURITY DEFINER views.
-- Advisor findings: public.Story/User/WishlistItem/Coupon/CouponUse (Prisma-era
-- legacy, no RLS), user_preferences (own-row policies existed but RLS never
-- enabled = dormant), 10 SECURITY DEFINER views — worst: user_offer_assignments
-- leaked email/first_name/display_name/referral_code of every user to anon.

-- ── Legacy PascalCase tables: enable RLS, no client policies = deny all ─────
alter table public."Story"        enable row level security;
alter table public."User"         enable row level security;
alter table public."WishlistItem" enable row level security;
alter table public."Coupon"       enable row level security;
alter table public."CouponUse"    enable row level security;

-- Legacy Story had a public-read policy; drop it (table is dead legacy).
drop policy if exists "Public can read Story" on public."Story";

-- ── user_preferences: enabling RLS activates its existing own-row policies ──
-- Policies already present: "Users can view/insert/update/delete own preferences"
alter table public.user_preferences enable row level security;

-- ── Views: run with caller's rights instead of creator's (clears advisor
--    security_definer_view; underlying RLS policies now govern) ──────────────
alter view public.referral_stats              set (security_invoker = on);
alter view public.user_offer_assignments      set (security_invoker = on);
alter view public.referral_leaderboard        set (security_invoker = on);
alter view public.stories_with_free_status    set (security_invoker = on);
alter view public.referral_stats_by_offer     set (security_invoker = on);
alter view public.referral_platform_stats     set (security_invoker = on);
alter view public.flag_analytics              set (security_invoker = on);
alter view public.subscription_stats_by_offer set (security_invoker = on);
alter view public.story_analytics             set (security_invoker = on);
alter view public.story_production_summary    set (security_invoker = on);

-- ── Belt-and-suspenders: anon has no business reading admin/internal views
--    even where underlying sources are public (e.g. stories-derived aggregates).
--    Customer-facing views story_analytics + referral_leaderboard stay granted.
revoke select on public.referral_stats              from anon;
revoke select on public.user_offer_assignments      from anon;
revoke select on public.stories_with_free_status    from anon;
revoke select on public.referral_stats_by_offer     from anon;
revoke select on public.referral_platform_stats     from anon;
revoke select on public.flag_analytics              from anon;
revoke select on public.subscription_stats_by_offer from anon;
revoke select on public.story_production_summary    from anon;

-- PII hard-stop: user_offer_assignments carries emails — non-admin authenticated
-- users must not read it either. Underlying invoker RLS already gates it to
-- admins (users/referrals/referral_offers policies), so no grant change needed
-- for authenticated; admin pages keep working via is_admin() policies.
