-- FINANCE-STATEMENT-005: script length for every episode (not only published ones), so voice cost
-- can be split across episodes finished but not yet released.
create or replace view public.finance_story_chars with (security_invoker = true) as
  select id, length(coalesce(script, '')) as chars from public.stories where status <> 'cold_storage';
revoke all on public.finance_story_chars from anon, authenticated;
