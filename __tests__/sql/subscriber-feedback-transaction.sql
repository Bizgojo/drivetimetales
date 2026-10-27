-- Integration verification against an initialized ET database.
-- All test records are uncommitted and rolled back. No job or email is sent.
begin;
do $$
declare uid uuid; idea uuid:=gen_random_uuid(); sid uuid; qid text; real_name text;
begin
 select u.id,trim(concat_ws(' ',u.first_name,u.last_name)) into uid,real_name
 from public.users u join auth.users a on a.id=u.id
 where nullif(trim(concat_ws(' ',u.first_name,u.last_name)),'') is not null limit 1;
 select id into sid from public.stories where status='published' and is_hidden=false limit 1;
 if uid is null or sid is null then raise exception 'QA fixtures unavailable'; end if;
 execute 'set local role service_role';
 insert into public.support_messages(id,user_id,name,email,subject,message,status)
 values(idea,uid,'Untrusted alternate name','feedback-qa@example.invalid','[Story Idea] Transaction-only QA',
 jsonb_build_object('genre','Mystery','title','Transaction-only QA','idea','A letter arrives.','consent',true)::text,'new');
 qid:=(public.select_subscriber_story_idea(idea,uid))->>'queue_item_id';
 perform public.select_subscriber_story_idea(idea,uid);
 if (select count(*) from public.story_queue_items where id=qid)<>1 then raise exception 'Duplicate queue entry'; end if;
 if (select contributor_name from public.story_idea_workflows where idea_id=idea)<>real_name then raise exception 'Signup name not used'; end if;
 if exists(select 1 from public.production_jobs where queue_item_id=qid) then raise exception 'Unexpected job started'; end if;
 if (select authorized from public.story_queue_items where id=qid) then raise exception 'Premature dispatch'; end if;
 update public.story_queue_items set total_episodes=2,story_id=sid where id=qid;
 if exists(select 1 from public.story_contributor_credits where idea_id=idea) then raise exception 'Incomplete unit credited'; end if;
 update public.story_queue_items set total_episodes=1 where id=qid;
 perform public.reconcile_subscriber_story_ideas();
 perform public.reconcile_subscriber_story_ideas();
 if (select count(*) from public.story_contributor_credits where idea_id=idea)<>1 then raise exception 'Missing or duplicate credit'; end if;
 if (select count(*) from public.subscriber_notifications where idea_id=idea)<>2 then raise exception 'Missing or duplicate notices'; end if;
 if has_function_privilege('authenticated','public.select_subscriber_story_idea(uuid,uuid)','execute') then raise exception 'Selection exposed to subscribers'; end if;
 if has_table_privilege('anon','public.listener_preferences','select') then raise exception 'Preferences exposed'; end if;
end $$;
rollback;
