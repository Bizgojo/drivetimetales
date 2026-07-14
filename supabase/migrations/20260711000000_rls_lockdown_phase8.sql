-- ATL-RLS-LOCKDOWN-008 (2026-07-10, Security Advisor export part 7)
-- news_prompts/user_news_intros/welcome_templates: empty; only server-side
-- service-role routes reference them (generate-intros — verified).
-- welcome_audio_clips (30 rows of welcome scripts + audio URLs, was
-- anon-readable): used only by server-side admin generate-welcome-clips +
-- audio stitch routes (service role, verified). RLS on, no client policies.
alter table public.news_prompts        enable row level security;
alter table public.user_news_intros    enable row level security;
alter table public.welcome_audio_clips enable row level security;
alter table public.welcome_templates   enable row level security;
