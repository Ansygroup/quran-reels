-- CANDIDATE ONLY: manual, not a migration; do not apply to production without
-- an approved rollout and isolated PostgREST tests. Run only AFTER the guarded
-- functions, new API, and candidate_autopilot_client_write_revoke.sql.
-- This intentionally breaks old unguarded saves/enables/OAuth writes and the
-- legacy image RPC. It preserves old direct pauses on EXISTING rows and the
-- scheduler's updated_at-only write. No rows or images are modified here.
begin;

-- The SECURITY DEFINER functions must execute as a different, non-assumable
-- owner, not as service_role. Old service keys remain trusted to call these
-- functions for arbitrary users; application authentication remains essential.
do $$
declare fn regprocedure; owner_name text; is_definer boolean; r text; p text; tab regclass;
begin
  if (select rolsuper from pg_catalog.pg_roles where rolname='service_role') then
    raise exception 'service_role must not be a superuser';
  end if;
  foreach tab in array array['public.autopilot'::regclass,'public.private_autopilot_backgrounds'::regclass] loop
    select pg_catalog.pg_get_userbyid(relowner) into owner_name from pg_catalog.pg_class where oid=tab;
    if pg_catalog.pg_has_role('service_role',owner_name,'MEMBER') then
      raise exception 'service_role can assume owner of %', tab;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.autopilot'::regclass
      and tgname='autopilot_settings_revision' and tgenabled='O' and not tgisinternal
      and tgfoid='public.autopilot_settings_revision_trigger()'::regprocedure) then
    raise exception 'revision trigger is missing or disabled';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.autopilot'::regclass and not tgisinternal
      and (tgtype::integer & 2) <> 0 and (tgtype::integer & 16) <> 0
      and tgname not in ('autopilot_settings_revision','autopilot_legacy_pause_only')) then
    raise exception 'unexpected before-update trigger requires review';
  end if;
  foreach fn in array array[
    'public.save_autopilot_guarded(jsonb,uuid,uuid,text)'::regprocedure,
    'public.set_autopilot_enabled_guarded(uuid,boolean,uuid)'::regprocedure,
    'public.link_autopilot_platform_guarded(uuid,text,jsonb)'::regprocedure
  ] loop
    select pg_catalog.pg_get_userbyid(proowner), prosecdef into owner_name, is_definer from pg_catalog.pg_proc where oid=fn;
    if not is_definer or pg_catalog.pg_has_role('service_role',owner_name,'MEMBER') then
      raise exception 'unsafe owner/security for %', fn;
    end if;
  end loop;
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if has_table_privilege(r, 'public.autopilot', p) then raise exception 'client % retains table privilege %',r,p; end if;
    end loop;
    foreach p in array array['INSERT','UPDATE','REFERENCES'] loop
      if has_any_column_privilege(r, 'public.autopilot', p) then raise exception 'client % retains column privilege %',r,p; end if;
    end loop;
  end loop;
end $$;

-- UPDATE OF enabled triggers even when the account is already off. Executed
-- as invoker: a guarded SECURITY DEFINER RPC runs as its owner, while a legacy
-- direct PATCH runs as service_role. Name sorts before revision trigger.
create or replace function public.autopilot_legacy_pause_only()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user = 'service_role' then
    if new.enabled is distinct from false or
       (to_jsonb(new) - 'enabled' - 'updated_at') is distinct from (to_jsonb(old) - 'enabled' - 'updated_at') then
      raise exception 'direct settings update is not allowed';
    end if;
    new.settings_revision := pg_catalog.gen_random_uuid();
  end if;
  return new;
end $$;
revoke all on function public.autopilot_legacy_pause_only() from public, anon, authenticated, service_role;
drop trigger if exists autopilot_legacy_pause_only on public.autopilot;
create trigger autopilot_legacy_pause_only before update of enabled on public.autopilot
for each row execute function public.autopilot_legacy_pause_only();

revoke insert, update, delete, truncate, references, trigger, maintain
  on public.autopilot, public.private_autopilot_backgrounds from public, anon, authenticated, service_role;
-- Remove any separate column-level grants, not just table grants.
do $$
declare tab regclass; cols text;
begin
  foreach tab in array array['public.autopilot'::regclass,'public.private_autopilot_backgrounds'::regclass] loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
      from pg_catalog.pg_attribute where attrelid=tab and attnum>0 and not attisdropped;
    if cols is not null then
      execute format('revoke insert (%s), update (%s), references (%s) on table %s from public, anon, authenticated, service_role',cols,cols,cols,tab);
    end if;
  end loop;
end $$;
grant update (enabled, updated_at) on public.autopilot to service_role;
revoke execute on function public.save_custom_reel(jsonb, uuid, text) from public, anon, authenticated, service_role;

-- Abort rather than silently accept inherited privileges or unexpected roles.
do $$
declare tab regclass; p text; col text; client_role text;
begin
  foreach tab in array array['public.autopilot'::regclass,'public.private_autopilot_backgrounds'::regclass] loop
    foreach client_role in array array['anon','authenticated'] loop
      foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(client_role,tab,p) then raise exception 'client % retains table privilege % on %',client_role,p,tab; end if;
      end loop;
      foreach p in array array['INSERT','UPDATE','REFERENCES'] loop
        if has_any_column_privilege(client_role,tab,p) then raise exception 'client % retains column privilege % on %',client_role,p,tab; end if;
      end loop;
    end loop;
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if has_table_privilege('service_role',tab,p) then raise exception 'service_role retains table privilege % on %',p,tab; end if;
    end loop;
    foreach p in array array['INSERT','REFERENCES'] loop
      if has_any_column_privilege('service_role',tab,p) then raise exception 'service_role retains column privilege % on %',p,tab; end if;
    end loop;
    for col in select attname from pg_catalog.pg_attribute where attrelid=tab and attnum>0 and not attisdropped loop
      if has_column_privilege('service_role',tab,col,'UPDATE') and
         not (tab='public.autopilot'::regclass and col in ('enabled','updated_at')) then
        raise exception 'service_role retains update privilege on %.%',tab,col;
      end if;
    end loop;
  end loop;
  if has_function_privilege('service_role','public.save_custom_reel(jsonb,uuid,text)','EXECUTE') then
    raise exception 'legacy image RPC still executable by service_role';
  end if;
  if not has_column_privilege('service_role','public.autopilot','enabled','UPDATE') or
     not has_column_privilege('service_role','public.autopilot','updated_at','UPDATE') then
    raise exception 'legacy pause/bookkeeping privileges missing';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
