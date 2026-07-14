-- ATL-RLS-LOCKDOWN-001 (2026-07-10, Marc GO per standing waiver)
-- Behavioral audit found: anon key could read all user emails, update any users
-- row (incl. self-granting subscription_type=active), update stories, and
-- read+update promo_codes. This migration replaces permissive policies with
-- least-privilege ones, admin-gated by the SAME email allowlist as
-- app/admin/layout.tsx (client UI gate was the only gate; now the DB enforces).
-- Service-role (workers, API routes, webhook) BYPASSES RLS — unaffected.

-- ── Admin predicate (mirrors app/admin/layout.tsx ADMIN_EMAILS) ──────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt()->>'email','')) in (
    'marc@endless-tales.com',
    'hello.endlesstales@gmail.com',
    'williampostlewaite@icloud.com',
    'm.postlewaite@gmail.com'
  )
$$;

-- ── Clean slate: drop ALL existing policies on the tables we govern ─────────
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'users','promo_codes','stories','referral_offers','referrals',
        'user_library','user_follows','partners','partner_agreements',
        'partner_events','partner_materials','partner_payouts',
        'authors','narrator_voices','social_posts'
      )
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ── Enable RLS everywhere we govern (idempotent) ─────────────────────────────
alter table public.users              enable row level security;
alter table public.promo_codes        enable row level security;
alter table public.stories            enable row level security;
alter table public.referral_offers    enable row level security;
alter table public.referrals          enable row level security;
alter table public.user_library       enable row level security;
alter table public.user_follows       enable row level security;
alter table public.partners           enable row level security;
alter table public.partner_agreements enable row level security;
alter table public.partner_events    enable row level security;
alter table public.partner_materials enable row level security;
alter table public.partner_payouts   enable row level security;
alter table public.authors            enable row level security;
alter table public.narrator_voices    enable row level security;
alter table public.social_posts       enable row level security;

-- ── users: own row (or admin). No client INSERT/DELETE. ─────────────────────
create policy users_select_own_or_admin on public.users
  for select to authenticated
  using (auth.uid() = id or public.is_admin());

create policy users_update_own_or_admin on public.users
  for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Privileged-column guard: authenticated non-admin may not touch billing/
-- entitlement/identity columns even on their own row. Service role and
-- direct connections (auth.role() not in anon/authenticated) pass through.
create or replace function public.guard_users_privileged_cols()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(),'') <> 'authenticated' then
    return new; -- service_role / postgres / migrations
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.id                     is distinct from old.id
   or new.email                  is distinct from old.email
   or new.created_at             is distinct from old.created_at
   or new.plan                   is distinct from old.plan
   or new.subscription_type      is distinct from old.subscription_type
   or new.subscription_ends_at   is distinct from old.subscription_ends_at
   or new.subscription_start     is distinct from old.subscription_start
   or new.subscription_plan      is distinct from old.subscription_plan
   or new.subscription_offer_id  is distinct from old.subscription_offer_id
   or new.billing_cycle          is distinct from old.billing_cycle
   or new.credits                is distinct from old.credits
   or new.credits_total          is distinct from old.credits_total
   or new.stripe_customer_id     is distinct from old.stripe_customer_id
   or new.stripe_subscription_id is distinct from old.stripe_subscription_id
   or new.is_founding_member     is distinct from old.is_founding_member
   or new.first_paid_date        is distinct from old.first_paid_date
   or new.cancelled_at           is distinct from old.cancelled_at
   or new.referral_credits_earned is distinct from old.referral_credits_earned
   or new.referral_count         is distinct from old.referral_count
   or new.referral_tier          is distinct from old.referral_tier
  then
    raise exception 'privileged column update denied';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_users_privileged_cols on public.users;
create trigger trg_guard_users_privileged_cols
  before update on public.users
  for each row execute function public.guard_users_privileged_cols();

-- ── promo_codes: admin only (public validation goes via service-role API) ───
create policy promo_admin_select on public.promo_codes
  for select to authenticated using (public.is_admin());
create policy promo_admin_insert on public.promo_codes
  for insert to authenticated with check (public.is_admin());
create policy promo_admin_update on public.promo_codes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy promo_admin_delete on public.promo_codes
  for delete to authenticated using (public.is_admin());

-- ── stories: public read (catalog/player/guest); admin-only writes ──────────
create policy stories_select_public on public.stories
  for select to anon, authenticated using (true);
create policy stories_admin_insert on public.stories
  for insert to authenticated with check (public.is_admin());
create policy stories_admin_update on public.stories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy stories_admin_delete on public.stories
  for delete to authenticated using (public.is_admin());

-- ── referral_offers: public read (refer page lists offers); admin writes ────
create policy refoffers_select_public on public.referral_offers
  for select to anon, authenticated using (true);
create policy refoffers_admin_insert on public.referral_offers
  for insert to authenticated with check (public.is_admin());
create policy refoffers_admin_update on public.referral_offers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy refoffers_admin_delete on public.referral_offers
  for delete to authenticated using (public.is_admin());

-- ── referrals: referrer owns their rows; admin everything ───────────────────
create policy referrals_select_own_or_admin on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or public.is_admin());
create policy referrals_insert_own_or_admin on public.referrals
  for insert to authenticated
  with check (referrer_id = auth.uid() or public.is_admin());
create policy referrals_update_own_or_admin on public.referrals
  for update to authenticated
  using (referrer_id = auth.uid() or public.is_admin())
  with check (referrer_id = auth.uid() or public.is_admin());

-- ── user_library / user_follows: own rows only (+ admin read) ───────────────
create policy userlib_all_own on public.user_library
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy userlib_admin_select on public.user_library
  for select to authenticated using (public.is_admin());

create policy userfollows_all_own on public.user_follows
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy userfollows_admin_select on public.user_follows
  for select to authenticated using (public.is_admin());

-- ── partners: public read (landing attribution display); admin writes ───────
create policy partners_select_public on public.partners
  for select to anon, authenticated using (true);
create policy partners_admin_insert on public.partners
  for insert to authenticated with check (public.is_admin());
create policy partners_admin_update on public.partners
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy partners_admin_delete on public.partners
  for delete to authenticated using (public.is_admin());

-- ── partner_* satellite tables: admin only ──────────────────────────────────
create policy pagree_admin_all on public.partner_agreements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pevents_admin_all on public.partner_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pmat_admin_all on public.partner_materials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ppay_admin_all on public.partner_payouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── authors / narrator_voices: public read; admin writes ────────────────────
create policy authors_select_public on public.authors
  for select to anon, authenticated using (true);
create policy authors_admin_insert on public.authors
  for insert to authenticated with check (public.is_admin());
create policy authors_admin_update on public.authors
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy authors_admin_delete on public.authors
  for delete to authenticated using (public.is_admin());

create policy narrators_select_public on public.narrator_voices
  for select to anon, authenticated using (true);
create policy narrators_admin_insert on public.narrator_voices
  for insert to authenticated with check (public.is_admin());
create policy narrators_admin_update on public.narrator_voices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy narrators_admin_delete on public.narrator_voices
  for delete to authenticated using (public.is_admin());

-- ── social_posts: admin only ─────────────────────────────────────────────────
create policy social_admin_all on public.social_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
