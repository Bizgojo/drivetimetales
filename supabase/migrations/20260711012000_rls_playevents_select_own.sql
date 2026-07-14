-- ATL-RLS-LOCKDOWN-013b: lib/analytics.ts insert uses .select('id') (RETURNING),
-- which requires SELECT on the returned row. Own-row read is harmless.
create policy playevents_select_own on public.play_events
  for select to authenticated using (user_id = auth.uid());
