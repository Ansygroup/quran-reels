-- Companion to 20261113_guarded_autopilot_settings.sql. Additive only;
-- deploy before API code which uses these RPCs.
-- Explicit pauses invalidate outstanding drafts even if the account was
-- already paused. Caller-supplied revision values are never accepted as-is.
create or replace function public.autopilot_settings_revision_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.settings_revision := gen_random_uuid();
  elsif new.settings_revision is distinct from old.settings_revision or
        (new.user_id, new.enabled, new.at_utc, new.platforms, new.template, new.all_channels)
        is distinct from (old.user_id, old.enabled, old.at_utc, old.platforms, old.template, old.all_channels) then
    new.settings_revision := gen_random_uuid();
  else
    new.settings_revision := old.settings_revision;
  end if;
  return new;
end $$;

create or replace function public.set_autopilot_enabled_guarded(
  p_user_id uuid, p_enabled boolean, p_expected_revision uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_before public.autopilot; v_after public.autopilot; v_stale boolean;
begin
  if p_user_id is null or p_enabled is null then raise exception 'invalid input'; end if;
  -- A pause on a missing row establishes a durable barrier to an older
  -- first-save or a simultaneous OAuth link creating an enabled account.
  if not p_enabled then
    insert into public.autopilot(user_id, enabled, at_utc, platforms, template, all_channels, updated_at)
      values(p_user_id, false, '04:15:00', array[]::text[], '{}'::jsonb, false, clock_timestamp())
      on conflict(user_id) do nothing;
  end if;
  select * into v_before from public.autopilot where user_id=p_user_id for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  v_stale := v_before.settings_revision is distinct from p_expected_revision;
  -- An explicit pause is always allowed even from an older tab. Enable is
  -- guarded after the API validated the same saved revision and connections.
  if p_enabled and v_stale then return jsonb_build_object('outcome','conflict'); end if;
  update public.autopilot set enabled=p_enabled, settings_revision=case when not p_enabled then gen_random_uuid() else settings_revision end, updated_at=clock_timestamp()
    where user_id=p_user_id returning * into v_after;
  return jsonb_build_object('outcome','updated','stale',v_stale,'config',to_jsonb(v_after));
end $$;
revoke all on function public.set_autopilot_enabled_guarded(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_autopilot_enabled_guarded(uuid, boolean, uuid) to service_role;

-- OAuth's original read/overwrite sequence could erase a concurrently selected
-- platform. Insert once or append against the locked current row; never enable
-- a previously paused account and never overwrite its other settings.
create or replace function public.link_autopilot_platform_guarded(
  p_user_id uuid, p_platform text, p_template jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare v_dummy uuid;
begin
  if p_user_id is null or p_platform is null or p_platform = '' or p_template is null or jsonb_typeof(p_template) <> 'object' then raise exception 'invalid input'; end if;
  insert into public.autopilot(user_id, enabled, at_utc, platforms, template, all_channels, updated_at)
    values(p_user_id, true, '04:15:00', array[p_platform], p_template, false, clock_timestamp())
    on conflict(user_id) do nothing returning user_id into v_dummy;
  if found then return 'created'; end if;
  update public.autopilot set platforms=array_append(platforms,p_platform), updated_at=clock_timestamp()
    where user_id=p_user_id and not (p_platform = any(platforms)) returning user_id into v_dummy;
  if found then return 'extended'; end if;
  return 'unchanged';
end $$;
revoke all on function public.link_autopilot_platform_guarded(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.link_autopilot_platform_guarded(uuid, text, jsonb) to service_role;
notify pgrst, 'reload schema';
