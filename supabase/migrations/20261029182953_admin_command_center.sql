-- Additive Admin state. No pipeline mutation, spending, or bank transfer functions.
create table public.admin_center_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
 action text not null, target text not null, before_json jsonb, after_json jsonb, created_at timestamptz not null default now()
);
create table public.admin_center_policy (
 id boolean primary key default true check(id), version integer not null default 1,
 policy jsonb not null default '{"marketingPercent":75,"essential":0,"taxes":0,"reserve":0,"committedMarketing":4000}',
 verified boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.admin_center_policy(id) values(true);
create table public.admin_center_events (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 kind text not null check(kind in ('voice','published','funding','campaign')),
 title text not null, explanation text not null, href text not null check(href ~ '^/admin([/?#]|$)' and position(chr(92) in href)=0),
 urgent boolean not null default false, sting_url text, belle_url text, created_at timestamptz not null default now()
);
create table public.admin_center_reads (
 user_id uuid not null references auth.users(id) on delete cascade, event_id uuid not null references public.admin_center_events(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(user_id,event_id)
);
create table public.admin_center_alert_settings (
 user_id uuid primary key references auth.users(id) on delete cascade, audio boolean not null default false,
 quiet_start integer not null default 21 check(quiet_start between 0 and 23), quiet_end integer not null default 8 check(quiet_end between 0 and 23),
 timezone text not null default 'America/New_York', updated_at timestamptz not null default now()
);
create table public.admin_center_replies (
 message_id uuid primary key references public.support_messages(id), actor_id uuid not null references auth.users(id),
 body text not null, status text not null check(status in ('pending','accepted','failed')),
 provider_id text, provider_status integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- No client grants: all access goes through authenticated Admin server endpoints.
do $$ declare t text; begin
 foreach t in array array['admin_center_audit','admin_center_policy','admin_center_events','admin_center_reads','admin_center_alert_settings','admin_center_replies'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.admin_center_update_policy(p_actor uuid,p_expected_version integer,p_policy jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old_row public.admin_center_policy; new_row public.admin_center_policy;
begin
 select * into old_row from public.admin_center_policy where id=true for update;
 if old_row.version<>p_expected_version then raise exception 'Policy changed'; end if;
 if not (p_policy ?& array['marketingPercent','essential','taxes','reserve','committedMarketing']) then raise exception 'Invalid policy'; end if;
 update public.admin_center_policy set policy=p_policy,version=version+1,verified=false,updated_at=now() where id=true returning * into new_row;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'policy.update','finance',to_jsonb(old_row),to_jsonb(new_row));
 return to_jsonb(new_row);
end $$;
create function public.admin_center_claim_reply(p_message uuid,p_actor uuid,p_body text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.admin_center_replies;
begin
 insert into public.admin_center_replies(message_id,actor_id,body,status) values(p_message,p_actor,p_body,'pending') on conflict do nothing;
 if found then
 insert into public.admin_center_audit(actor_id,action,target,after_json) values(p_actor,'reply.approved',p_message::text,jsonb_build_object('body',p_body));
 return true; end if;
 select * into r from public.admin_center_replies where message_id=p_message for update;
 -- Resend idempotency retention is 24h. Never automatically retry after expiry.
 if r.status='failed' and r.body=p_body and r.created_at>now()-interval '23 hours' then
 update public.admin_center_replies set status='pending',updated_at=now() where message_id=p_message; return true; end if;
 return false;
end $$;
create function public.admin_center_finish_reply(p_message uuid,p_actor uuid,p_provider_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.admin_center_replies;
begin
 select * into strict r from public.admin_center_replies where message_id=p_message for update;
 update public.admin_center_replies set status='accepted',provider_id=p_provider_id,updated_at=now() where message_id=p_message;
 update public.support_messages set status='answered',admin_response=r.body,responded_at=now() where id=p_message;
 insert into public.admin_center_audit(actor_id,action,target,after_json) values(p_actor,'reply.provider_accepted',p_message::text,jsonb_build_object('providerId',p_provider_id));
end $$;
revoke all on function public.admin_center_update_policy(uuid,integer,jsonb), public.admin_center_claim_reply(uuid,uuid,text), public.admin_center_finish_reply(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_center_update_policy(uuid,integer,jsonb), public.admin_center_claim_reply(uuid,uuid,text), public.admin_center_finish_reply(uuid,uuid,text) to service_role;
-- Fix previously public support inbox read policy. Server Admin reads use service_role.
drop policy if exists "Users can view own messages" on public.support_messages;
create policy "Users can view own messages" on public.support_messages for select to authenticated using ((select auth.uid())=user_id);
create table public.admin_center_campaigns (
 id uuid primary key default gen_random_uuid(),name text not null,audience text not null,body text not null,
 media_url text not null,landing_url text not null,budget_usd numeric not null check(budget_usd>0 and budget_usd<=4000),
 status text not null default 'draft' check(status in ('draft','awaiting_approval','approved','rejected')),
 created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),
 approved_at timestamptz,launch_enabled boolean not null default false check(not launch_enabled),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.admin_center_campaigns enable row level security;
revoke all on public.admin_center_campaigns from anon,authenticated;
grant all on public.admin_center_campaigns to service_role;
create function public.admin_center_campaign_decision(p_id uuid,p_actor uuid,p_action text) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.admin_center_campaigns; commitments numeric;
begin
 -- Serialize approvals so simultaneous approvals cannot exceed the test envelope.
 perform pg_advisory_xact_lock(42020261029);
 select * into strict c from public.admin_center_campaigns where id=p_id for update;
 if p_action not in ('awaiting_approval','approved','rejected') then raise exception 'Invalid action'; end if;
 if p_action='awaiting_approval' and c.status<>'draft' then raise exception 'Draft required'; end if;
 if p_action in ('approved','rejected') and c.status<>'awaiting_approval' then raise exception 'Review required'; end if;
 select coalesce(sum(budget_usd),0) into commitments from public.admin_center_campaigns where status='approved' and id<>p_id;
 if p_action='approved' and commitments+c.budget_usd>4000 then raise exception 'Test envelope exceeded'; end if;
 update public.admin_center_campaigns set status=p_action,approved_by=case when p_action='approved' then p_actor else null end,approved_at=case when p_action='approved' then now() else null end,updated_at=now() where id=p_id;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'campaign.'||p_action,p_id::text,to_jsonb(c),jsonb_build_object('status',p_action,'launchEnabled',false));
end $$;
revoke all on function public.admin_center_campaign_decision(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_center_campaign_decision(uuid,uuid,text) to service_role;
create function public.admin_center_campaign_insert_audit() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 insert into public.admin_center_audit(actor_id,action,target,after_json) values(new.created_by,'campaign.create',new.id::text,to_jsonb(new)); return new;
end $$;
revoke all on function public.admin_center_campaign_insert_audit() from public,anon,authenticated;
create trigger admin_center_campaign_insert_audit after insert on public.admin_center_campaigns for each row execute function public.admin_center_campaign_insert_audit();
create table public.admin_center_push_subscriptions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null,subscription jsonb not null,created_at timestamptz not null default now()
);
create table public.admin_center_push_deliveries (
 id uuid primary key default gen_random_uuid(),subscription_id uuid not null references public.admin_center_push_subscriptions(id) on delete cascade,
 event_id uuid not null references public.admin_center_events(id) on delete cascade,status text not null check(status in ('pending','accepted','failed')),
 provider_status integer,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(subscription_id,event_id)
);
alter table public.admin_center_push_subscriptions enable row level security;
alter table public.admin_center_push_deliveries enable row level security;
revoke all on public.admin_center_push_subscriptions,public.admin_center_push_deliveries from anon,authenticated;
grant all on public.admin_center_push_subscriptions,public.admin_center_push_deliveries to service_role;
create table public.admin_center_finance_entries (
 id uuid primary key default gen_random_uuid(),period date not null,category text not null check(category in ('Story Production','Marketing','R&D','Operations')),
 kind text not null check(kind in ('budget','cash_paid','invoice','usage_estimate','credit_purchase')),
 amount_usd numeric not null check(amount_usd>=0),vendor text not null,reference text not null,
 source_key text unique not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.admin_center_finance_entries enable row level security;
revoke all on public.admin_center_finance_entries from anon,authenticated;
grant all on public.admin_center_finance_entries to service_role;
create function public.admin_center_finance_insert_audit() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 insert into public.admin_center_audit(actor_id,action,target,after_json) values(new.actor_id,'finance.record',new.id::text,to_jsonb(new));return new;
end $$;
revoke all on function public.admin_center_finance_insert_audit() from public,anon,authenticated;
create trigger admin_center_finance_insert_audit after insert on public.admin_center_finance_entries for each row execute function public.admin_center_finance_insert_audit();
create table public.admin_center_acknowledgments (
 message_id uuid primary key references public.support_messages(id),status text not null check(status in ('pending','accepted','failed')),
 provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.admin_center_acknowledgments enable row level security;
revoke all on public.admin_center_acknowledgments from anon,authenticated;
grant all on public.admin_center_acknowledgments to service_role;
alter table public.admin_center_policy add column verification_reference text,add column verified_at timestamptz,add column verified_by uuid references auth.users(id);
create function public.admin_center_verify_policy(p_actor uuid,p_expected_version integer,p_reference text) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.admin_center_policy;
begin
 select * into strict c from public.admin_center_policy where id=true for update;
 if c.version<>p_expected_version or length(trim(p_reference))<5 then raise exception 'Policy version or evidence invalid';end if;
 update public.admin_center_policy set verified=true,verification_reference=p_reference,verified_at=now(),verified_by=p_actor where id=true;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'policy.commitments_attested','finance',to_jsonb(c),jsonb_build_object('version',c.version,'evidence',p_reference));
end $$;
revoke all on function public.admin_center_verify_policy(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.admin_center_verify_policy(uuid,integer,text) to service_role;
create function public.admin_center_approve_voice(p_id uuid,p_actor uuid,p_requested_at text) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.production_jobs;
begin
 select * into strict j from public.production_jobs where id=p_id for update;
 if j.status is distinct from 'waiting_for_external' or j.error_json->>'kind' is distinct from 'awaiting_cast_approval' or j.state_json->'castReview'->>'requestedAt' is distinct from p_requested_at or j.state_json->'castReview'->>'approvedAt' is not null or j.locked_at is not null or j.locked_by is not null then raise exception 'No current unlocked cast review';end if;
 update public.production_jobs set state_json=jsonb_set(j.state_json,'{castReview,approvedAt}',to_jsonb(now()::text)),status='queued',error_json=null,updated_at=now() where id=p_id;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'voice.requested_review_approved',p_id::text,j.state_json->'castReview',jsonb_build_object('approvedAt',now(),'requestedAt',p_requested_at));
end $$;
revoke all on function public.admin_center_approve_voice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_center_approve_voice(uuid,uuid,text) to service_role;
