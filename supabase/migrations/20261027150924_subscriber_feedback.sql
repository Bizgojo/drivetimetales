-- Additive subscriber feedback records. No production jobs are started here.
create table public.listener_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  genres text[] not null default '{}', interests text not null default '', avoid text not null default '',
  preferred_minutes integer not null default 0 check (preferred_minutes in (0,15,30,60)),
  updated_at timestamptz not null default now(),
  check (char_length(interests)<=500 and char_length(avoid)<=500 and cardinality(genres)<=12)
);
alter table public.listener_preferences enable row level security;
revoke all on public.listener_preferences from anon, authenticated;
grant select on public.listener_preferences to authenticated;
grant all on public.listener_preferences to service_role;
create policy listener_preferences_self on public.listener_preferences for select to authenticated using ((select auth.uid())=user_id);

-- Preserve preferences saved by the previous test-site version.
insert into public.listener_preferences(user_id,genres,interests,avoid,preferred_minutes)
select id,
 case when jsonb_typeof(raw_user_meta_data->'listening_preferences'->'genres')='array'
 then array(select value from jsonb_array_elements_text(raw_user_meta_data->'listening_preferences'->'genres') as t(value) limit 12) else '{}'::text[] end,
 left(coalesce(raw_user_meta_data->'listening_preferences'->>'interests',''),500),
 left(coalesce(raw_user_meta_data->'listening_preferences'->>'avoid',''),500),
 case when raw_user_meta_data->'listening_preferences'->>'minutes' in ('15','30','60') then (raw_user_meta_data->'listening_preferences'->>'minutes')::int else 0 end
from auth.users where jsonb_typeof(raw_user_meta_data->'listening_preferences')='object'
on conflict(user_id) do nothing;

create table public.story_idea_workflows (
 idea_id uuid primary key references public.support_messages(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 contributor_name text not null, queue_item_id text unique references public.story_queue_items(id) on delete restrict,
 status text not null default 'selected' check (status in ('selected','writing','published')),
 selected_by uuid not null references auth.users(id), selected_at timestamptz not null default now(), published_at timestamptz
);
alter table public.story_idea_workflows enable row level security;
revoke all on public.story_idea_workflows from anon,authenticated;
grant all on public.story_idea_workflows to service_role;
create index story_idea_workflows_user on public.story_idea_workflows(user_id);

create table public.story_contributor_credits (
 story_id uuid not null references public.stories(id) on delete cascade,
 idea_id uuid not null references public.story_idea_workflows(idea_id) on delete restrict,
 contributor_name text not null, created_at timestamptz not null default now(), primary key(story_id,idea_id)
);
alter table public.story_contributor_credits enable row level security;
revoke all on public.story_contributor_credits from anon,authenticated;
grant all on public.story_contributor_credits to service_role;

create table public.subscriber_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 idea_id uuid not null references public.story_idea_workflows(idea_id) on delete restrict,
 kind text not null check (kind in ('idea_selected','idea_published')), subject text not null, message text not null,
 story_id uuid references public.stories(id), created_at timestamptz not null default now(), read_at timestamptz,
 email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
 email_sent_at timestamptz, email_error text, unique(idea_id,kind)
);
alter table public.subscriber_notifications enable row level security;
revoke all on public.subscriber_notifications from anon,authenticated;
grant select on public.subscriber_notifications to authenticated;
grant all on public.subscriber_notifications to service_role;
create policy subscriber_notifications_self on public.subscriber_notifications for select to authenticated using ((select auth.uid())=user_id);
create index subscriber_notifications_user on public.subscriber_notifications(user_id,created_at desc);

