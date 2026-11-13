-- Private account images (one normalized JPEG per user, never in the public
-- reels bucket). Apply before deploying the API which uses save_custom_reel.
-- No authenticated/anon privileges: access is only through the server.
create table if not exists public.private_autopilot_backgrounds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  image_id uuid not null,
  jpeg_base64 text not null check (length(jpeg_base64) <= 699052)
);
alter table public.private_autopilot_backgrounds enable row level security;
revoke all on public.private_autopilot_backgrounds from public, anon, authenticated;
grant select, insert, update, delete on public.private_autopilot_backgrounds to service_role;

-- A regular/old-client save switching away from custom removes the private
-- image in the same transaction as the settings change. Renderers must fetch
-- by (user_id,image_id), and fail closed if an older snapshot no longer exists.
create or replace function public.cleanup_custom_reel_background()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.private_autopilot_backgrounds where user_id = old.user_id;
    return old;
  end if;
  if coalesce(new.template->>'background','') <> 'custom' then
    delete from public.private_autopilot_backgrounds where user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function public.cleanup_custom_reel_background() from public, anon, authenticated;
drop trigger if exists cleanup_custom_reel_background on public.autopilot;
create trigger cleanup_custom_reel_background after insert or update or delete on public.autopilot
for each row execute function public.cleanup_custom_reel_background();

-- Settings and image are committed or rolled back together. UPDATE on the
-- autopilot row serializes concurrent saves for an existing account. An old
-- renderer either already holds its image in memory, or fails on ID mismatch.
create or replace function public.save_custom_reel(p_config jsonb, p_image_id uuid, p_jpeg_base64 text default null)
returns setof public.autopilot language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (p_config->>'user_id')::uuid; v_config public.autopilot;
begin
  if p_config->'template'->>'background' <> 'custom' or
     p_config->'template'->>'background_image_id' <> p_image_id::text or
     p_image_id is null or v_user is null then raise exception 'invalid background'; end if;
  if p_jpeg_base64 is not null and (length(p_jpeg_base64) < 8 or length(p_jpeg_base64) > 699052) then
    raise exception 'invalid image size';
  end if;
  insert into public.autopilot(user_id, enabled, at_utc, platforms, template, all_channels, updated_at)
  values (v_user, (p_config->>'enabled')::boolean, (p_config->>'at_utc')::time,
          array(select jsonb_array_elements_text(p_config->'platforms')), p_config->'template',
          (p_config->>'all_channels')::boolean, (p_config->>'updated_at')::timestamptz)
  on conflict (user_id) do update set enabled=excluded.enabled, at_utc=excluded.at_utc,
    platforms=excluded.platforms, template=excluded.template, all_channels=excluded.all_channels, updated_at=excluded.updated_at
  returning * into v_config;
  if p_jpeg_base64 is not null then
    insert into public.private_autopilot_backgrounds(user_id,image_id,jpeg_base64)
      values(v_user,p_image_id,p_jpeg_base64)
      on conflict(user_id) do update set image_id=excluded.image_id,jpeg_base64=excluded.jpeg_base64;
  elsif not exists (select 1 from public.private_autopilot_backgrounds where user_id=v_user and image_id=p_image_id) then
    raise exception 'background not found';
  end if;
  return next v_config;
end $$;
revoke all on function public.save_custom_reel(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.save_custom_reel(jsonb, uuid, text) to service_role;

-- Make the new RPC visible to PostgREST without a manual service restart.
notify pgrst, 'reload schema';
