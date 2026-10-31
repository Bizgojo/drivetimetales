-- Disposable local fixture only; assert preparation preserves current serving behavior.
begin;
create table public.support_messages(id uuid primary key,user_id uuid,status text,admin_response text,responded_at timestamptz);
alter table public.support_messages enable row level security;
create policy "Users can view own messages" on public.support_messages for select using (true);
create table public.production_jobs(id uuid primary key,status text,error_json jsonb,state_json jsonb,locked_at timestamptz,locked_by text,updated_at timestamptz);
create table public.atlas_settings(key text primary key,value text,updated_at timestamptz,updated_by text);
insert into public.atlas_settings values ('publish_mode','direct','2026-10-11T21:09:36Z','existing');
insert into public.production_jobs(id,status,state_json) values ('00000000-0000-4000-8000-000000000001','running','{"existing":"unchanged"}');
\ir ../../supabase/migrations/20261031173103_admin_command_center.sql
\ir ../../supabase/migrations/20261031173118_admin_command_center_wiring.sql
do $$declare t text;begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='support_messages' and policyname='Users can view own messages' and qual='true')then raise exception 'Preparation changed current support policy';end if;
 if (select value from public.atlas_settings where key='publish_mode')<>'direct' or (select updated_at from public.atlas_settings where key='publish_mode')<>'2026-10-11T21:09:36Z'::timestamptz then raise exception 'Preparation changed publication setting';end if;
 if not exists(select 1 from public.production_jobs where status='running' and state_json='{"existing":"unchanged"}'::jsonb)then raise exception 'Preparation changed job';end if;
 if (select count(*) from pg_tables where schemaname='public' and tablename like 'admin_center_%')<>13 then raise exception 'Admin table preparation incomplete';end if;
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'admin_center_%' loop
 if not exists(select 1 from pg_class where oid=('public.'||t)::regclass and relrowsecurity) or has_table_privilege('anon','public.'||t,'select') or has_table_privilege('authenticated','public.'||t,'select') or not has_table_privilege('service_role','public.'||t,'select') then raise exception 'Private table access mismatch %',t;end if;
 end loop;
end $$;
select 'PASS: thirteen private tables prepared without changing inbox access, publication or running jobs' as test_result;
rollback;
