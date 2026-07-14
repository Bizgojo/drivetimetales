-- ATL-RLS-LOCKDOWN-010 (2026-07-10, Security Advisor export part 9)
-- promo_redemptions: 25 rows incl. USER EMAILS were anon-readable. Only
-- server-side promo redeem/magic-link routes touch it (service role, verified).
alter table public.promo_redemptions enable row level security;

-- partners: phase 1 left public read for "landing attribution display", but the
-- row carries partner email/phone/notes/address, and NO client path needs it:
-- landing reads go via /api/partner/name + /api/partner/track (service role),
-- admin page is covered by is_admin(). Tighten to admin-only read.
drop policy if exists partners_select_public on public.partners;
create policy partners_admin_select on public.partners
  for select to authenticated using (public.is_admin());
