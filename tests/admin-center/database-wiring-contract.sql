-- Run ONLY against a disposable/dev database without support_messages.
-- A production database already has that table; this fixture fails before changing it.
-- Entire migration, fixtures and assertions are rolled back.
begin;
create table public.support_messages(id uuid primary key,user_id uuid,status text,admin_response text,responded_at timestamptz);
alter table public.support_messages enable row level security;
create table if not exists public.production_jobs(id uuid primary key,status text,error_json jsonb,state_json jsonb,locked_at timestamptz,locked_by text,updated_at timestamptz);
create table public.atlas_settings(key text primary key,value text,updated_at timestamptz,updated_by text);
\ir ../../supabase/migrations/20261029182953_admin_command_center.sql
\ir ../../supabase/migrations/20261030232203_admin_command_center_wiring.sql
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000004200','admin-center-test@example.invalid');
insert into public.support_messages(id,user_id,status) values('00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000004200','new');
select public.admin_center_update_policy('00000000-0000-4000-8000-000000004200',1,'{"marketingPercent":75,"essential":100,"taxes":10,"reserve":1000,"committedMarketing":4000}');
select public.admin_center_verify_policy('00000000-0000-4000-8000-000000004200',2,'TEST evidence reference');
do $$begin
 if public.admin_center_claim_reply('00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000004200','Test reply') is not true then raise exception 'Claim failed';end if;
 if public.admin_center_claim_reply('00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000004200','Duplicate reply') is not false then raise exception 'Duplicate allowed';end if;
