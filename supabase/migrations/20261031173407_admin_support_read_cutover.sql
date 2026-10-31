-- Orion applies this only with the reviewed Admin code cutover.
-- The old support page reads with the anon key; deploy its server-authenticated replacement first.
-- No inbox content is deleted. Keep this security correction on application rollback.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
-- Fix previously public support inbox read policy. Server Admin reads use service_role.
drop policy if exists "Users can view own messages" on public.support_messages;
create policy "Users can view own messages" on public.support_messages for select to authenticated using ((select auth.uid())=user_id);
