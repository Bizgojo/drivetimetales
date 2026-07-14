-- ADMIN-MKT-001 prerequisite (Marc, 2026-07-14): ad-level attribution.
-- utm_term (ad set) + utm_content (ad) were carried in /go → /signup URLs
-- but never persisted — users table only stored source/medium/campaign.
-- Day-1 per-ad dashboard attribution requires these before ads go live.
alter table public.users add column if not exists utm_term text;
alter table public.users add column if not exists utm_content text;
comment on column public.users.utm_term is 'Ad set slug from utm_term at signup (e.g. gvl-broad-202607)';
comment on column public.users.utm_content is 'Ad creative slug from utm_content at signup (e.g. falls-park-murder-v1)';
