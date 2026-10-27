-- This observer only acts on explicitly selected subscriber ideas.
-- It does not start jobs, publish stories, modify audio, or change quality gates.
create function public.observe_subscriber_idea_publication()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.story_idea_workflows where status<>'published') then
  perform public.reconcile_subscriber_story_ideas();
 end if;
 return null;
exception when others then
 -- Feedback must never prevent a working publication or production write.
 -- The reconciler endpoint/cron can retry after the transient failure.
 raise warning 'Subscriber idea credit reconciliation deferred: %',SQLERRM;
 return null;
end $$;
revoke all on function public.observe_subscriber_idea_publication() from public,anon,authenticated;
grant execute on function public.observe_subscriber_idea_publication() to service_role;
create trigger subscriber_idea_published after update of status,is_hidden,workflow_state on public.stories for each statement execute function public.observe_subscriber_idea_publication();
create trigger subscriber_idea_job_linked after insert or update of story_id,episode_story_id,series_id on public.production_jobs for each statement execute function public.observe_subscriber_idea_publication();
create trigger subscriber_idea_queue_linked after update of story_id on public.story_queue_items for each statement execute function public.observe_subscriber_idea_publication();
