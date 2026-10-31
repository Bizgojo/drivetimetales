-- Reviewed release only. Do not run against production before Orion's cutover gate.
create table public.admin_center_production_policies (
 version integer primary key,voices text not null check(voices in ('ai','review')),
 sfx text not null check(sfx in ('ai','review')),actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.admin_center_production_policies enable row level security;
revoke all on public.admin_center_production_policies from public,anon,authenticated;
grant all on public.admin_center_production_policies to service_role;
create function public.admin_center_production_policy(p_actor uuid,p_expected_version integer,p_publication_version timestamptz,p_publication text,p_voices text,p_sfx text) returns void
language plpgsql security invoker set search_path='' as $$
declare current_version integer; previous_publication public.atlas_settings; next_version integer;
begin
 perform pg_advisory_xact_lock(42020261030);
 if p_publication not in ('direct','rfr') or p_voices not in ('ai','review') or p_sfx not in ('ai','review') then raise exception 'Invalid production policy'; end if;
 select coalesce(max(version),0) into current_version from public.admin_center_production_policies;
 if current_version<>p_expected_version then raise exception 'Production policy changed';end if;
 select * into previous_publication from public.atlas_settings where key='publish_mode' for update;
 if previous_publication.updated_at is distinct from p_publication_version then raise exception 'Publication policy changed';end if;
 next_version:=current_version+1;
 insert into public.admin_center_production_policies(version,voices,sfx,actor_id) values(next_version,p_voices,p_sfx,p_actor);
 insert into public.atlas_settings(key,value,updated_at,updated_by) values('admin_review_policy',jsonb_build_object('voices',p_voices,'sfx',p_sfx,'version',next_version)::text,now(),p_actor::text)
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.atlas_settings(key,value,updated_at,updated_by) values('publish_mode',p_publication,now(),p_actor::text)
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'production.policy','production',jsonb_build_object('version',current_version,'publication',previous_publication.value),jsonb_build_object('version',next_version,'publication',p_publication,'voices',p_voices,'sfx',p_sfx,'reviewScope','jobs created after policy activation'));
end $$;
create function public.admin_center_review_decision(p_id uuid,p_actor uuid,p_kind text,p_fingerprint text) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.production_jobs;r jsonb;next_state jsonb;
begin
 if p_kind not in ('voice','sfx') then raise exception 'Invalid review kind';end if;
 select * into strict j from public.production_jobs where id=p_id for update;
 r:=j.state_json->'adminReviews'->p_kind;
 if j.status<>'waiting_for_external' or j.locked_by is not null or j.locked_at is not null or j.error_json->>'kind'<>('awaiting_admin_'||p_kind) or r->>'fingerprint' is distinct from p_fingerprint or r->>'approvedAt' is not null or coalesce(jsonb_array_length(r->'items'),0)=0 then raise exception 'Exact unlocked pending review required';end if;
 next_state:=jsonb_set(j.state_json,array['adminReviews',p_kind,'approvedAt'],to_jsonb(now()));
 next_state:=jsonb_set(next_state,array['adminReviews',p_kind,'approvedBy'],to_jsonb(p_actor));
 update public.production_jobs set state_json=next_state,status='queued',error_json=null,updated_at=now() where id=p_id;
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'production.review.'||p_kind,p_id::text,r,next_state->'adminReviews'->p_kind);
end $$;
revoke all on function public.admin_center_production_policy(uuid,integer,timestamptz,text,text,text),public.admin_center_review_decision(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_center_production_policy(uuid,integer,timestamptz,text,text,text),public.admin_center_review_decision(uuid,uuid,text,text) to service_role;
-- Profit-transfer preparation is durable, but schema constraints prohibit activation.
create table public.admin_center_profit_plan (
 id boolean primary key default true check(id),label text not null,destination_id text,
 schedule text not null default 'monthly_after_reconciliation' check(schedule='monthly_after_reconciliation'),
 enabled boolean not null default false check(not enabled),actor_id uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.admin_center_profit_plan enable row level security;
revoke all on public.admin_center_profit_plan from public,anon,authenticated;
grant all on public.admin_center_profit_plan to service_role;
create function public.admin_center_profit_plan_draft(p_actor uuid,p_label text,p_destination text) returns void
language plpgsql security invoker set search_path='' as $$
declare previous public.admin_center_profit_plan;begin
 if length(trim(p_label))<1 or length(p_label)>200 or length(coalesce(p_destination,''))>200 then raise exception 'Invalid preparation';end if;
 perform pg_advisory_xact_lock(42020261031);
 select * into previous from public.admin_center_profit_plan where id=true for update;
 insert into public.admin_center_profit_plan(id,label,destination_id,actor_id) values(true,trim(p_label),nullif(p_destination,''),p_actor)
 on conflict(id) do update set label=excluded.label,destination_id=excluded.destination_id,enabled=false,actor_id=excluded.actor_id,updated_at=now();
 insert into public.admin_center_audit(actor_id,action,target,before_json,after_json) values(p_actor,'profit.prepare_only','mercury',to_jsonb(previous),jsonb_build_object('label',p_label,'destinationId',p_destination,'enabled',false));
end $$;
revoke all on function public.admin_center_profit_plan_draft(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_center_profit_plan_draft(uuid,text,text) to service_role;
