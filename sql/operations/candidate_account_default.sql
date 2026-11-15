-- CANDIDATE ONLY: isolated tests, not a migration and not wired to the app.
-- This operation serializes other callers of this function, but it does NOT
-- serialize legacy writers, queue insertion, OAuth callbacks, disconnect, or
-- workers. Do not deploy or infer end-to-end safety from this function alone.
-- Must be owned by a trusted non-login owner; only the service role may call.
create or replace function public.account_set_default_candidate(
  p_user_id uuid, p_connection_id uuid, p_expected_default uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_platform text;
  v_target uuid;
  v_current uuid;
  v_count integer;
begin
  if p_user_id is null or p_connection_id is null then
    return jsonb_build_object('outcome','invalid');
  end if;
  -- Initial lookup only obtains the lock key; recheck ownership after locking.
  select c.platform into v_platform from public.social_connections c
    where c.id=p_connection_id and c.user_id=p_user_id;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || v_platform, 0));
  -- Deterministic row locking reduces deadlocks between cooperative callers.
  perform c.id from public.social_connections c
    where c.user_id=p_user_id and c.platform=v_platform order by c.id for update;
  select c.id into v_target from public.social_connections c
    where c.id=p_connection_id and c.user_id=p_user_id and c.platform=v_platform;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  select count(*), min(c.id::text)::uuid into v_count, v_current
    from public.social_connections c
    where c.user_id=p_user_id and c.platform=v_platform and c.is_default is true;
  if v_count > 1 then return jsonb_build_object('outcome','invalid_state'); end if;
  if v_current=p_connection_id then
    return jsonb_build_object('outcome','unchanged','id',v_current,'platform',v_platform);
  end if;
  if v_current is distinct from p_expected_default then
    return jsonb_build_object('outcome','conflict','current_id',v_current,'platform',v_platform);
  end if;
  -- Changing the default would retarget legacy implicit pending work. This
  -- check is only a candidate guard: concurrent legacy inserts can race it.
  if exists (select 1 from public.publish_queue q where q.user_id=p_user_id
       and q.platform=v_platform and q.connection_id is null
       and (q.status is null or q.status not in ('published','cancelled'))) then
    return jsonb_build_object('outcome','pending_implicit','platform',v_platform);
  end if;
  update public.social_connections set is_default=false
    where user_id=p_user_id and platform=v_platform and is_default is true;
  update public.social_connections set is_default=true
    where id=p_connection_id and user_id=p_user_id and platform=v_platform;
  if not found then raise exception 'default target disappeared'; end if;
  return jsonb_build_object('outcome','updated','id',p_connection_id,'platform',v_platform);
end;
$$;
revoke all on function public.account_set_default_candidate(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.account_set_default_candidate(uuid,uuid,uuid) to service_role;
