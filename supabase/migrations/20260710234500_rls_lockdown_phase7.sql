-- ATL-RLS-LOCKDOWN-007 (2026-07-10, Security Advisor export part 6)
-- subscription_offers/ai_review_analysis/refund_log: empty; refund_log touched
-- only by server-side admin refund route (service role, verified).
-- dtt_settings (1 row key/value app settings, was anon-readable): all 4 code
-- paths are server-side service-role routes (admin settings/support, reviews
-- submit). RLS on, no client policies; service role bypasses.
alter table public.subscription_offers enable row level security;
alter table public.ai_review_analysis  enable row level security;
alter table public.refund_log          enable row level security;
alter table public.dtt_settings        enable row level security;
