-- Atomic, retry-safe grants for the private Admin Magic Link invitation tool.
create function public.grant_magic_invite_once(p_code text,p_user_id uuid,p_email text,p_first_name text,p_last_name text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare promo public.promo_codes%rowtype; profile public.users%rowtype; end_at timestamptz; old_plan text;
begin
 if nullif(trim(p_first_name),'') is null then raise exception 'First name required'; end if;
 select * into promo from public.promo_codes where code=upper(trim(p_code)) for update;
 if not found or not promo.is_active then raise exception 'Invitation code unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into profile from public.users where id=p_user_id for update;
 if exists(select 1 from public.promo_redemptions where promo_code_id=promo.id and user_id=p_user_id) then
  return jsonb_build_object('subscription_ends_at',profile.subscription_ends_at,'already_applied',true);
 end if;
 if promo.max_uses is not null and coalesce(promo.uses_count,0)>=promo.max_uses then raise exception 'Invitation already used'; end if;
 if promo.subscription_days is null or promo.subscription_days<1 then raise exception 'Invalid invitation duration'; end if;
 end_at:=greatest(coalesce(profile.subscription_ends_at,now()),now())+make_interval(days=>promo.subscription_days);
 old_plan:=case when profile.plan is not null and profile.plan<>'free' then profile.plan else 'standard' end;
 insert into public.users(id,email,display_name,first_name,last_name,subscription_type,subscription_ends_at,plan)
 values(p_user_id,lower(trim(p_email)),trim(concat_ws(' ',p_first_name,nullif(p_last_name,''))),trim(p_first_name),nullif(trim(p_last_name),''),'active',end_at,old_plan)
 on conflict(id) do update set first_name=excluded.first_name,last_name=coalesce(excluded.last_name,users.last_name),subscription_type='active',subscription_ends_at=end_at,plan=old_plan;
 insert into public.promo_redemptions(promo_code_id,code,user_id,email,redeemed_at,days_granted,campaign,label)
 values(promo.id,promo.code,p_user_id,lower(trim(p_email)),now(),promo.subscription_days,promo.campaign,promo.label);
 update public.promo_codes set uses_count=coalesce(uses_count,0)+1,is_redeemed=(max_uses=1),sent_to_email=lower(trim(p_email)),sent_to_name=trim(p_first_name),sent_at=now() where id=promo.id;
 return jsonb_build_object('subscription_ends_at',end_at,'already_applied',false);
end $$;
revoke all on function public.grant_magic_invite_once(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.grant_magic_invite_once(text,uuid,text,text,text) to service_role;