end $$;
select public.admin_center_finish_reply('00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000004200','provider-test-only');
insert into public.admin_center_campaigns(id,name,audience,body,media_url,landing_url,budget_usd,status,created_by) values
('00000000-0000-4000-8000-000000004202','Test 1','test','ad','https://example.invalid/a.png','https://example.invalid',3000,'awaiting_approval','00000000-0000-4000-8000-000000004200'),
('00000000-0000-4000-8000-000000004203','Test 2','test','ad','https://example.invalid/a.png','https://example.invalid',2000,'awaiting_approval','00000000-0000-4000-8000-000000004200');
select public.admin_center_campaign_decision('00000000-0000-4000-8000-000000004202','00000000-0000-4000-8000-000000004200','approved');
do $$declare t text;begin
 begin
  perform public.admin_center_campaign_decision('00000000-0000-4000-8000-000000004203','00000000-0000-4000-8000-000000004200','approved');
  raise exception 'Budget guard did not run';
 exception when raise_exception then if sqlerrm<>'Test envelope exceeded' then raise;end if;end;
 begin
  perform public.admin_center_update_policy('00000000-0000-4000-8000-000000004200',1,'{}');raise exception 'Stale policy accepted';
 exception when raise_exception then if sqlerrm<>'Policy changed' then raise;end if;end;
 if(select status from public.admin_center_replies limit 1)<>'accepted' then raise exception 'Reply status incorrect';end if;
 if(select status from public.support_messages limit 1)<>'answered' then raise exception 'Support state incorrect';end if;
 if(select count(*) from public.admin_center_audit)<6 then raise exception 'Audit missing';end if;
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'admin_center_%' loop
  if has_table_privilege('anon','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'SELECT') then raise exception 'Client access: %',t;end if;
 end loop;
 if has_function_privilege('authenticated','public.admin_center_claim_reply(uuid,uuid,text)','EXECUTE') then raise exception 'Client RPC access';end if;
end $$;
insert into public.production_jobs(id,status,error_json,state_json,locked_at,locked_by,updated_at) values('00000000-0000-4000-8000-000000004204','waiting_for_external','{"kind":"awaiting_cast_approval"}','{"castReview":{"requestedAt":"fixture-review","approvedAt":null}}',null,null,now());
select public.admin_center_approve_voice('00000000-0000-4000-8000-000000004204','00000000-0000-4000-8000-000000004200','fixture-review');
do $$begin
 if(select status from public.production_jobs where id='00000000-0000-4000-8000-000000004204')<>'queued' then raise exception 'Approved review did not resume';end if;
 begin perform public.admin_center_approve_voice('00000000-0000-4000-8000-000000004204','00000000-0000-4000-8000-000000004200','fixture-review');raise exception 'Repeated voice approval accepted';
 exception when raise_exception then if sqlerrm<>'No current unlocked cast review' then raise;end if;end;
end $$;
select 'PASS: full schema, requested voice approval, policy version/attestation, reply idempotency/acceptance, campaign envelope, audit records, client isolation' as test_result;


select public.admin_center_production_policy('00000000-0000-4000-8000-000000004200',0,null,'direct','review','review');
insert into public.production_jobs(id,status,error_json,state_json,locked_at,locked_by,updated_at) values('00000000-0000-4000-8000-000000004210','waiting_for_external','{"kind":"awaiting_admin_sfx"}',jsonb_build_object('adminReviews',jsonb_build_object('sfx',jsonb_build_object('fingerprint',repeat('a',64),'approvedAt',null,'items',jsonb_build_array(jsonb_build_object('name','effect'))))),null,null,now());
do $$ begin
 begin perform public.admin_center_production_policy('00000000-0000-4000-8000-000000004200',0,null,'rfr','ai','ai'); raise exception 'Stale production policy accepted'; exception when raise_exception then if sqlerrm<>'Production policy changed' then raise;end if;end;
 begin perform public.admin_center_review_decision('00000000-0000-4000-8000-000000004210','00000000-0000-4000-8000-000000004200','sfx',repeat('b',64));raise exception 'Changed review accepted';exception when raise_exception then if sqlerrm<>'Exact unlocked pending review required' then raise;end if;end;
end $$;
update public.production_jobs set locked_by='test-worker',locked_at=now() where id='00000000-0000-4000-8000-000000004210';
do $$ begin
 begin perform public.admin_center_review_decision('00000000-0000-4000-8000-000000004210','00000000-0000-4000-8000-000000004200','sfx',repeat('a',64));raise exception 'Locked review accepted';exception when raise_exception then if sqlerrm<>'Exact unlocked pending review required' then raise;end if;end;
end $$;
update public.production_jobs set locked_by=null,locked_at=null where id='00000000-0000-4000-8000-000000004210';
select public.admin_center_review_decision('00000000-0000-4000-8000-000000004210','00000000-0000-4000-8000-000000004200','sfx',repeat('a',64));
do $$ begin
 if (select status from public.production_jobs where id='00000000-0000-4000-8000-000000004210')<>'queued' then raise exception 'SFX approval did not resume same job';end if;
 if has_table_privilege('authenticated','public.admin_center_production_policies','SELECT') then raise exception 'Review policy exposed';end if;
 if has_function_privilege('anon','public.admin_center_review_decision(uuid,uuid,text,text)','EXECUTE') then raise exception 'Review RPC exposed';end if;
 begin perform public.admin_center_review_decision('00000000-0000-4000-8000-000000004210','00000000-0000-4000-8000-000000004200','sfx',repeat('a',64));raise exception 'Repeated SFX approval accepted';exception when raise_exception then if sqlerrm<>'Exact unlocked pending review required' then raise;end if;end;
end $$;
select 'PASS: production CAS, policy history, review fingerprints, active lock protection, single resume and role isolation' as test_result;

select public.admin_center_profit_plan_draft('00000000-0000-4000-8000-000000004200','Fixture profit recipient',null);
do $$ begin
 if (select enabled from public.admin_center_profit_plan where id=true) then raise exception 'Transfer was enabled';end if;
 begin update public.admin_center_profit_plan set enabled=true where id=true;raise exception 'Transfer activation allowed';exception when check_violation then null;end;
 if has_function_privilege('anon','public.admin_center_profit_plan_draft(uuid,text,text)','EXECUTE') then raise exception 'Profit plan exposed';end if;
end $$;
select 'PASS: profit plan is durable and cannot activate transfers' as test_result;
rollback;