create or replace function public.select_subscriber_story_idea(p_idea_id uuid,p_selected_by uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare submission public.support_messages%rowtype; content jsonb; credited_name text; queue_id text; workflow public.story_idea_workflows%rowtype;
begin
 select * into submission from public.support_messages where id=p_idea_id and subject like '[Story Idea]%' for update;
 if not found then raise exception 'Story idea not found'; end if;
 select * into workflow from public.story_idea_workflows where idea_id=p_idea_id;
 if found then return to_jsonb(workflow); end if;
 content:=submission.message::jsonb;
 if coalesce(content->>'consent','false')<>'true' then raise exception 'Recorded adaptation and credit consent is required before selection'; end if;
 select nullif(trim(concat_ws(' ',first_name,last_name)),'') into credited_name from public.users where id=submission.user_id;

 if credited_name is null then raise exception 'Subscriber signup name is missing'; end if;
 queue_id:='subscriber_idea_'||p_idea_id::text;
 insert into public.story_queue_items(id,title,premise,primary_genre,duration,total_episodes,notes,authorized,released_to_hal,status)
 values(queue_id,content->>'title',content->>'idea',content->>'genre','15–20 min',1,
 'Subscriber idea: '||p_idea_id::text||E'\nContributing author: '||credited_name||E'\nKeep this source link and credit through publication. Follow the standard blueprint and quality gates.',false,false,'queued');
 insert into public.story_idea_workflows(idea_id,user_id,contributor_name,queue_item_id,selected_by)
 values(p_idea_id,submission.user_id,credited_name,queue_id,p_selected_by) returning * into workflow;
 update public.support_messages set status='answered' where id=p_idea_id;
 insert into public.subscriber_notifications(user_id,idea_id,kind,subject,message)
 values(submission.user_id,p_idea_id,'idea_selected','Your story idea has been selected!',
 'We selected “'||(content->>'title')||'” for development. We’ll credit you as a contributing author using your signup name, '||credited_name||', if the story is published. We’ll let you know when it is ready to enjoy.');
 return to_jsonb(workflow);
end $$;
revoke all on function public.select_subscriber_story_idea(uuid,uuid) from public,anon,authenticated;
grant execute on function public.select_subscriber_story_idea(uuid,uuid) to service_role;

-- Reconcile by stable queue/job IDs, never by a matching story title.
create or replace function public.reconcile_subscriber_story_ideas()
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare w record; ids uuid[]; expected integer; published_count integer; first_story uuid; n integer:=0;
begin
 for w in select f.*,q.story_id,q.total_episodes from public.story_idea_workflows f join public.story_queue_items q on q.id=f.queue_item_id where f.status<>'published' loop
 select array_agg(distinct s.id) into ids from public.stories s where
 s.id=w.story_id or exists(select 1 from public.production_jobs j where j.queue_item_id=w.queue_item_id and (s.id=j.story_id or s.id=j.episode_story_id or (j.series_id is not null and s.series_id=j.series_id)));
 if coalesce(cardinality(ids),0)=0 then continue; end if;
 update public.story_idea_workflows set status='writing' where idea_id=w.idea_id;
 expected:=greatest(coalesce(w.total_episodes,1),1);
 select count(*) into published_count from public.stories where id=any(ids) and status='published' and is_hidden=false;
 if published_count<expected or published_count<>cardinality(ids) then continue; end if;
 insert into public.story_contributor_credits(story_id,idea_id,contributor_name) select unnest(ids),w.idea_id,w.contributor_name on conflict do nothing;
 select id into first_story from public.stories where id=any(ids) order by episode_number nulls last,id limit 1;
 insert into public.subscriber_notifications(user_id,idea_id,kind,subject,message,story_id)
 values(w.user_id,w.idea_id,'idea_published','Your story is ready to enjoy!',
 'The story inspired by your idea is now published. You are credited as a contributing author: '||w.contributor_name||'. Thank you for sharing your idea with Endless Tales.',first_story) on conflict(idea_id,kind) do nothing;
 update public.story_idea_workflows set status='published',published_at=now() where idea_id=w.idea_id;
 n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.reconcile_subscriber_story_ideas() from public,anon,authenticated;
grant execute on function public.reconcile_subscriber_story_ideas() to service_role;
