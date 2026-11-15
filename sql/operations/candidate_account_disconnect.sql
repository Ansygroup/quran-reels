-- CANDIDATE ONLY. Disposable tests only; not a migration, not routed.
-- Requires candidate_account_queue_target.sql and coordinated writers. The
-- intentionally conservative policy blocks *all* explicitly referenced jobs,
-- including historical rows, and all same-platform legacy NULL rows. Removing
-- records merely to bypass this guard may lose evidence and cause duplicates.
-- It deletes local credentials only; it cannot revoke the provider grant, stop
-- an upload that already has credentials, stop automation, or coordinate old
-- clients/writers by itself. A production design needs an approved retention,
-- NULL reconciliation, token revocation and worker coordination plan.
-- Security definer owner must be trusted and non-login; service only.
create or replace function public.account_disconnect_candidate(
  p_user_id uuid, p_connection_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_platform text;
  v_current_platform text;
begin
  if p_user_id is null or p_connection_id is null then
    return jsonb_build_object('outcome','invalid');
  end if;
  -- Lookup only supplies the advisory-lock key; repeat after locking.
  select c.platform into v_platform from public.social_connections c
    where c.id=p_connection_id and c.user_id=p_user_id;
  if not found or v_platform is null then return jsonb_build_object('outcome','not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || v_platform,0));
  select c.platform into v_current_platform from public.social_connections c
    where c.id=p_connection_id and c.user_id=p_user_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if v_current_platform is distinct from v_platform then
    return jsonb_build_object('outcome','conflict');
  end if;
  -- No default inference, even for a legacy published/failed row. Those rows
  -- may identify an upload already accepted on the channel being disconnected.
  if exists (select 1 from public.publish_queue q where q.user_id=p_user_id
      and q.platform=v_platform and q.connection_id is null) then
    return jsonb_build_object('outcome','legacy_unknown','platform',v_platform);
  end if;
  -- Defend against any reference, even an inconsistent cross-owner row.
  if exists (select 1 from public.publish_queue q where q.connection_id=p_connection_id) then
    return jsonb_build_object('outcome','dependent_tasks','platform',v_platform);
  end if;
  delete from public.social_connections where id=p_connection_id and user_id=p_user_id and platform=v_platform;
  if not found then raise exception 'disconnect target changed'; end if;
  return jsonb_build_object('outcome','deleted','id',p_connection_id,'platform',v_platform);
end;
$$;
revoke all on function public.account_disconnect_candidate(uuid,uuid) from public, anon, authenticated;
grant execute on function public.account_disconnect_candidate(uuid,uuid) to service_role;
