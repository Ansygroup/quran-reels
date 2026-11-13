-- Additive foundation for optimistic concurrency in account settings.
-- Deploy this migration before any API/client that depends on the new RPC.
-- Existing writers remain compatible; this migration does not enforce CAS on them.
alter table public.autopilot
  add column if not exists settings_revision uuid not null default gen_random_uuid();

-- Updated_at is also touched by the scheduler; it is not a settings version.
-- Never accept a caller-supplied revision on insert or update. Change it only
-- when settings or ownership change, so scheduler bookkeeping is harmless.
create or replace function public.autopilot_settings_revision_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.settings_revision := gen_random_uuid();
  elsif (new.user_id, new.enabled, new.at_utc, new.platforms, new.template, new.all_channels)
       is distinct from (old.user_id, old.enabled, old.at_utc, old.platforms, old.template, old.all_channels) then
    new.settings_revision := gen_random_uuid();
  else
    new.settings_revision := old.settings_revision;
  end if;
  return new;
end $$;
revoke all on function public.autopilot_settings_revision_trigger() from public, anon, authenticated;
drop trigger if exists autopilot_settings_revision on public.autopilot;
create trigger autopilot_settings_revision before insert or update on public.autopilot
for each row execute function public.autopilot_settings_revision_trigger();

-- An expected NULL means the client observed no row. A non-NULL UUID means it
-- observed that exact revision. Returning zero rows means a conflict, never a
-- successful save. Row update/insert and private image changes share a single
-- transaction; invalid or missing images roll back the settings update.
-- Only the trusted server may call this function. Validate the full template,
-- platform list, image contents and authenticated user in the API before use.
create or replace function public.save_autopilot_guarded(
  p_config jsonb, p_expected_revision uuid, p_image_id uuid default null, p_jpeg_base64 text default null
) returns setof public.autopilot
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (p_config->>'user_id')::uuid;
  v_custom boolean := coalesce(p_config->'template'->>'background' = 'custom', false);
  v_config public.autopilot;
begin
  if v_user is null or p_config->'template' is null or jsonb_typeof(p_config->'template') <> 'object' then
    raise exception 'invalid settings';
  end if;
  if v_custom then
    if p_image_id is null or p_config->'template'->>'background_image_id' is distinct from p_image_id::text then
      raise exception 'invalid background';
    end if;
    if p_jpeg_base64 is not null and (length(p_jpeg_base64) < 8 or length(p_jpeg_base64) > 699052) then
      raise exception 'invalid image size';
    end if;
  elsif p_image_id is not null or p_jpeg_base64 is not null then
    raise exception 'unexpected background';
  end if;

  if p_expected_revision is null then
    insert into public.autopilot(user_id, enabled, at_utc, platforms, template, all_channels, updated_at)
    values (v_user, (p_config->>'enabled')::boolean, (p_config->>'at_utc')::time,
            array(select jsonb_array_elements_text(p_config->'platforms')), p_config->'template',
            (p_config->>'all_channels')::boolean, clock_timestamp())
    on conflict (user_id) do nothing
    returning * into v_config;
  else
    update public.autopilot a set enabled=(p_config->>'enabled')::boolean,
      at_utc=(p_config->>'at_utc')::time,
      platforms=array(select jsonb_array_elements_text(p_config->'platforms')),
      template=p_config->'template', all_channels=(p_config->>'all_channels')::boolean,
      updated_at=clock_timestamp()
    where a.user_id=v_user and a.settings_revision=p_expected_revision
    returning a.* into v_config;
  end if;
  if not found then return; end if;

  if v_custom then
    if p_jpeg_base64 is not null then
      -- A replacement must use a fresh id so the settings revision changes too.
      -- The API already creates a new UUID for every upload.
      if exists (select 1 from public.private_autopilot_backgrounds where user_id=v_user and image_id=p_image_id) then
        raise exception 'background id must be new';
      end if;
      insert into public.private_autopilot_backgrounds(user_id,image_id,jpeg_base64)
      values(v_user,p_image_id,p_jpeg_base64)
      on conflict(user_id) do update set image_id=excluded.image_id,jpeg_base64=excluded.jpeg_base64;
    elsif not exists (select 1 from public.private_autopilot_backgrounds where user_id=v_user and image_id=p_image_id) then
      raise exception 'background not found';
    end if;
  end if;
  return next v_config;
end $$;
revoke all on function public.save_autopilot_guarded(jsonb, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.save_autopilot_guarded(jsonb, uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
